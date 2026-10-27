import User from '../models/user.model.js';
import Deposit from '../models/deposit.model.js';
import Withdrawal from '../models/withdrawal.model.js';
import StakingRound from '../models/stakingRound.model.js';
import Plan from '../models/plan.model.js';
import Setting from '../models/setting.model.js';
import Asset from '../models/asset.model.js';
import { initialAssetsList } from './initialAssets.js';
import { G1, G2, G3, G4, G5, DEFAULT_GROUP_INTEREST } from '../controllers/asset.controller.js';

export const seedDatabase = async () => {
  try {
    // 1. Seed or update System Setting
    let setting = await Setting.findOne({ key: 'main_config' });
    if (!setting) {
      setting = await Setting.create({
        key: 'main_config',
        platformName: 'PAYNEX CRYPTO',
        officialUpiId: 'paynex.crypto@icici',
        merchantName: 'Paynex Crypto Technologies Pvt Ltd',
        minDeposit: 500,
        minWithdrawal: 1000,
        defaultGameProfitPercent: 30,
        groupInterestRates: DEFAULT_GROUP_INTEREST,
        groupQrs: { 1: '', 2: '', 3: '', 4: '', 5: '' },
        reserveBalance: 12500000,
        supportHelpline: '1800 234 5678',
        supportEmail: 'support@paynexcrypto.io',
        whatsappCare: '+91 98765 43210',
        telegramChannel: 'https://t.me/paynexcrypto_support',
      });
      console.log('✅ Seeded default system settings');
    } else if (!setting.groupInterestRates || Object.keys(setting.groupInterestRates).length < 5) {
      setting.groupInterestRates = {
        ...DEFAULT_GROUP_INTEREST,
        ...(setting.groupInterestRates || {}),
      };
      setting.markModified('groupInterestRates');
      await setting.save();
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

    // 3. Clean user base: Do not auto-seed dummy users (users will register cleanly via App/Web)

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

    // 8. Enforce 100% Uniform Group Interest Rate across all assets in MongoDB
    const currentRates = {
      ...DEFAULT_GROUP_INTEREST,
      ...(setting?.groupInterestRates || {}),
    };
    const groupsList = [G1, G2, G3, G4, G5];
    for (let g = 1; g <= 5; g++) {
      const gRate = Math.min(12, Math.max(2, Number(currentRates[g]) || DEFAULT_GROUP_INTEREST[g] || 5));
      const syms = groupsList[g - 1] || [];
      await Asset.updateMany(
        {
          $or: [
            { group: g },
            { symbol: { $in: syms } },
            { id: { $in: syms } },
          ],
        },
        { $set: { returnPercent: gRate, group: g } }
      );
    }
    console.log('✅ Synchronized 100% uniform Group Interest Rates (2%-12%) for all companies');
  } catch (error) {
    console.error('Seeding error:', error.message);
  }
};
