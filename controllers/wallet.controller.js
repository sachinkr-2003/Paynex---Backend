import Deposit from '../models/deposit.model.js';
import Withdrawal from '../models/withdrawal.model.js';
import User from '../models/user.model.js';
import Setting from '../models/setting.model.js';
import StakingRound from '../models/stakingRound.model.js';
import { verifyBankPayment } from '../utils/paymentVerifier.js';

// @desc    Get user wallet details, deposits, and withdrawals
// @route   GET /api/wallet/history
export const getWalletHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId).select('balance uid name');
    const deposits = await Deposit.find({ userId }).sort({ createdAt: -1 });
    const withdrawals = await Withdrawal.find({ userId }).sort({ createdAt: -1 });
    const settings = await Setting.findOne({ key: 'main_config' });

    return res.status(200).json({
      success: true,
      balance: user.balance,
      deposits,
      withdrawals,
      gatewayConfig: {
        officialUpiId: settings?.officialUpiId || 'paynex.crypto@icici',
        merchantName: settings?.merchantName || 'Paynex Crypto Technologies Pvt Ltd',
        minDeposit: settings?.minDeposit || 100,
        minWithdrawal: settings?.minWithdrawal || 1000,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Submit deposit request with UTR
// @route   POST /api/wallet/deposit
export const submitDeposit = async (req, res) => {
  try {
    const { amount, utr, method, screenshotProof, companyId, companyName, companyUpi } = req.body;
    const userId = req.user.id;

    if (!amount || !utr) {
      return res.status(400).json({ success: false, message: 'Amount and 12-digit UTR number are required.' });
    }

    const settings = await Setting.findOne({ key: 'main_config' });
    const minDeposit = (settings?.minDeposit && Number(settings.minDeposit) <= 100) ? Number(settings.minDeposit) : 100;
    if (Number(amount) < minDeposit) {
      return res.status(400).json({ success: false, message: `Minimum deposit amount is ₹${minDeposit}.` });
    }

    // Check duplicate UTR
    const existingUtr = await Deposit.findOne({ utr: utr.trim() });
    if (existingUtr) {
      return res.status(400).json({ success: false, message: 'This UTR has already been submitted for verification.' });
    }

    // ==============================================================
    // REAL-TIME BANK & NPCI PAYMENT VERIFICATION (IRCTC STYLE)
    // ==============================================================
    const verification = await verifyBankPayment({
      utr: utr.trim(),
      amount: Number(amount),
      upiId: companyUpi || settings?.officialUpiId,
    });

    if (!verification.verified) {
      // Payment NOT detected on banking rails -> FAIL ON THE SPOT
      // DO NOT create any deposit record for administration!
      return res.status(400).json({
        success: false,
        failed: true,
        message: verification.message || 'Payment Verification Failed: Acquiring bank did not confirm inbound credit. Please ensure you have paid via UPI before submitting.',
      });
    }

    const user = await User.findById(userId);

    // Create verified deposit record for administration review
    const deposit = await Deposit.create({
      userId,
      traderUid: user?.uid || 'PAYNEX-USER',
      traderName: user?.name || 'Trader',
      amount: Number(amount),
      method: method || 'UPI',
      utr: verification.cleanUtr,
      screenshotProof: screenshotProof || req.body.screenshotUrl || 'paynex_receipt_verified.png',
      companyId: companyId || '',
      companyName: companyName || '',
      companyUpi: companyUpi || '',
      status: 'Verified',
      isRealPaymentVerified: true,
      bankVerifiedAt: new Date(),
      bankReference: verification.bankRef || `NPCI-${verification.cleanUtr}`,
    });

    return res.status(201).json({
      success: true,
      verified: true,
      message: 'Real payment verified by banking network! Your payment of ₹' + amount + ' has been confirmed and forwarded to admin for instant credit.',
      deposit,
    });
  } catch (error) {
    console.error('Submit deposit error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Submit withdrawal request with password security verification
// @route   POST /api/wallet/withdraw
export const submitWithdrawal = async (req, res) => {
  try {
    const { amount, method, destinationType, upiId, bankName, accountNumber, ifsc, accountHolder, password } = req.body;
    const userId = req.user.id;

    if (!password || typeof password !== 'string' || !password.trim()) {
      return res.status(401).json({
        success: false,
        message: 'Security Verification Required: Please enter your account login password to authorize this withdrawal.',
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Verify that entered password matches the withdrawal password (if configured) or account login password
    let isPasswordMatch = false;
    if (user.withdrawalPassword) {
      isPasswordMatch = await user.compareWithdrawalPassword(password.trim());
    }
    if (!isPasswordMatch) {
      isPasswordMatch = await user.comparePassword(password.trim());
    }
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Incorrect Password! Please enter your valid Withdrawal Password or Account Login Password to authorize this withdrawal.',
      });
    }

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Please provide a valid withdrawal amount.' });
    }

    const numAmount = Number(amount);
    const settings = await Setting.findOne({ key: 'main_config' });
    const minWithdrawal = (settings?.minWithdrawal && Number(settings.minWithdrawal) <= 100) ? Number(settings.minWithdrawal) : 100;

    if (numAmount < minWithdrawal) {
      return res.status(400).json({ success: false, message: `Minimum withdrawal amount is ₹${minWithdrawal}.` });
    }

    if (settings?.emergencyFreeze) {
      return res.status(403).json({ success: false, message: 'Withdrawals are currently suspended due to system maintenance.' });
    }

    if (user.balance < numAmount) {
      return res.status(400).json({ success: false, message: 'Insufficient wallet balance for withdrawal.' });
    }

    // Target Bank Details (Only Bank Account supported - No UPI)
    const targetAcc = (accountNumber || user.bankDetails?.accountNumber || '').trim();
    const targetIfsc = (ifsc || user.bankDetails?.ifsc || '').trim().toUpperCase();
    const targetBankName = (bankName || user.bankDetails?.bankName || 'Bank Transfer').trim();
    const payeeName = (accountHolder || user.bankDetails?.holderName || user.name || 'Trader').trim();

    if (!targetAcc || !targetIfsc) {
      return res.status(400).json({
        success: false,
        message: 'Kripya pehle apna Bank Account Number aur IFSC Code enter karein. Withdrawal ke liye bank details anivarya hain.',
      });
    }

    // Auto-update user's saved bankDetails if newly provided
    if (!user.bankDetails?.accountNumber || accountNumber) {
      user.bankDetails = {
        bankName: targetBankName,
        accountNumber: targetAcc,
        ifsc: targetIfsc,
        holderName: payeeName,
      };
    }

    // Deduct balance (hold funds)
    user.balance -= numAmount;
    await user.save();

    // Dynamic Payout Bank QR Generation for Admin Scan & Pay
    const payoutUpiString = `upi://pay?pa=${targetAcc}@${targetIfsc}.ifsc.npci&pn=${encodeURIComponent(payeeName)}&am=${numAmount}&cu=INR&tn=${encodeURIComponent(`Bank Payout ${user.uid}`)}`;
    const payoutQrCode = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payoutUpiString)}`;

    const withdrawal = await Withdrawal.create({
      userId,
      traderUid: user.uid,
      traderName: user.name,
      amount: numAmount,
      destinationType: 'Bank Account',
      upiId: '',
      bankName: targetBankName,
      accountNumber: targetAcc,
      ifsc: targetIfsc,
      accountHolder: payeeName,
      payoutQrCode,
      payoutUpiString,
      status: 'Pending',
    });

    return res.status(201).json({
      success: true,
      message: `Withdrawal of ₹${numAmount.toLocaleString('en-IN')} submitted. Payout QR generated for Admin settlement.`,
      withdrawal,
      newBalance: user.balance,
    });
  } catch (error) {
    console.error('Submit withdrawal error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get real live user notifications generated from real transactions & events
// @route   GET /api/wallet/notifications
export const getUserNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const [deposits, withdrawals, stakings] = await Promise.all([
      Deposit.find({ userId }).sort({ createdAt: -1 }).limit(30),
      Withdrawal.find({ userId }).sort({ createdAt: -1 }).limit(30),
      StakingRound.find({ userId }).sort({ createdAt: -1 }).limit(30),
    ]);

    const notifs = [];

    const formatDate = (d) => {
      if (!d) return 'Recently';
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return 'Recently';
      return dt.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    };

    // 1. Process Real Deposits
    for (const dep of deposits) {
      const depDate = dep.createdAt || new Date();
      if (dep.status === 'Approved' || dep.status === 'Success') {
        notifs.push({
          id: `dep_app_${dep._id}`,
          title: 'Deposit Approved & Credited',
          message: `₹${dep.amount.toLocaleString('en-IN')} has been approved and credited to your wallet (UTR: ${dep.utr}).`,
          date: formatDate(dep.updatedAt || depDate),
          rawDate: new Date(dep.updatedAt || depDate).getTime(),
          category: 'deposits',
          status: 'Approved',
          icon: 'wallet',
          iconColor: '0xFF10B981',
        });
      } else if (dep.status === 'Rejected' || dep.status === 'Failed') {
        notifs.push({
          id: `dep_rej_${dep._id}`,
          title: 'Deposit Declined',
          message: `Deposit of ₹${dep.amount.toLocaleString('en-IN')} (UTR: ${dep.utr}) could not be verified on banking switch.`,
          date: formatDate(dep.updatedAt || depDate),
          rawDate: new Date(dep.updatedAt || depDate).getTime(),
          category: 'deposits',
          status: 'Rejected',
          icon: 'close',
          iconColor: '0xFFEF4444',
        });
      } else {
        notifs.push({
          id: `dep_pen_${dep._id}`,
          title: 'Deposit Under Review',
          message: `Deposit of ₹${dep.amount.toLocaleString('en-IN')} (UTR: ${dep.utr}) is queued for automated/admin clearance.`,
          date: formatDate(depDate),
          rawDate: new Date(depDate).getTime(),
          category: 'deposits',
          status: dep.status || 'Pending',
          icon: 'time',
          iconColor: '0xFFF59E0B',
        });
      }
    }

    // 2. Process Real Withdrawals
    for (const wth of withdrawals) {
      const wthDate = wth.createdAt || new Date();
      if (wth.status === 'Completed') {
        notifs.push({
          id: `wth_comp_${wth._id}`,
          title: 'Payout Dispatched via IMPS',
          message: `₹${wth.amount.toLocaleString('en-IN')} sent to ${wth.destinationType === 'UPI' ? wth.upiId : (wth.accountNumber || 'Bank')}. Ref: ${wth.impsRef || 'IMPS'}`,
          date: formatDate(wth.updatedAt || wthDate),
          rawDate: new Date(wth.updatedAt || wthDate).getTime(),
          category: 'withdrawals',
          status: 'Completed',
          icon: 'check',
          iconColor: '0xFF10B981',
        });
      } else if (wth.status === 'Rejected') {
        notifs.push({
          id: `wth_rej_${wth._id}`,
          title: 'Withdrawal Rejected & Refunded',
          message: `Payout request of ₹${wth.amount.toLocaleString('en-IN')} was declined. ₹${wth.amount.toLocaleString('en-IN')} refunded to wallet.`,
          date: formatDate(wth.updatedAt || wthDate),
          rawDate: new Date(wth.updatedAt || wthDate).getTime(),
          category: 'withdrawals',
          status: 'Rejected',
          icon: 'close',
          iconColor: '0xFFEF4444',
        });
      } else {
        notifs.push({
          id: `wth_pen_${wth._id}`,
          title: 'Withdrawal Processing',
          message: `Payout of ₹${wth.amount.toLocaleString('en-IN')} registered. Awaiting IMPS bank dispatch.`,
          date: formatDate(wthDate),
          rawDate: new Date(wthDate).getTime(),
          category: 'withdrawals',
          status: 'Pending',
          icon: 'time',
          iconColor: '0xFFF59E0B',
        });
      }
    }

    // 3. Process Real Staking Investments & 5:00 AM Daily Interest Credits
    for (const stk of stakings) {
      const stkDate = stk.createdAt || new Date();

      // Show each 5:00 AM Interest Credit Event
      if (Array.isArray(stk.interestHistory) && stk.interestHistory.length > 0) {
        for (const [idx, item] of stk.interestHistory.entries()) {
          notifs.push({
            id: `stk_int_${stk._id}_${idx}`,
            title: `5:00 AM Interest Credited (+${item.returnPercent || stk.returnPercent}%)`,
            message: `₹${item.amount.toLocaleString('en-IN')} daily interest on ${stk.asset} has been credited directly to your wallet balance.`,
            date: formatDate(item.date),
            rawDate: new Date(item.date).getTime(),
            category: 'system',
            status: 'Credited',
            icon: 'trending',
            iconColor: '0xFF10B981',
          });
        }
      }

      if (stk.status === 'Matured & Settled') {
        notifs.push({
          id: `stk_mat_${stk._id}`,
          title: `Yield Settled (+${stk.returnPercent}%)`,
          message: `Stake of ₹${stk.stakedAmount.toLocaleString('en-IN')} on ${stk.asset} completed. ₹${stk.payout.toLocaleString('en-IN')} credited.`,
          date: formatDate(stk.settledAt || stk.updatedAt || stkDate),
          rawDate: new Date(stk.settledAt || stk.updatedAt || stkDate).getTime(),
          category: 'system',
          status: 'Settled',
          icon: 'trending',
          iconColor: '0xFF10B981',
        });
      } else if (stk.status === 'Active') {
        const daily = stk.dailyInterest || Math.max(1, Math.round(((stk.stakedAmount || 0) * (stk.returnPercent || 4)) / 100));
        notifs.push({
          id: `stk_act_${stk._id}`,
          title: `Active Stock: ${stk.asset} (+${stk.returnPercent}%)`,
          message: `₹${stk.stakedAmount.toLocaleString('en-IN')} active on ${stk.asset}. Daily interest of ₹${daily.toLocaleString('en-IN')} auto-credits every morning at 5:00 AM IST.`,
          date: formatDate(stkDate),
          rawDate: new Date(stkDate).getTime(),
          category: 'system',
          status: 'Active',
          icon: 'trending',
          iconColor: '0xFFF59E0B',
        });
      }
    }

    // 4. Referral bonus notification
    if (user.referralEarnings && user.referralEarnings > 0) {
      notifs.push({
        id: `ref_bonus_${user._id}`,
        title: 'Referral Bonus Credited',
        message: `Total ₹${user.referralEarnings.toLocaleString('en-IN')} in 5% first-deposit referral commission credited to your balance.`,
        date: formatDate(user.updatedAt || user.createdAt),
        rawDate: new Date(user.updatedAt || user.createdAt).getTime(),
        category: 'system',
        status: 'Credited',
        icon: 'gift',
        iconColor: '0xFF10B981',
      });
    }

    // 5. Welcome notification
    notifs.push({
      id: `welcome_${user._id}`,
      title: 'Welcome to PAYNEX Trading',
      message: `Account activated for ${user.name}. Trader UID: ${user.uid}. Minimum deposit ₹100, enjoy 2% to 12% returns!`,
      date: formatDate(user.createdAt),
      rawDate: new Date(user.createdAt).getTime(),
      category: 'system',
      status: 'Active',
      icon: 'verified',
      iconColor: '0xFF38BDF8',
    });

    // Sort by rawDate descending
    notifs.sort((a, b) => (b.rawDate || 0) - (a.rawDate || 0));

    return res.status(200).json({
      success: true,
      count: notifs.length,
      notifications: notifs,
    });
  } catch (error) {
    console.error('getUserNotifications error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

