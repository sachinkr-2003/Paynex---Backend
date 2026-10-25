import mongoose from 'mongoose';
import StakingRound from '../models/stakingRound.model.js';
import User from '../models/user.model.js';
import Setting from '../models/setting.model.js';
import Asset from '../models/asset.model.js';

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
    if (!numAmount || numAmount < 100) {
      return res.status(400).json({ success: false, message: 'Minimum stake is ₹100.' });
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
    const matchedAsset = await Asset.findOne({
      $or: [{ id: cleanAsset }, { symbol: cleanAsset.toUpperCase() }],
      isEnabled: true,
    });

    const rawReturnRate = matchedAsset ? matchedAsset.returnPercent : (settings?.defaultGameProfitPercent || 5);
    const returnRate = Math.min(12, Math.max(2, rawReturnRate));
    const profit = Math.round((numAmount * returnRate) / 100);
    const payout = numAmount + profit;
    const duration = durationSeconds || 30;

    // Deduct user balance and increase totalStaked
    user.balance -= numAmount;
    user.totalStaked += numAmount;
    await user.save();

    const round = await StakingRound.create({
      userId,
      traderUid: user.uid,
      traderName: user.name,
      asset: asset || 'BTC/USDT',
      stakedAmount: numAmount,
      returnPercent: returnRate,
      profit,
      payout,
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
