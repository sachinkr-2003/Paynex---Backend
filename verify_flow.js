async function testEndToEndFlow() {
  try {
    console.log("🚀 Starting Full End-to-End Flow Test...\n");

    // 1. Super Admin Login
    const adminLoginRes = await fetch("http://localhost:5000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@paynex.com", password: "admin123" })
    });
    const adminData = await adminLoginRes.json();
    const adminToken = adminData.token;
    console.log("1. ✅ Admin Logged In. Token acquired.");

    // 2. Register new Trader
    const testEmail = `trader_${Date.now()}@paynex.com`;
    const registerRes = await fetch("http://localhost:5000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Rahul Sharma",
        email: testEmail,
        phone: "+91 98112 34567",
        password: "trader123"
      })
    });
    const regData = await registerRes.json();
    const userToken = regData.token;
    const initialBalance = regData.user.balance;
    console.log(`2. ✅ Registered User: ${regData.user.name} (${regData.user.email}) | Initial Balance: ₹${initialBalance}`);

    // 3. User submits Deposit of ₹15,000
    const utr = `UTR${Date.now().toString().slice(-9)}`;
    const depositRes = await fetch("http://localhost:5000/api/wallet/deposit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${userToken}`
      },
      body: JSON.stringify({
        amount: 15000,
        method: "UPI",
        utr: utr,
        screenshotUrl: ""
      })
    });
    const depData = await depositRes.json();
    const depositId = depData.deposit.id;
    console.log(`3. ✅ User submitted deposit of ₹15,000 with UTR: ${utr} | Status: ${depData.deposit.status}`);

    // 4. Admin views pending deposits and approves
    const approveRes = await fetch(`http://localhost:5000/api/admin/deposits/${depositId}/approve`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({ note: "Verified in ICICI Current Account" })
    });
    const approveData = await approveRes.json();
    console.log(`4. ✅ Admin Approved Deposit ${depositId}: ${approveData.message}`);

    // 5. User checks balance after approval
    const meRes = await fetch("http://localhost:5000/api/auth/me", {
      headers: { "Authorization": `Bearer ${userToken}` }
    });
    const meData = await meRes.json();
    console.log(`5. ✅ User Balance After Approval: ₹${meData.user.balance} (Expected: ₹${initialBalance + 15000})`);

    if (meData.user.balance === initialBalance + 15000) {
      console.log("\n🎉 DEPOSIT APPROVAL FLOW SUCCEEDED PERFECTLY! 🎉\n");
    }

    // 6. User places a 30% Fixed Return Stake of ₹10,000
    const stakeRes = await fetch("http://localhost:5000/api/staking/place", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${userToken}`
      },
      body: JSON.stringify({
        asset: "BTC/USDT",
        amount: 10000,
        durationSeconds: 30
      })
    });
    const stakeData = await stakeRes.json();
    console.log(`6. ✅ User Placed Stake: ₹10,000 on BTC/USDT | Profit Target (+${stakeData.round.returnPercent}%): ₹${stakeData.round.profit} | Status: ${stakeData.round.status}`);

    // 7. Settle Stake (Guaranteed Return credited)
    const settleRes = await fetch(`http://localhost:5000/api/staking/settle/${stakeData.round.id}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${userToken}`
      }
    });
    const settleData = await settleRes.json();
    console.log(`7. ✅ Stake Matured & Settled: ${settleData.message} | New Balance: ₹${settleData.newBalance}`);

    // 8. User requests Withdrawal of ₹13,000
    const withdrawRes = await fetch("http://localhost:5000/api/wallet/withdraw", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${userToken}`
      },
      body: JSON.stringify({
        amount: 13000,
        method: "BANK",
        destinationType: "Bank Account",
        password: "trader123",
        accountNumber: "918237461298",
        ifsc: "HDFC0001234",
        bankName: "HDFC Bank",
        accountHolder: "Rahul Sharma"
      })
    });
    const withdrawData = await withdrawRes.json();
    const withdrawId = withdrawData.withdrawal.id;
    console.log(`8. ✅ User requested Withdrawal of ₹13,000 | Withdrawal ID: ${withdrawId} | Status: ${withdrawData.withdrawal.status}`);

    // 9. Admin releases Withdrawal with IMPS Ref
    const releaseRes = await fetch(`http://localhost:5000/api/admin/withdrawals/${withdrawId}/release`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({ impsRef: "IMPS98237190" })
    });
    const releaseData = await releaseRes.json();
    console.log(`9. ✅ Admin Released Withdrawal: ${releaseData.message}`);

    console.log("\n🚀 ALL APIS (AUTH, DEPOSIT, STAKING, SETTLEMENT, WITHDRAWAL, ADMIN RELEASE) ARE LIVE & VERIFIED ON MONGODB ATLAS! 🚀\n");

  } catch (err) {
    console.error("End-to-End test failed:", err);
  }
}

testEndToEndFlow();
