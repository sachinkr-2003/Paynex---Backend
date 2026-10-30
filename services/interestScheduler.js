import cron from 'node-cron';
import StakingRound from '../models/stakingRound.model.js';
import User from '../models/user.model.js';

/**
 * Distributes daily interest to all active stock investment contracts.
 * Example: User invests ₹500 in Tata Motors Ltd at 4% return -> ₹20 interest added to wallet at 5:00 AM IST.
 * 
 * @param {Object} options
 * @param {boolean} options.force - If true, bypasses "already credited today" check (useful for manual admin tests)
 */
export async function distributeDailyInterest({ force = false } = {}) {
  const now = new Date();
  const istDateString = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
  const istTimeString = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });

  console.log(`[5 AM Interest Engine] Running interest distribution at ${istTimeString} IST (${istDateString})...`);

  // Find all currently active stock investments
  const activeRounds = await StakingRound.find({ status: 'Active' });
  if (activeRounds.length === 0) {
    console.log('[5 AM Interest Engine] No active stock investments found.');
    return {
      success: true,
      message: 'No active stock investments found to process.',
      processedCount: 0,
      totalDistributed: 0,
      details: [],
    };
  }

  let processedCount = 0;
  let totalDistributed = 0;
  const details = [];

  // Today's 5:00 AM IST threshold
  const today5amIST = new Date(`${istDateString}T05:00:00+05:30`);

  for (const round of activeRounds) {
    try {
      // 1. Contracts created today on or after 5:00 AM IST are NOT eligible for today's 5 AM interest.
      // Their first 24h interest cycle starts at tomorrow's 5:00 AM IST.
      if (!force && round.createdAt && new Date(round.createdAt) >= today5amIST) {
        console.log(`[5 AM Interest Engine] Contract ${round.id || round._id} was created today after 5:00 AM (${round.createdAt.toISOString()}). First interest will be credited at tomorrow 5:00 AM.`);
        continue;
      }

      // 2. Unless force=true, ensure user hasn't already received today's interest
      if (!force && round.lastInterestCreditedAt) {
        const lastCreditIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
          new Date(round.lastInterestCreditedAt)
        );
        if (lastCreditIST === istDateString) {
          // Already credited today
          continue;
        }
      }

      const user = await User.findById(round.userId);
      if (!user) {
        console.warn(`[5 AM Interest Engine] User not found for contract ${round.id}`);
        continue;
      }

      // Calculate Daily Interest (e.g. 500 * 4% = ₹20)
      const rate = round.returnPercent || 4;
      const principal = round.stakedAmount || 0;
      const dailyInterest = Math.max(1, Math.round((principal * rate) / 100));

      // 1. Credit directly to user wallet balance and totalWon
      user.balance = (user.balance || 0) + dailyInterest;
      user.totalWon = (user.totalWon || 0) + dailyInterest;
      await user.save();

      // 2. Update Contract tracking
      round.dailyInterest = dailyInterest;
      round.totalInterestEarned = (round.totalInterestEarned || 0) + dailyInterest;
      round.daysCredited = (round.daysCredited || 0) + 1;
      round.profit = round.totalInterestEarned;
      round.payout = round.stakedAmount + round.totalInterestEarned;
      round.lastInterestCreditedAt = new Date();

      if (!round.interestHistory) {
        round.interestHistory = [];
      }
      round.interestHistory.unshift({
        date: new Date(),
        amount: dailyInterest,
        returnPercent: rate,
        balanceAfter: user.balance,
        note: `5:00 AM Daily Interest on ${round.asset} (+${rate}%)`,
      });

      await round.save();

      processedCount++;
      totalDistributed += dailyInterest;
      details.push({
        roundId: round.id,
        userUid: user.uid,
        userName: user.name,
        asset: round.asset,
        stakedAmount: principal,
        returnPercent: rate,
        dailyInterest,
        totalInterestEarned: round.totalInterestEarned,
        newUserBalance: user.balance,
      });

      console.log(
        `[5 AM Interest Engine] ✅ Credited ₹${dailyInterest} to ${user.name} (${user.uid}) for ${round.asset} (Rate: ${rate}%). New Balance: ₹${user.balance}`
      );
    } catch (roundError) {
      console.error(`[5 AM Interest Engine] Error processing contract ${round.id}:`, roundError);
    }
  }

  console.log(
    `[5 AM Interest Engine] Summary: Processed ${processedCount} investments, Total ₹${totalDistributed} distributed.`
  );

  return {
    success: true,
    message: `Daily interest distributed across ${processedCount} active stock investments. Total ₹${totalDistributed.toLocaleString('en-IN')} credited.`,
    processedCount,
    totalDistributed,
    dateIST: istDateString,
    details,
  };
}

/**
 * Catch-up check: If server starts or wakes up after 5:00 AM IST,
 * verify if any active contracts missed today's 5:00 AM interest and credit them immediately.
 */
export async function checkAndCatchUpDailyInterest() {
  try {
    const now = new Date();
    const istHourStr = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Asia/Kolkata',
    }).format(now);
    const istHour = parseInt(istHourStr, 10);

    // Only run catch-up between 5 AM and 7 AM IST to avoid unnecessary runs all day
    if (istHour >= 5 && istHour <= 7) {
      console.log(`[5 AM Catch-Up] Current IST Hour is ${istHour}:00 (>= 5 AM). Checking for uncredited contracts...`);
      await distributeDailyInterest({ force: false });
    }
  } catch (err) {
    console.error('[5 AM Catch-Up] Error during catch-up check:', err);
  }
}

/**
 * Initializes the automated 5:00 AM IST Cron Job
 */
export function initDailyInterestScheduler() {
  // 1. Exact 5:00 AM IST Cron Schedule: "0 5 * * *"
  cron.schedule(
    '0 5 * * *',
    async () => {
      console.log('⏰ [5:00 AM CRON FIRED] Executing automated daily stock interest distribution...');
      await distributeDailyInterest({ force: false });
    },
    {
      scheduled: true,
      timezone: 'Asia/Kolkata',
    }
  );

  // 2. Periodic Catch-Up hourly check in case server rebooted or was suspended during 5 AM
  cron.schedule(
    '15 * * * *',
    async () => {
      await checkAndCatchUpDailyInterest();
    },
    {
      scheduled: true,
      timezone: 'Asia/Kolkata',
    }
  );

  console.log('⚡ [Scheduler Initialized] 5:00 AM IST Automated Daily Stock Interest Engine is ACTIVE (Asia/Kolkata).');

  // 3. Run initial catch-up 10 seconds after server starts
  setTimeout(() => {
    checkAndCatchUpDailyInterest();
  }, 10000);
}
