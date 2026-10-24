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
      enum: ['UPI', 'IMPS', 'Bank Transfer', 'QR Code'],
      default: 'UPI',
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
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending',
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
