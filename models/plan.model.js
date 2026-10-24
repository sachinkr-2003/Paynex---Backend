import mongoose from 'mongoose';

const planSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    dailyProfit: {
      type: Number,
      required: true,
    },
    durationDays: {
      type: Number,
      required: true,
    },
    minAmount: {
      type: Number,
      required: true,
    },
    maxAmount: {
      type: Number,
      required: true,
    },
    totalYield: {
      type: Number,
      required: true,
    },
    activeSubscribers: {
      type: Number,
      default: 0,
    },
    isEnabled: {
      type: Boolean,
      default: true,
    },
    color: {
      type: String,
      default: '#f59e0b',
    },
  },
  { timestamps: true }
);

const Plan = mongoose.model('Plan', planSchema);
export default Plan;
