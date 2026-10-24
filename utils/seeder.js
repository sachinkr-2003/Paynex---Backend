import User from '../models/user.model.js';
import Deposit from '../models/deposit.model.js';
import Withdrawal from '../models/withdrawal.model.js';
import StakingRound from '../models/stakingRound.model.js';
import Plan from '../models/plan.model.js';
import Setting from '../models/setting.model.js';

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
        reserveBalance: 12500000,
        supportHelpline: '1800 234 5678',
        supportEmail: 'support@paynexcrypto.io',
        whatsappCare: '+91 98765 43210',
        telegramChannel: 'https://t.me/paynexcrypto_support',
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

    // 3. Seed Sample Traders if empty
    const userCount = await User.countDocuments({ role: 'user' });
    if (userCount === 0) {
      const sampleTraders = [
        {
          uid: 'PAYNEX-884920',
          name: 'Sachin Kumar (Skraj0451)',
          email: 'skraj0451@gmail.com',
          phone: '+91 98765 43210',
          password: 'password123',
          balance: 25480,
          totalStaked: 145000,
          totalWon: 188500,
          kycStatus: 'Verified',
        },
        {
          uid: 'PAYNEX-771204',
          name: 'Rahul Sharma',
          email: 'rahul.sharma@gmail.com',
          phone: '+91 98112 34567',
          password: 'password123',
          balance: 18500,
          totalStaked: 85000,
          totalWon: 110500,
          kycStatus: 'Verified',
        },
        {
          uid: 'PAYNEX-662911',
          name: 'Vikram Patel',
          email: 'vikram.patel@yahoo.com',
          phone: '+91 97234 56789',
          password: 'password123',
          balance: 42000,
          totalStaked: 220000,
          totalWon: 286000,
          kycStatus: 'Verified',
        },
        {
          uid: 'PAYNEX-554182',
          name: 'Pooja Verma',
          email: 'pooja.verma@outlook.com',
          phone: '+91 98987 65432',
          password: 'password123',
          balance: 8900,
          totalStaked: 34000,
          totalWon: 44200,
          kycStatus: 'Under Review',
        },
        {
          uid: 'PAYNEX-443901',
          name: 'Aman Gupta',
          email: 'aman.gupta@fintech.io',
          phone: '+91 99881 22334',
          password: 'password123',
          balance: 65400,
          totalStaked: 310000,
          totalWon: 403000,
          kycStatus: 'Verified',
        },
        {
          uid: 'PAYNEX-332194',
          name: 'Sneha Roy',
          email: 'sneha.roy@gmail.com',
          phone: '+91 98451 98765',
          password: 'password123',
          balance: 12200,
          totalStaked: 58000,
          totalWon: 75400,
          kycStatus: 'Verified',
        },
      ];

      for (const t of sampleTraders) {
        await User.create(t);
      }
      console.log('✅ Seeded initial registered traders');
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

    // 5. Seed sample Deposits if empty
    const depCount = await Deposit.countDocuments();
    if (depCount === 0) {
      const user = await User.findOne({ email: 'rahul.sharma@gmail.com' });
      if (user) {
        await Deposit.create([
          {
            id: 'DEP-88412',
            userId: user._id,
            traderUid: user.uid,
            traderName: user.name,
            amount: 5000,
            method: 'UPI',
            utr: '423981029384',
            status: 'Pending',
          },
          {
            id: 'DEP-88411',
            userId: user._id,
            traderUid: user.uid,
            traderName: user.name,
            amount: 15000,
            method: 'IMPS',
            utr: '423980112489',
            status: 'Pending',
          },
          {
            id: 'DEP-88409',
            userId: user._id,
            traderUid: user.uid,
            traderName: user.name,
            amount: 10000,
            method: 'UPI',
            utr: '423979841203',
            status: 'Approved',
          },
        ]);
        console.log('✅ Seeded sample deposits');
      }
    }

    // 6. Seed sample Withdrawals if empty
    const wthCount = await Withdrawal.countDocuments();
    if (wthCount === 0) {
      const user = await User.findOne({ email: 'rahul.sharma@gmail.com' });
      if (user) {
        await Withdrawal.create([
          {
            id: 'WTH-44810',
            userId: user._id,
            traderUid: user.uid,
            traderName: user.name,
            amount: 12500,
            destinationType: 'UPI',
            upiId: 'rahul@oksbi',
            status: 'Pending',
          },
          {
            id: 'WTH-44809',
            userId: user._id,
            traderUid: user.uid,
            traderName: user.name,
            amount: 25000,
            destinationType: 'Bank A/C',
            bankName: 'HDFC Bank',
            accountNumber: '•••• 4821',
            ifsc: 'HDFC0001234',
            status: 'Pending',
          },
          {
            id: 'WTH-44808',
            userId: user._id,
            traderUid: user.uid,
            traderName: user.name,
            amount: 4500,
            destinationType: 'UPI',
            upiId: 'sneha@kotak',
            status: 'Completed',
            impsRef: 'IMPS42398011248',
          },
        ]);
        console.log('✅ Seeded sample withdrawals');
      }
    }

    // 7. Seed sample Staking Rounds if empty
    const rndCount = await StakingRound.countDocuments();
    if (rndCount === 0) {
      const user = await User.findOne({ email: 'rahul.sharma@gmail.com' });
      if (user) {
        await StakingRound.create([
          {
            id: 'RND-88910',
            userId: user._id,
            traderUid: user.uid,
            traderName: 'Rahul Sharma',
            asset: 'BTC/USDT',
            stakedAmount: 2500,
            returnPercent: 30,
            profit: 750,
            payout: 3250,
            durationSeconds: 30,
            status: 'Active',
            time: 'Just now',
          },
          {
            id: 'RND-88911',
            userId: user._id,
            traderUid: user.uid,
            traderName: 'Vikram Patel',
            asset: 'BTC/USDT',
            stakedAmount: 5000,
            returnPercent: 30,
            profit: 1500,
            payout: 6500,
            durationSeconds: 60,
            status: 'Active',
            time: '5s ago',
          },
          {
            id: 'RND-88912',
            userId: user._id,
            traderUid: user.uid,
            traderName: 'Sachin Kumar',
            asset: 'ETH/USDT',
            stakedAmount: 5000,
            returnPercent: 30,
            profit: 1500,
            payout: 6500,
            durationSeconds: 30,
            status: 'Active',
            time: '12s ago',
          },
        ]);
        console.log('✅ Seeded sample staking rounds');
      }
    }
  } catch (error) {
    console.error('Seeding error:', error.message);
  }
};
