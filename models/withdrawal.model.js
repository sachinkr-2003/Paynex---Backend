import mongoose from 'mongoose';

const withdrawalSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      default: () => `WTH-${Math.floor(10000 + Math.random() * 90000)}`,
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
    destinationType: {
      type: String,
      enum: ['UPI', 'Bank A/C', 'BANK'],
      default: 'UPI',
    },
    upiId: {
      type: String,
      default: '',
    },
    bankName: {
      type: String,
      default: '',
    },
    accountNumber: {
      type: String,
      default: '',
    },
    ifsc: {
      type: String,
      default: '',
    },
    accountHolder: {
      type: String,
      default: '',
    },
    payoutQrCode: {
      type: String,
      default: '',
    },
    payoutUpiString: {
      type: String,
      default: '',
    },
    impsRef: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['Pending', 'Completed', 'Rejected'],
      default: 'Pending',
    },
    rejectionReason: {
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

const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);
export default Withdrawal;
