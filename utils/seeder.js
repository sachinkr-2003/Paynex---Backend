import User from '../models/user.model.js';
import Deposit from '../models/deposit.model.js';
import Withdrawal from '../models/withdrawal.model.js';
import StakingRound from '../models/stakingRound.model.js';
import Plan from '../models/plan.model.js';
import Setting from '../models/setting.model.js';
import Asset from '../models/asset.model.js';
import { initialAssetsList } from './initialAssets.js';

export const seedDatabase = async () => {
  try {
    // 1. Seed or update System Setting
    let setting = await Setting.findOne({ key: 'main_config' });
    if (!setting) {
      setting = await Setting.create({
        key: 'main_config',
        platformName: 'Paynex',
        officialUpiId: 'paynex@icici',
        merchantName: 'Paynex Technologies Pvt Ltd',
        minDeposit: 500,
        minWithdrawal: 1000,
        defaultGameProfitPercent: 30,
        reserveBalance: 12500000,
        supportHelpline: '1800 234 5678',
        supportEmail: 'support@paynex.com',
        whatsappCare: '+91 98765 43210',
        telegramChannel: 'https://t.me/paynex_official',
      });
      console.log('✅ Seeded default system settings');
    }

    // 2. Seed Super Admin
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@paynex.com';
    let admin = await User.findOne({ email: adminEmail });
    if (!admin) {
      admin = await User.create({
        uid: 'PAYNEX-ADM001',
        name: 'Paynex Super Admin',
        email: adminEmail,
        password: process.env.ADMIN_PASSWORD || 'admin123',
        role: 'admin',
        balance: 10000000,
        phone: '+91 98765 43210',
      });
      console.log(`✅ Seeded Super Admin: ${adminEmail} (password: admin123)`);
    }

    // 3. Seed Primary Trader if empty
    const userCount = await User.countDocuments({ role: 'user' });
    if (userCount === 0) {
      await User.create({
        uid: 'PAYNEX-884920',
        name: 'Sachin Kumar (Skraj0451)',
        email: 'skraj0451@gmail.com',
        phone: '+91 98765 43210',
        password: 'password123',
        balance: 0,
        totalStaked: 0,
        totalWon: 0,
        kycStatus: 'Verified',
      });
      console.log('✅ Seeded primary user: skraj0451@gmail.com');
    }

    // 4. Seed Investment Plans if empty
    const planCount = await Plan.countDocuments();
    if (planCount === 0) {
      const samplePlans = [
        {
          id: 'plan_starter',
          name: 'Starter Plan',
          dailyProfit: 3.5,
          durationDays: 7,
          minAmount: 1000,
          maxAmount: 10000,
          totalYield: 24.5,
          activeSubscribers: 412,
          color: '#06b6d4',
        },
        {
          id: 'plan_bronze',
          name: 'Bronze Growth Plan',
          dailyProfit: 4.8,
          durationDays: 14,
          minAmount: 5000,
          maxAmount: 25000,
          totalYield: 67.2,
          activeSubscribers: 289,
          color: '#f59e0b',
        },
        {
          id: 'plan_silver',
          name: 'Silver Wealth Plan',
          dailyProfit: 6.2,
          durationDays: 21,
          minAmount: 10000,
          maxAmount: 50000,
          totalYield: 130.2,
          activeSubscribers: 198,
          color: '#38bdf8',
        },
        {
          id: 'plan_gold',
          name: 'Gold Staking Elite (+30% Engine)',
          dailyProfit: 7.5,
          durationDays: 30,
          minAmount: 25000,
          maxAmount: 200000,
          totalYield: 225.0,
          activeSubscribers: 345,
          color: '#eab308',
        },
        {
          id: 'plan_titan',
          name: 'VIP Titan Whale Pool',
          dailyProfit: 9.0,
          durationDays: 45,
          minAmount: 50000,
          maxAmount: 1000000,
          totalYield: 405.0,
          activeSubscribers: 104,
          color: '#10b981',
        },
      ];

      for (const p of samplePlans) {
        await Plan.create(p);
      }
      console.log('✅ Seeded 5 investment plans');
    }

    // 5. Clean testing: Do not seed dummy deposits, withdrawals, or staking rounds

    // 7. Seed Stock & Crypto Game Assets (50+ Stocks & Assets)
    const assetCount = await Asset.countDocuments();
    if (assetCount < 40) {
      for (const item of initialAssetsList) {
        await Asset.findOneAndUpdate(
          { $or: [{ id: item.id }, { symbol: item.symbol }] },
          { $set: item },
          { upsert: true, returnDocument: 'after' }
        );
      }
      console.log(`✅ Seeded and synchronized ${initialAssetsList.length} Stock & Crypto game assets with interest rates`);
    }
  } catch (error) {
    console.error('Seeding error:', error.message);
  }
};
