import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function cleanDemoData() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;

    // 1. Delete all demo deposits
    const delDeposits = await db.collection('deposits').deleteMany({});
    console.log('Deleted demo deposits:', delDeposits.deletedCount);

    // 2. Delete all demo withdrawals
    const delWithdrawals = await db.collection('withdrawals').deleteMany({});
    console.log('Deleted demo withdrawals:', delWithdrawals.deletedCount);

    // 3. Delete all demo staking rounds
    const delRounds = await db.collection('stakingrounds').deleteMany({});
    console.log('Deleted demo staking rounds:', delRounds.deletedCount);

    // 4. Delete demo dummy users, keeping super admin and main user (skraj0451@gmail.com)
    const delUsers = await db.collection('users').deleteMany({
      email: { $nin: ['admin@paynex.com', 'skraj0451@gmail.com'] }
    });
    console.log('Deleted demo users:', delUsers.deletedCount);

    // 5. Update settings to clean platform name 'Paynex'
    await db.collection('settings').updateOne(
      {},
      {
        $set: {
          platformName: 'PAYNEX CRYPTO',
          merchantName: 'Paynex Crypto Technologies Pvt Ltd',
          officialUpiId: 'paynex.crypto@icici',
        }
      },
      { upsert: true }
    );
    console.log('Settings updated to PAYNEX CRYPTO');

    // Verify remaining documents
    const assetCount = await db.collection('assets').countDocuments();
    const userCount = await db.collection('users').countDocuments();
    const depCount = await db.collection('deposits').countDocuments();
    const withCount = await db.collection('withdrawals').countDocuments();
    const roundCount = await db.collection('stakingrounds').countDocuments();

    console.log('--- CLEANUP STATUS ---');
    console.log('Assets/Companies count (PRESERVED):', assetCount);
    console.log('Users count (Admin + Main User):', userCount);
    console.log('Deposits count (Cleaned for testing):', depCount);
    console.log('Withdrawals count (Cleaned for testing):', withCount);
    console.log('Staking rounds count (Cleaned for testing):', roundCount);

    process.exit(0);
  } catch (err) {
    console.error('Error cleaning demo data:', err);
    process.exit(1);
  }
}

cleanDemoData();
