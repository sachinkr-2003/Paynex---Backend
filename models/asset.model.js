import mongoose from 'mongoose';

const assetSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    symbol: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    category: {
      type: String,
      enum: ['Crypto', 'Stock', 'Commodity', 'Forex'],
      default: 'Crypto',
    },
    basePrice: {
      type: Number,
      required: true,
      min: 0.01,
    },
    step: {
      type: Number,
      default: 5,
    },
    icon: {
      type: String,
      default: '📈',
    },
    color: {
      type: String,
      default: '#f59e0b',
    },
    returnPercent: {
      type: Number,
      required: true,
      default: 30, // Admin-defined interest % rate for this specific stock
      min: 1,
      max: 500,
    },
    minStake: {
      type: Number,
      default: 100,
    },
    maxStake: {
      type: Number,
      default: 500000,
    },
    isEnabled: {
      type: Boolean,
      default: true,
    },
    description: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

const Asset = mongoose.model('Asset', assetSchema);
export default Asset;
