import mongoose from 'mongoose';

const depositSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      default: () => `DEP-${Math.floor(10000 + Math.random() * 90000)}`,
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
    amount: {
      type: Number,
      required: true,
      min: 100,
    },
    method: {
      type: String,
      default: 'UPI',
      trim: true,
    },
    utr: {
      type: String,
      required: true,
      trim: true,
    },
    screenshotProof: {
      type: String,
      default: 'paynex_receipt_verified.png',
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
    status: {
      type: String,
      enum: ['Pending', 'Under Review', 'Verified', 'Approved', 'Success', 'Rejected', 'Failed', 'Expired'],
      default: 'Pending',
    },
    isRealPaymentVerified: {
      type: Boolean,
      default: false,
    },
    bankVerifiedAt: {
      type: Date,
    },
    bankReference: {
      type: String,
      default: '',
    },
    time: {
      type: String,
      default: () => new Date().toISOString().replace('T', ' ').slice(0, 19),
    },
  },
  { timestamps: true }
);

const Deposit = mongoose.model('Deposit', depositSchema);
export default Deposit;
