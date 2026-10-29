import mongoose from 'mongoose';
import StakingRound from '../models/stakingRound.model.js';
import User from '../models/user.model.js';
import Setting from '../models/setting.model.js';
import Asset from '../models/asset.model.js';
import { getAssetGroup } from './asset.controller.js';

// @desc    Get current guaranteed return rate (2% - 12%)
// @route   GET /api/staking/rate
export const getReturnRate = async (req, res) => {
  try {
    const settings = await Setting.findOne({ key: 'main_config' }).lean();
    const rawRate = settings?.defaultGameProfitPercent || 5;
    const rate = Math.min(12, Math.max(2, rawRate));

    return res.status(200).json({
      success: true,
      returnPercent: rate,
      groupInterestRates: settings?.groupInterestRates || DEFAULT_GROUP_INTEREST,
      groupQrs: settings?.groupQrs || {},
      officialUpiId: settings?.officialUpiId || settings?.upiId || 'paynex.crypto@icici',
      message: `Guaranteed +${rate}% Fixed Return Engine Active`,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Place a new stake/bet
// @route   POST /api/staking/place
export const placeStake = async (req, res) => {
  try {
    const { asset, amount, durationSeconds } = req.body;
    const userId = req.user._id || req.user.id;

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Please enter a valid stake/investment amount.' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User account not found.' });
    }

    if (user.balance < numAmount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient balance to place stake. Available: ₹${Number(user.balance || 0).toLocaleString('en-IN')}, Required: ₹${numAmount.toLocaleString('en-IN')}.`,
      });
    }

    const settings = await Setting.findOne({ key: 'main_config' });
    if (settings?.emergencyFreeze) {
      return res.status(403).json({ success: false, message: 'Staking engine is currently paused.' });
    }

    // Look up stock-specific interest rate defined by Admin (clamped strictly 2% - 12%)
    const cleanAsset = asset ? asset.trim() : 'BTC/USDT';
    const escapedAsset = cleanAsset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // First check if asset exists in DB and is disabled by Admin
    const existingAsset = await Asset.findOne({
      $or: [
        { id: cleanAsset },
        { symbol: cleanAsset.toUpperCase() },
        { name: new RegExp(`^${escapedAsset}$`, 'i') },
      ],
    });

    if (existingAsset && existingAsset.isEnabled === false) {
      return res.status(400).json({
        success: false,
        message: `Trading on "${existingAsset.name}" is currently disabled by Admin. Please choose another stock.`,
      });
    }

    const DEFAULT_GROUP_INTEREST = { 1: 5, 2: 6, 3: 7, 4: 8, 5: 9 };
    const matchedAsset = existingAsset && existingAsset.isEnabled !== false ? existingAsset : null;
    const grp = getAssetGroup(matchedAsset || { symbol: cleanAsset });
    const rawGroupRate = (settings?.groupInterestRates && settings.groupInterestRates[grp] !== undefined && settings.groupInterestRates[grp] !== null)
      ? Number(settings.groupInterestRates[grp])
      : (DEFAULT_GROUP_INTEREST[grp] || 5);
    const returnRate = Math.min(12, Math.max(2, rawGroupRate));
    const dailyInterest = Math.max(1, Math.round((numAmount * returnRate) / 100));
    const duration = durationSeconds || 30;

    // Deduct user balance and increase totalStaked
    user.balance -= numAmount;
    user.totalStaked = (user.totalStaked || 0) + numAmount;
    await user.save();

    const round = await StakingRound.create({
      userId: user._id,
      traderUid: user.uid,
      traderName: user.name,
      asset: matchedAsset?.name || asset || 'BTC/USDT',
      stakedAmount: numAmount,
      returnPercent: returnRate,
      dailyInterest,
      profit: 0, // Profit is strictly 0 until 5:00 AM distribution
      payout: numAmount, // Principal only until 5:00 AM distribution
      totalInterestEarned: 0,
      daysCredited: 0,
      lastInterestCreditedAt: null,
      durationSeconds: duration,
      status: 'Active',
      time: 'Just now',
    });

    return res.status(201).json({
      success: true,
      message: `Stake of ₹${numAmount.toLocaleString('en-IN')} placed on ${round.asset}!`,
      round,
      newBalance: user.balance,
    });
  } catch (error) {
    console.error('Place stake error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Settle a matured round (credit +30% guaranteed return)
// @route   POST /api/staking/settle/:id
export const settleStake = async (req, res) => {
  try {
    const { id } = req.params;
    const query = mongoose.isValidObjectId(id) ? { $or: [{ id }, { _id: id }] } : { id };
    const round = await StakingRound.findOne(query);

    if (!round) {
      return res.status(404).json({ success: false, message: 'Staking round not found.' });
    }

    if (round.status === 'Matured & Settled') {
      return res.status(400).json({ success: false, message: 'Round has already been settled.' });
    }

    // Credit payout to user balance
    const user = await User.findById(round.userId);
    if (user) {
      user.balance += round.payout;
      user.totalWon += round.payout;
      await user.save();
    }

    round.status = 'Matured & Settled';
    round.settledAt = new Date();
    await round.save();

    return res.status(200).json({
      success: true,
      message: `Round matured! ₹${round.payout.toLocaleString('en-IN')} credited to wallet.`,
      round,
      newBalance: user?.balance,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Exit an active contract & refund capital to wallet
// @route   POST /api/staking/exit/:id
export const exitStake = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req.user._id || req.user.id).toString();
    const traderUid = req.user.uid;
    const query = mongoose.isValidObjectId(id) ? { $or: [{ id }, { _id: id }] } : { id };
    const round = await StakingRound.findOne(query);

    if (!round) {
      return res.status(404).json({ success: false, message: 'Contract not found.' });
    }

    // Verify ownership
    if (round.userId?.toString() !== userId && round.traderUid !== traderUid) {
      return res.status(403).json({ success: false, message: 'Unauthorized to exit this contract.' });
    }

    if (round.status !== 'Active') {
      return res.status(400).json({ success: false, message: `Contract is already ${round.status}.` });
    }

    const refundAmount = Number(round.stakedAmount) || 0;
    const user = await User.findById(round.userId || userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User account not found.' });
    }

    // Refund capital back into available balance
    user.balance = (user.balance || 0) + refundAmount;
    if (user.totalStaked && user.totalStaked >= refundAmount) {
      user.totalStaked -= refundAmount;
    }
    await user.save();

    // Mark contract as Completed / Exited
    round.status = 'Completed';
    round.settledAt = new Date();
    round.note = `User exited contract. ₹${refundAmount} capital refunded to available balance.`;
    await StakingRound.updateOne(
      { _id: round._id },
      { $set: { status: 'Completed', settledAt: round.settledAt, note: round.note } }
    );

    return res.status(200).json({
      success: true,
      message: `Contract on ${round.asset} exited! ₹${refundAmount.toLocaleString('en-IN')} returned to your Available Balance.`,
      round,
      refundAmount,
      newBalance: user.balance,
    });
  } catch (error) {
    console.error('Exit contract error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Top-up / add more capital to an existing active stock contract
// @route   POST /api/staking/topup/:id
export const topUpStake = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount } = req.body;
    const userId = (req.user._id || req.user.id).toString();
    const traderUid = req.user.uid;
    const addAmt = Number(amount);

    if (!addAmt || addAmt <= 0) {
      return res.status(400).json({ success: false, message: 'Please provide a valid top-up amount.' });
    }

    const query = mongoose.isValidObjectId(id) ? { $or: [{ id }, { _id: id }] } : { id };
    const round = await StakingRound.findOne(query);

    if (!round) {
      return res.status(404).json({ success: false, message: 'Contract not found.' });
    }

    if (round.userId?.toString() !== userId && round.traderUid !== traderUid) {
      return res.status(403).json({ success: false, message: 'Unauthorized.' });
    }

    if (round.status !== 'Active') {
      return res.status(400).json({ success: false, message: `Contract is ${round.status}. You can only add capital to active contracts.` });
    }

    const user = await User.findById(round.userId || userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (user.balance < addAmt) {
      return res.status(400).json({
        success: false,
        message: `Insufficient wallet balance (₹${user.balance.toLocaleString('en-IN')}). Please recharge first or switch to QR Code.`,
      });
    }

    // Deduct wallet balance & track staked
    user.balance -= addAmt;
    user.totalStaked = (user.totalStaked || 0) + addAmt;
    await user.save();

    // Increase contract capital
    round.stakedAmount += addAmt;
    round.dailyInterest = Math.max(1, Math.round((round.stakedAmount * round.returnPercent) / 100));
    round.payout = round.stakedAmount + (round.totalInterestEarned || 0);
    await round.save();

    console.log(`✅ User ${user.name} added ₹${addAmt} to ${round.asset} contract #${round.id || round._id}. New total: ₹${round.stakedAmount}`);

    return res.status(200).json({
      success: true,
      message: `Successfully added ₹${addAmt.toLocaleString('en-IN')} to your ${round.asset} contract! Total Investment is now ₹${round.stakedAmount.toLocaleString('en-IN')}.`,
      round,
      newBalance: user.balance,
      newStakedAmount: round.stakedAmount,
    });
  } catch (error) {
    console.error('Top-up contract error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get active rounds for current user
// @route   GET /api/staking/my-rounds
export const getUserRounds = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const traderUid = req.user.uid;
    const query = traderUid
      ? { $or: [{ userId }, { traderUid }] }
      : { userId };
    const rounds = await StakingRound.find(query).sort({ createdAt: -1 });

    const sanitizedRounds = rounds.map((r) => {
      const staked = Number(r.stakedAmount) || 0;
      const rate = Number(r.returnPercent) || 0;
      const dailyInterest = r.dailyInterest || Math.max(1, Math.round((staked * rate) / 100));
      // For active contracts: profit is ONLY interest credited so far at 5:00 AM (0 before 5:00 AM)
      const earned = Number(r.totalInterestEarned || 0);
      const profit = r.status === 'Active' ? earned : (Number(r.profit) || earned);
      const payout = staked + profit;
      return {
        ...r.toObject(),
        dailyInterest,
        profit,
        payout,
      };
    });

    return res.status(200).json({
      success: true,
      rounds: sanitizedRounds,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get live multiplayer room stakers
// @route   GET /api/staking/live-pool
export const getLivePool = async (req, res) => {
  try {
    const activeRounds = await StakingRound.find({ status: 'Active' })
      .sort({ createdAt: -1 })
      .limit(20);

    const settings = await Setting.findOne({ key: 'main_config' });

    const sanitizedActive = activeRounds.map((r) => {
      const staked = Number(r.stakedAmount) || 0;
      const rate = Number(r.returnPercent) || 0;
      const dailyInterest = r.dailyInterest || Math.max(1, Math.round((staked * rate) / 100));
      // For active contracts: profit is ONLY interest credited so far at 5:00 AM (0 before 5:00 AM)
      const earned = Number(r.totalInterestEarned || 0);
      const profit = r.status === 'Active' ? earned : (Number(r.profit) || earned);
      const payout = staked + profit;
      return {
        ...r.toObject(),
        dailyInterest,
        profit,
        payout,
      };
    });

    return res.status(200).json({
      success: true,
      activeStakers: sanitizedActive,
      returnPercent: settings?.defaultGameProfitPercent || 30,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
