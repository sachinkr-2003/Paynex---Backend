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
    const settings = await Setting.findOne({ key: 'main_config' });
    const rawRate = settings?.defaultGameProfitPercent || 5;
    const rate = Math.min(12, Math.max(2, rawRate));

    return res.status(200).json({
      success: true,
      returnPercent: rate,
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
    const userId = req.user.id;

    const numAmount = Number(amount);
    if (!numAmount || numAmount < 1000) {
      return res.status(400).json({ success: false, message: 'Minimum stake/investment amount is ₹1,000.' });
    }

    const user = await User.findById(userId);
    if (user.balance < numAmount) {
      return res.status(400).json({ success: false, message: 'Insufficient balance to place stake.' });
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
    user.totalStaked += numAmount;
    await user.save();

    const round = await StakingRound.create({
      userId,
      traderUid: user.uid,
      traderName: user.name,
      asset: matchedAsset?.name || asset || 'BTC/USDT',
      stakedAmount: numAmount,
      returnPercent: returnRate,
      dailyInterest,
      profit: 0,
      payout: numAmount,
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
    const userId = req.user.id;
    const query = mongoose.isValidObjectId(id) ? { $or: [{ id }, { _id: id }] } : { id };
    const round = await StakingRound.findOne(query);

    if (!round) {
      return res.status(404).json({ success: false, message: 'Contract not found.' });
    }

    // Verify ownership
    if (round.userId.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized to exit this contract.' });
    }

    if (round.status !== 'Active') {
      return res.status(400).json({ success: false, message: `Contract is already ${round.status}.` });
    }

    const refundAmount = Number(round.stakedAmount) || 0;
    const user = await User.findById(userId);
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
    await round.save();

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

// @desc    Get active rounds for current user
// @route   GET /api/staking/my-rounds
export const getUserRounds = async (req, res) => {
  try {
    const userId = req.user.id;
    const rounds = await StakingRound.find({ userId }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      rounds,
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

    return res.status(200).json({
      success: true,
      activeStakers: activeRounds,
      returnPercent: settings?.defaultGameProfitPercent || 30,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
