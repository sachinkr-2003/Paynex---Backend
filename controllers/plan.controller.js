import Plan from '../models/plan.model.js';
import User from '../models/user.model.js';
import StakingRound from '../models/stakingRound.model.js';

// @desc    Get all investment plans
// @route   GET /api/plans
export const getPlans = async (req, res) => {
  try {
    const plans = await Plan.find().sort({ minAmount: 1 });
    return res.status(200).json({ success: true, plans });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Subscribe to an investment plan
// @route   POST /api/plans/subscribe
export const subscribePlan = async (req, res) => {
  try {
    const { planId, amount } = req.body;
    const userId = req.user.id;

    const plan = await Plan.findOne({ id: planId });
    if (!plan || !plan.isEnabled) {
      return res.status(404).json({ success: false, message: 'Plan is currently inactive or not found.' });
    }

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Please provide a valid investment amount.' });
    }

    if (numAmount < plan.minAmount || numAmount > plan.maxAmount) {
      return res.status(400).json({
        success: false,
        message: `Investment must be between ₹${plan.minAmount} and ₹${plan.maxAmount}.`,
      });
    }

    // Atomic balance deduction to prevent race conditions
    const updatedUser = await User.findOneAndUpdate(
      { _id: userId, balance: { $gte: numAmount } },
      { $inc: { balance: -numAmount, totalStaked: numAmount } },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(400).json({ success: false, message: 'Insufficient balance to subscribe.' });
    }

    // Create real tracked contract for this plan subscription
    const dailyInterest = Math.max(1, Math.round((numAmount * (plan.dailyProfit || 5)) / 100));
    const round = await StakingRound.create({
      userId: updatedUser._id,
      traderUid: updatedUser.uid,
      traderName: updatedUser.name,
      asset: `Plan: ${plan.name}`,
      stakedAmount: numAmount,
      returnPercent: plan.dailyProfit || 5,
      dailyInterest,
      profit: 0,
      payout: numAmount,
      totalInterestEarned: 0,
      daysCredited: 0,
      durationSeconds: (plan.durationDays || 30) * 86400,
      status: 'Active',
      time: 'Just now',
    });

    plan.activeSubscribers = (plan.activeSubscribers || 0) + 1;
    await plan.save();

    return res.status(200).json({
      success: true,
      message: `Subscribed to ${plan.name} successfully! Daily returns: +${plan.dailyProfit}%`,
      newBalance: updatedUser.balance,
      plan,
      round,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
