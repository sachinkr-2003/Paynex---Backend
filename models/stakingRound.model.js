import mongoose from 'mongoose';

const stakingRoundSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      default: () => `RND-${Math.floor(10000 + Math.random() * 90000)}`,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    traderUid: {
      type: String,
      required: true,
    },
    traderName: {
      type: String,
      required: true,
    },
    asset: {
      type: String,
      required: true,
      default: 'BTC/USDT',
    },
    stakedAmount: {
      type: Number,
      required: true,
      min: 100,
    },
    returnPercent: {
      type: Number,
      required: true,
      default: 30, // 30% fixed return
    },
    profit: {
      type: Number,
      required: true,
    },
    payout: {
      type: Number,
      required: true,
    },
    durationSeconds: {
      type: Number,
      default: 30,
    },
    status: {
      type: String,
      enum: ['Active', 'Matured & Settled', 'Cancelled'],
      default: 'Active',
    },
    time: {
      type: String,
      default: 'Just now',
    },
    settledAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

const StakingRound = mongoose.model('StakingRound', stakingRoundSchema);
export default StakingRound;
