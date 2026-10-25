import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    uid: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      default: () => `PAYNEX-${Math.floor(100000 + Math.random() * 900000)}`,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      default: '+91 98765 43210',
    },
    password: {
      type: String,
      required: true,
    },
    withdrawalPassword: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    balance: {
      type: Number,
      default: 0, // Clean starting wallet balance
    },
    totalStaked: {
      type: Number,
      default: 0,
    },
    totalWon: {
      type: Number,
      default: 0,
    },
    kycStatus: {
      type: String,
      enum: ['Verified', 'Under Review', 'Pending', 'Rejected'],
      default: 'Verified',
    },
    isBanned: {
      type: Boolean,
      default: false,
    },
    vipLevel: {
      type: String,
      default: 'VIP 1',
    },
    bankDetails: {
      bankName: { type: String, default: 'HDFC Bank' },
      accountNumber: { type: String, default: '•••• 4821' },
      ifsc: { type: String, default: 'HDFC0001234' },
      holderName: { type: String, default: '' },
      upiId: { type: String, default: 'user@okhdfcbank' },
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    referrerUid: {
      type: String,
      default: null,
    },
    hasDeposited: {
      type: Boolean,
      default: false,
    },
    firstDepositBonusGiven: {
      type: Boolean,
      default: false,
    },
    referralEarnings: {
      type: Number,
      default: 0,
    },
    referralCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Hash password before saving if modified
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Method to verify password
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Method to verify withdrawal password
userSchema.methods.compareWithdrawalPassword = async function (enteredPassword) {
  if (!this.withdrawalPassword) return false;
  return await bcrypt.compare(enteredPassword, this.withdrawalPassword);
};

const User = mongoose.model('User', userSchema);
export default User;
