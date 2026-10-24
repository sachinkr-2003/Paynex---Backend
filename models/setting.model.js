import mongoose from 'mongoose';

const settingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: 'main_config',
      unique: true,
    },
    platformName: {
      type: String,
      default: 'Paynex',
    },
    officialUpiId: {
      type: String,
      default: 'paynex@icici',
    },
    merchantName: {
      type: String,
      default: 'Paynex Technologies Pvt Ltd',
    },
    minDeposit: {
      type: Number,
      default: 500,
    },
    minWithdrawal: {
      type: Number,
      default: 1000,
    },
    withdrawalFeePercent: {
      type: Number,
      default: 0,
    },
    defaultGameProfitPercent: {
      type: Number,
      default: 30, // 30% Fixed Return Staking Engine
    },
    reserveBalance: {
      type: Number,
      default: 12500000,
    },
    emergencyFreeze: {
      type: Boolean,
      default: false,
    },
    autoApproveKyc: {
      type: Boolean,
      default: false,
    },
    autoReleaseWithdrawals: {
      type: Boolean,
      default: false,
    },
    supportHelpline: {
      type: String,
      default: '1800 234 5678',
    },
    supportEmail: {
      type: String,
      default: 'support@paynexcrypto.io',
    },
    whatsappCare: {
      type: String,
      default: '+91 98765 43210',
    },
    telegramChannel: {
      type: String,
      default: 'https://t.me/paynexcrypto_support',
    },
  },
  { timestamps: true }
);

const Setting = mongoose.model('Setting', settingSchema);
export default Setting;
