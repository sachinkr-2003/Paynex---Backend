import mongoose from 'mongoose';

const gatewayOrderSchema = new mongoose.Schema(
  {
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
    transactionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 100,
    },
    adminUpiId: {
      type: String,
      required: true,
      trim: true,
    },
    merchantName: {
      type: String,
      default: 'PAYNEX TRADING DESK',
      trim: true,
    },
    userUtrNumber: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['Initiated', 'Pending', 'Under Review', 'Verified', 'Success', 'Failed', 'Expired'],
      default: 'Initiated',
    },
    paymentMethod: {
      type: String,
      default: 'UPI',
    },
    companyId: {
      type: String,
      default: '',
    },
    companyName: {
      type: String,
      default: '',
    },
    companyUpi: {
      type: String,
      default: '',
    },
    screenshotProof: {
      type: String,
      default: '',
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 10 * 60 * 1000), // 10 minutes timeout
    },
    submittedAt: {
      type: Date,
    },
    verifiedAt: {
      type: Date,
    },
    notes: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Auto-check if order has expired
gatewayOrderSchema.methods.isExpired = function () {
  return this.status === 'Pending' && new Date() > this.expiresAt;
};

// Calculate remaining seconds
gatewayOrderSchema.methods.getRemainingSeconds = function () {
  if (this.status !== 'Pending') return 0;
  const rem = Math.floor((this.expiresAt.getTime() - Date.now()) / 1000);
  return Math.max(0, rem);
};

const GatewayOrder = mongoose.model('GatewayOrder', gatewayOrderSchema);
export default GatewayOrder;
