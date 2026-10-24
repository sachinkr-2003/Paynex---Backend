import Plan from '../models/plan.model.js';
import User from '../models/user.model.js';

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
    if (numAmount < plan.minAmount || numAmount > plan.maxAmount) {
      return res.status(400).json({
        success: false,
        message: `Investment must be between ₹${plan.minAmount} and ₹${plan.maxAmount}.`,
      });
    }

    const user = await User.findById(userId);
    if (user.balance < numAmount) {
      return res.status(400).json({ success: false, message: 'Insufficient balance to subscribe.' });
    }

    // Deduct capital
    user.balance -= numAmount;
    user.totalStaked += numAmount;
    await user.save();

    plan.activeSubscribers += 1;
    await plan.save();

    return res.status(200).json({
      success: true,
      message: `Subscribed to ${plan.name} successfully! Daily returns: +${plan.dailyProfit}%`,
      newBalance: user.balance,
      plan,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
