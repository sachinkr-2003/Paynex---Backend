import User from '../models/user.model.js';
import Deposit from '../models/deposit.model.js';
import Withdrawal from '../models/withdrawal.model.js';
import StakingRound from '../models/stakingRound.model.js';
import Plan from '../models/plan.model.js';
import Setting from '../models/setting.model.js';
import Asset from '../models/asset.model.js';
import { G1, G2, G3, G4, G5, getAssetGroup } from './asset.controller.js';
import { distributeDailyInterest } from '../services/interestScheduler.js';

// @desc    Get complete Master Dashboard KPIs
// @route   GET /api/admin/dashboard-kpis
export const getDashboardKPIs = async (req, res) => {
  try {
    const totalTraders = await User.countDocuments({ role: 'user' });

    // Pending deposits & withdrawals
    const pendingDeposits = await Deposit.find({ status: 'Pending' });
    const pendingWithdrawals = await Withdrawal.find({ status: 'Pending' });

    const pendingWithdrawalsAmount = pendingWithdrawals.reduce((sum, w) => sum + w.amount, 0);

    // 24h deposits
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const approvedDeposits24h = await Deposit.find({
      status: 'Approved',
      createdAt: { $gte: oneDayAgo },
    });
    const depositsToday = approvedDeposits24h.reduce((sum, d) => sum + d.amount, 0);

    // Live staking pool
    const activeRounds = await StakingRound.find({ status: 'Active' });
    const liveStakingPool = activeRounds.reduce((sum, r) => sum + r.payout, 0);

    // Total user money invested (Inflow: real deposits approved into treasury + real stakes placed)
    const allApprovedDeposits = await Deposit.find({ status: 'Approved' });
    const totalDepositsApproved = allApprovedDeposits.reduce((sum, d) => sum + (d.amount || 0), 0);

    const allStakes = await StakingRound.find();
    const totalStakeVol = allStakes.reduce((sum, r) => sum + (r.stakedAmount || 0), 0);
    const activeStakeVol = allStakes.filter((r) => r.status === 'Active').reduce((sum, r) => sum + (r.stakedAmount || 0), 0);

    const allUsers = await User.find({ role: 'user' });
    const totalStakedByUsers = allUsers.reduce((sum, u) => sum + (Number(u.totalStaked) || 0), 0);

    // Accurate calculation: accounts for direct approved deposits as well as real stakes funded via wallet/credits
    const totalUserInvested = Math.max(totalDepositsApproved, totalStakeVol, totalStakedByUsers);

    // Total money given to users (Outflow: real bank/UPI withdrawals disbursed from treasury)
    const allApprovedWithdrawals = await Withdrawal.find({ status: { $in: ['Approved', 'Completed'] } });
    const totalWithdrawalsPaid = allApprovedWithdrawals.reduce((sum, w) => sum + (w.amount || 0), 0);
    const totalPaidOut = totalWithdrawalsPaid;

    // Net platform profit / balance
    const netPlatformProfit = totalUserInvested - totalPaidOut;

    const totalPlatformVolume = Math.max(totalDepositsApproved + totalStakeVol, totalUserInvested);

    const settings = await Setting.findOne({ key: 'main_config' });

    return res.status(200).json({
      success: true,
      kpis: {
        totalPlatformVolume,
        totalUserInvested,
        totalPaidOut,
        netPlatformProfit,
        liveStakingPool,
        totalTraders,
        activeTradersNow: totalTraders > 0 ? 1 : 0,
        depositsToday,
        pendingWithdrawalsCount: pendingWithdrawals.length,
        pendingWithdrawalsAmount,
        adminProfitPercent: settings?.defaultGameProfitPercent || 30,
        reserveBalance: settings?.reserveBalance || 0,
      },
    });
  } catch (error) {
    console.error('KPIs error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    List all traders with filters
// @route   GET /api/admin/users
export const getAllTraders = async (req, res) => {
  try {
    const { search, kyc, status } = req.query;

    const query = { role: 'user' };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { uid: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    if (kyc && kyc !== 'All') {
      query.kycStatus = kyc;
    }

    if (status === 'Active') {
      query.isBanned = false;
    } else if (status === 'Banned') {
      query.isBanned = true;
    }

    const users = await User.find(query).sort({ createdAt: -1 });

    // Aggregate real staking / contract activity and approved deposits per trader
    const userIds = users.map((u) => u._id);
    const traderUids = users.map((u) => u.uid).filter(Boolean);

    const [allRounds, allApprovedDeps] = await Promise.all([
      StakingRound.find({
        $or: [{ userId: { $in: userIds } }, { traderUid: { $in: traderUids } }],
      }),
      Deposit.find({
        status: 'Approved',
        $or: [{ userId: { $in: userIds } }, { traderUid: { $in: traderUids } }],
      }),
    ]);

    const traders = users.map((user) => {
      const uObj = user.toObject();
      const userRounds = allRounds.filter(
        (r) =>
          (r.userId && r.userId.toString() === user._id.toString()) ||
          (r.traderUid && r.traderUid === user.uid)
      );

      const userDeps = allApprovedDeps.filter(
        (d) =>
          (d.userId && d.userId.toString() === user._id.toString()) ||
          (d.traderUid && d.traderUid === user.uid)
      );

      const realTotalStaked = userRounds.reduce((sum, r) => sum + (Number(r.stakedAmount) || 0), 0);
      const activeContracts = userRounds.filter((r) => r.status === 'Active');
      const inContractAmount = activeContracts.reduce((sum, r) => sum + (Number(r.stakedAmount) || 0), 0);

      const realTotalPayout = userRounds.reduce((sum, r) => {
        const staked = Number(r.stakedAmount) || 0;
        const earned = Number(r.totalInterestEarned || 0);
        const profit = r.status === 'Active' ? earned : (Number(r.profit) || earned);
        return sum + staked + profit;
      }, 0);

      const realTotalEarned = userRounds.reduce((sum, r) => {
        const earned = Number(r.totalInterestEarned || 0);
        return sum + (r.status === 'Active' ? earned : (Number(r.profit) || earned));
      }, 0);

      const totalDeposited = userDeps.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

      const finalTotalStaked = realTotalStaked > 0 ? realTotalStaked : (uObj.totalStaked || 0);
      const finalTotalWon = realTotalEarned;

      // Async update user record in DB if out of sync
      if ((!uObj.totalStaked || uObj.totalStaked === 0) && realTotalStaked > 0) {
        User.updateOne(
          { _id: user._id },
          { $set: { totalStaked: finalTotalStaked, totalWon: finalTotalWon } }
        ).catch(() => {});
      }

      return {
        ...uObj,
        totalStaked: finalTotalStaked,
        totalWon: finalTotalWon,
        inContractAmount,
        totalDeposited,
      };
    });

    return res.status(200).json({ success: true, count: traders.length, traders });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Adjust trader wallet balance (+Credit / -Debit)
// @route   PUT /api/admin/users/:id/balance
export const adjustUserBalance = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, type } = req.body; // type: 'credit' | 'debit'

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Please provide a valid adjustment amount.' });
    }

    const user = await User.findOne({ $or: [{ _id: id }, { uid: id }] });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Trader not found.' });
    }

    if (type === 'credit') {
      user.balance += numAmount;
    } else {
      user.balance = Math.max(0, user.balance - numAmount);
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: `₹${numAmount.toLocaleString('en-IN')} ${type === 'credit' ? 'credited to' : 'debited from'} ${user.name}'s wallet.`,
      newBalance: user.balance,
      user,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update user status (Ban/Unban or KYC)
// @route   PUT /api/admin/users/:id/status
export const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isBanned, kycStatus } = req.body;

    const user = await User.findOne({ $or: [{ _id: id }, { uid: id }] });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Trader not found.' });
    }

    if (isBanned !== undefined) user.isBanned = isBanned;
    if (kycStatus) user.kycStatus = kycStatus;

    await user.save();

    return res.status(200).json({
      success: true,
      message: `Status updated for ${user.name}`,
      user,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    List all deposits
// @route   GET /api/admin/deposits
export const getAllDeposits = async (req, res) => {
  try {
    const { search, status } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { traderName: { $regex: search, $options: 'i' } },
        { traderUid: { $regex: search, $options: 'i' } },
        { utr: { $regex: search, $options: 'i' } },
        { id: { $regex: search, $options: 'i' } },
      ];
    }

    if (status && status !== 'All') {
      query.status = status;
    } else {
      // Hide uninitiated or failed junk sessions
      query.status = { $in: ['Verified', 'Under Review', 'Approved', 'Success', 'Rejected', 'Pending'] };
    }

    const deposits = await Deposit.find(query).sort({ createdAt: -1 });

    return res.status(200).json({ success: true, count: deposits.length, deposits });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Approve deposit & auto-credit trader wallet
// @route   PUT /api/admin/deposits/:id/approve
export const approveDeposit = async (req, res) => {
  try {
    const { id } = req.params;
    let queryConditions = [{ id: id }, { utr: id }];
    if (/^[0-9a-fA-F]{24}$/.test(id)) {
      queryConditions.push({ _id: id });
    }
    const deposit = await Deposit.findOne({ $or: queryConditions });

    if (!deposit) {
      return res.status(404).json({ success: false, message: 'Deposit record not found.' });
    }

    if (deposit.status === 'Approved' || deposit.status === 'Success') {
      return res.status(400).json({ success: false, message: 'Deposit has already been approved.' });
    }

    if (deposit.status === 'Failed' || deposit.status === 'Expired') {
      return res.status(400).json({
        success: false,
        message: 'Security Alert: This deposit was rejected by the banking switch and cannot be approved.',
      });
    }

    deposit.status = 'Approved';
    await deposit.save();

    // Auto credit to trader wallet balance or activate stock contract
    const user = await User.findById(deposit.userId);
    let referralMsg = '';
    if (user) {
      // 5% FIRST DEPOSIT REFERRAL COMMISSION
      if (user.referredBy && !user.firstDepositBonusGiven) {
        try {
          const referrer = await User.findById(user.referredBy);
          if (referrer) {
            const bonus = Number((deposit.amount * 0.05).toFixed(2));
            referrer.balance += bonus;
            referrer.referralEarnings = (referrer.referralEarnings || 0) + bonus;
            await referrer.save();
            user.firstDepositBonusGiven = true;
            referralMsg = ` (🎁 ₹${bonus.toLocaleString('en-IN')} [5%] referral bonus credited to ${referrer.name})`;
          }
        } catch (refErr) {
          console.error('Referral bonus credit error:', refErr);
        }
      }

      user.hasDeposited = true;

      // Auto-activate real staking contract if deposit was submitted for stock purchase
      const targetStock = deposit.companyId || deposit.stockSymbol || (deposit.method && deposit.method.includes('Stock Purchase (') ? deposit.method.match(/Stock Purchase \(([^)]+)\)/)?.[1] : null);
      if (targetStock) {
        try {
          const matchedAsset = await Asset.findOne({
            $or: [{ id: targetStock }, { symbol: targetStock.toUpperCase() }, { name: targetStock }]
          });
          const settings = await Setting.findOne({ key: 'main_config' });
          const grp = getAssetGroup(matchedAsset);
          const groupRate = (settings?.groupInterestRates && settings.groupInterestRates[grp] !== undefined && settings.groupInterestRates[grp] !== null)
            ? Number(settings.groupInterestRates[grp])
            : null;
          const returnRate = Math.min(12, Math.max(2, groupRate ?? matchedAsset?.returnPercent ?? settings?.defaultGameProfitPercent ?? 5));
          const profit = Math.round((deposit.amount * returnRate) / 100);
          const payout = deposit.amount + profit;
          const dailyInterest = Math.max(1, Math.round((deposit.amount * returnRate) / 100));

          const cleanSym = matchedAsset?.symbol || targetStock;
          await StakingRound.create({
            userId: user._id,
            traderUid: user.uid,
            traderName: user.name,
            asset: cleanSym,
            stakedAmount: deposit.amount,
            returnPercent: returnRate,
            profit: 0, // Profit is strictly 0 until 5:00 AM distribution
            payout: deposit.amount, // Principal only until 5:00 AM distribution
            dailyInterest,
            totalInterestEarned: 0,
            daysCredited: 0,
            durationSeconds: 30,
            status: 'Active',
            startTime: new Date(),
          });
          console.log(`✅ Real payment approved: Auto-activated separate ${cleanSym} contract (₹${deposit.amount}, +${returnRate}%) for ${user.name}`);
        } catch (stkErr) {
          console.warn('Auto stock contract activation notice:', stkErr.message);
        }
        // Since funds were used to buy the stock contract, track in totalStaked (profit/won credits at 5:00 AM)
        user.totalStaked = (user.totalStaked || 0) + deposit.amount;
        await user.save();
      } else {
        // Regular wallet recharge: credit to available balance
        user.balance += deposit.amount;
        await user.save();
      }
    }

    // Two-way sync to GatewayOrder
    try {
      const GatewayOrder = (await import('../models/gatewayOrder.model.js')).default;
      await GatewayOrder.findOneAndUpdate(
        { transactionId: deposit.id },
        { status: 'Success', verifiedAt: new Date() }
      );
    } catch (_) {}

    return res.status(200).json({
      success: true,
      message: `Deposit of ₹${deposit.amount.toLocaleString('en-IN')} approved and credited to ${deposit.traderName}!${referralMsg}`,
      deposit,
      newBalance: user?.balance,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Reject deposit
// @route   PUT /api/admin/deposits/:id/reject
export const rejectDeposit = async (req, res) => {
  try {
    const { id } = req.params;
    let queryConditions = [{ id: id }, { utr: id }];
    if (/^[0-9a-fA-F]{24}$/.test(id)) {
      queryConditions.push({ _id: id });
    }
    const deposit = await Deposit.findOne({ $or: queryConditions });

    if (!deposit) {
      return res.status(404).json({ success: false, message: 'Deposit record not found.' });
    }

    deposit.status = 'Rejected';
    await deposit.save();

    // Two-way sync to GatewayOrder
    try {
      const GatewayOrder = (await import('../models/gatewayOrder.model.js')).default;
      await GatewayOrder.findOneAndUpdate(
        { transactionId: deposit.id },
        { status: 'Failed', verifiedAt: new Date() }
      );
    } catch (_) {}

    return res.status(200).json({
      success: true,
      message: `Deposit ${deposit.id} marked as Rejected.`,
      deposit,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    List all withdrawals
// @route   GET /api/admin/withdrawals
export const getAllWithdrawals = async (req, res) => {
  try {
    const { search, status } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { traderName: { $regex: search, $options: 'i' } },
        { traderUid: { $regex: search, $options: 'i' } },
        { id: { $regex: search, $options: 'i' } },
        { upiId: { $regex: search, $options: 'i' } },
        { impsRef: { $regex: search, $options: 'i' } },
      ];
    }

    if (status && status !== 'All') {
      query.status = status;
    }

    const withdrawals = await Withdrawal.find(query).sort({ createdAt: -1 });

    const processedWithdrawals = withdrawals.map((w) => {
      const doc = w.toObject ? w.toObject() : { ...w };
      if (!doc.payoutQrCode) {
        const targetUpi = (doc.upiId || '').trim();
        const targetAcc = (doc.accountNumber || '').trim();
        const targetIfsc = (doc.ifsc || '').trim();
        const payee = encodeURIComponent(doc.traderName || 'Trader');
        const amt = Number(doc.amount || 0);

        let upiString = '';
        if (targetUpi) {
          upiString = `upi://pay?pa=${targetUpi}&pn=${payee}&am=${amt}&cu=INR&tn=${encodeURIComponent(`Payout ${doc.traderUid || doc.id}`)}`;
        } else if (targetAcc && targetIfsc) {
          upiString = `upi://pay?pa=${targetAcc}@${targetIfsc}.ifsc.npci&pn=${payee}&am=${amt}&cu=INR&tn=${encodeURIComponent(`Bank Payout ${doc.id}`)}`;
        } else {
          upiString = `upi://pay?pn=${payee}&am=${amt}&cu=INR`;
        }
        doc.payoutQrCode = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(upiString)}`;
        doc.payoutUpiString = upiString;
      }
      return doc;
    });

    return res.status(200).json({ success: true, count: processedWithdrawals.length, withdrawals: processedWithdrawals });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Release withdrawal with IMPS reference
// @route   PUT /api/admin/withdrawals/:id/release
export const releaseWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    let queryConditions = [{ id: id }];
    if (/^[0-9a-fA-F]{24}$/.test(id)) {
      queryConditions.push({ _id: id });
    }
    const withdrawal = await Withdrawal.findOne({ $or: queryConditions });

    if (!withdrawal) {
      return res.status(404).json({ success: false, message: 'Withdrawal not found.' });
    }

    if (withdrawal.status === 'Completed') {
      return res.status(400).json({ success: false, message: 'Withdrawal is already completed.' });
    }

    const generatedImps = req.body?.impsRef || `IMPS${Date.now().toString().slice(-8)}`;
    withdrawal.status = 'Completed';
    withdrawal.impsRef = generatedImps;
    await withdrawal.save();

    return res.status(200).json({
      success: true,
      message: `Payout of ₹${withdrawal.amount.toLocaleString('en-IN')} dispatched via IMPS (${generatedImps})!`,
      withdrawal,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Reject withdrawal & auto-refund held balance
// @route   PUT /api/admin/withdrawals/:id/reject
export const rejectWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    let queryConditions = [{ id: id }];
    if (/^[0-9a-fA-F]{24}$/.test(id)) {
      queryConditions.push({ _id: id });
    }
    const withdrawal = await Withdrawal.findOne({ $or: queryConditions });

    if (!withdrawal) {
      return res.status(404).json({ success: false, message: 'Withdrawal not found.' });
    }

    withdrawal.status = 'Rejected';
    await withdrawal.save();

    // Refund funds back to user wallet
    const user = await User.findById(withdrawal.userId);
    if (user) {
      user.balance += withdrawal.amount;
      await user.save();
    }

    return res.status(200).json({
      success: true,
      message: `Withdrawal rejected. ₹${withdrawal.amount.toLocaleString('en-IN')} refunded to ${withdrawal.traderName}'s wallet.`,
      withdrawal,
      newBalance: user?.balance,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update Fixed Return Engine rate (+30%)
// @route   PUT /api/admin/engine/rate
export const updateEngineRate = async (req, res) => {
  try {
    const { rate, profitPercent } = req.body;
    const rawNum = Number(rate ?? profitPercent);
    const numRate = Math.min(12, Math.max(2, rawNum || 12));

    let settings = await Setting.findOne({ key: 'main_config' });
    if (!settings) {
      settings = await Setting.create({ defaultGameProfitPercent: numRate });
    } else {
      settings.defaultGameProfitPercent = numRate;
      await settings.save();
    }

    // Also update all assets in MongoDB so they inherit the new Admin rate immediately
    await Asset.updateMany({}, { $set: { returnPercent: numRate } });

    return res.status(200).json({
      success: true,
      message: `⚡ Staking Return Engine rate updated to +${numRate}% Guaranteed!`,
      rate: numRate,
      returnPercent: numRate,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get and Update System Settings
// @route   GET & PUT /api/admin/settings
export const getSettings = async (req, res) => {
  try {
    let settings = await Setting.findOne({ key: 'main_config' });
    if (!settings) {
      settings = await Setting.create({});
    }
    return res.status(200).json({ success: true, settings });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateSettings = async (req, res) => {
  try {
    const updates = req.body;
    let settings = await Setting.findOneAndUpdate({ key: 'main_config' }, updates, {
      new: true,
      upsert: true,
    });

    // If defaultGameProfitPercent updated, sync all assets in MongoDB
    if (updates.defaultGameProfitPercent) {
      const cleanRate = Math.min(12, Math.max(2, Number(updates.defaultGameProfitPercent) || 12));
      await Asset.updateMany({}, { $set: { returnPercent: cleanRate } });
    }

    // If groupInterestRates updated, sync group assets in MongoDB
    if (updates.groupInterestRates && typeof updates.groupInterestRates === 'object') {
      const groupsList = [G1, G2, G3, G4, G5];
      for (const [grp, val] of Object.entries(updates.groupInterestRates)) {
        const gNum = Number(grp);
        const cleanRate = Math.min(12, Math.max(2, Number(val) || 5));
        const syms = groupsList[gNum - 1] || [];
        await Asset.updateMany(
          { $or: [{ group: gNum }, { symbol: { $in: syms } }, { id: { $in: syms } }] },
          { $set: { returnPercent: cleanRate, group: gNum } }
        );
      }
    }

    // If groupQrs updated, sync group QR code in MongoDB for all assets in that group
    if (updates.groupQrs && typeof updates.groupQrs === 'object') {
      const groupsList = [G1, G2, G3, G4, G5];
      for (const [grp, qr] of Object.entries(updates.groupQrs)) {
        const gNum = Number(grp);
        const cleanQr = (qr || '').trim();
        const syms = groupsList[gNum - 1] || [];
        await Asset.updateMany(
          { $or: [{ group: gNum }, { symbol: { $in: syms } }, { id: { $in: syms } }] },
          { $set: { qrCode: cleanQr, group: gNum } }
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: 'System settings saved successfully.',
      settings,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Trigger 5:00 AM Daily Stock Interest Distribution (Manual / Test Trigger)
// @route   POST /api/admin/distribute-daily-interest
export const triggerDailyInterest = async (req, res) => {
  try {
    const force = req.body?.force === true || req.query?.force === 'true';
    const result = await distributeDailyInterest({ force });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Admin Reset User Password Directly
// @route   PUT /api/admin/users/:id/reset-password
export const adminResetUserPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    const cleanPassword = (newPassword || 'trader123').trim();

    if (cleanPassword.length < 4) {
      return res.status(400).json({ success: false, message: 'Password must be at least 4 characters long.' });
    }

    const user = await User.findOne({ $or: [{ _id: id }, { uid: id }] });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    user.password = cleanPassword;
    user.resetPasswordOtp = null;
    user.resetPasswordOtpExpires = null;
    await user.save();

    return res.status(200).json({
      success: true,
      message: `Password for ${user.name} (${user.uid}) has been reset to: ${cleanPassword}`,
      newPassword: cleanPassword,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get real-time admin system notifications & alerts
// @route   GET /api/admin/notifications
export const getAdminNotifications = async (req, res) => {
  try {
    const [pendingDeps, pendingWths, recentRounds, recentUsers] = await Promise.all([
      Deposit.find({ status: 'Pending' }).sort({ createdAt: -1 }).limit(10),
      Withdrawal.find({ status: 'Pending' }).sort({ createdAt: -1 }).limit(10),
      StakingRound.find().sort({ createdAt: -1 }).limit(10),
      User.find({ role: 'user' }).sort({ createdAt: -1 }).limit(5),
    ]);

    const notifs = [];

    // 1. Pending Deposits needing admin review
    for (const d of pendingDeps) {
      notifs.push({
        id: `admin_dep_${d._id}`,
        type: 'deposit',
        category: 'pending',
        title: `Pending Deposit: ₹${d.amount.toLocaleString('en-IN')}`,
        message: `${d.traderName} submitted ₹${d.amount} via UPI (UTR: ${d.utr || 'Pending'}). Awaiting approval.`,
        amount: d.amount,
        actionTab: 'deposits',
        date: d.createdAt,
        severity: 'warning',
      });
    }

    // 2. Pending Withdrawals needing bank dispatch
    for (const w of pendingWths) {
      notifs.push({
        id: `admin_wth_${w._id}`,
        type: 'withdrawal',
        category: 'pending',
        title: `Payout Request: ₹${w.amount.toLocaleString('en-IN')}`,
        message: `${w.traderName} requested payout of ₹${w.amount} to ${w.destinationType || 'UPI'}.`,
        amount: w.amount,
        actionTab: 'withdrawals',
        date: w.createdAt,
        severity: 'danger',
      });
    }

    // 3. Recent Real Staking Contracts
    for (const r of recentRounds) {
      notifs.push({
        id: `admin_rnd_${r._id}`,
        type: 'contract',
        category: 'activity',
        title: `Contract Placed: ${r.asset}`,
        message: `${r.traderName} invested ₹${(Number(r.stakedAmount) || 0).toLocaleString('en-IN')} (+${r.returnPercent}% return).`,
        amount: r.stakedAmount,
        actionTab: 'dashboard',
        date: r.createdAt || r.startTime || new Date(),
        severity: 'info',
      });
    }

    // 4. Recent Real Traders
    for (const u of recentUsers) {
      notifs.push({
        id: `admin_usr_${u._id}`,
        type: 'user',
        category: 'activity',
        title: `New Trader: ${u.name}`,
        message: `${u.name} (UID: ${u.uid}, Phone: ${u.phone}) registered on Paynex.`,
        actionTab: 'users',
        date: u.createdAt,
        severity: 'success',
      });
    }

    notifs.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    return res.status(200).json({
      success: true,
      count: notifs.length,
      unreadCount: pendingDeps.length + pendingWths.length,
      notifications: notifs,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};



