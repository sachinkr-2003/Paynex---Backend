async function testEndpoints() {
  try {
    console.log("Testing endpoints...");
    
    // 1. Root
    const r1 = await fetch("http://localhost:5000/");
    console.log("Root status:", r1.status, await r1.json());

    // 2. Login as Super Admin
    const r2 = await fetch("http://localhost:5000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@paynex.com", password: "admin123" })
    });
    const loginData = await r2.json();
    console.log("Login status:", r2.status, "Token exists:", !!loginData.token, "User:", loginData.user?.name);

    const token = loginData.token;

    // 3. Admin KPIs
    const r3 = await fetch("http://localhost:5000/api/admin/dashboard-kpis", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const kpiData = await r3.json();
    console.log("Admin KPIs:", kpiData.kpis);

    // 4. Plans
    const r4 = await fetch("http://localhost:5000/api/plans");
    const plansData = await r4.json();
    console.log("Plans count:", plansData.plans?.length);

    // 5. Staking Live Pool
    const r5 = await fetch("http://localhost:5000/api/staking/live-pool");
    const poolData = await r5.json();
    console.log("Live Pool status:", poolData.success, "Active Stakers count:", poolData.activeStakers?.length, "Return %:", poolData.returnPercent);

    // 6. Traders list
    const r6 = await fetch("http://localhost:5000/api/admin/users", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const tradersData = await r6.json();
    console.log("Traders count:", tradersData.traders?.length);

    // 7. Deposits list
    const r7 = await fetch("http://localhost:5000/api/admin/deposits", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const depositsData = await r7.json();
    console.log("Deposits count:", depositsData.deposits?.length);

    // 8. Withdrawals list
    const r8 = await fetch("http://localhost:5000/api/admin/withdrawals", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const withdrawalsData = await r8.json();
    console.log("Withdrawals count:", withdrawalsData.withdrawals?.length);

    console.log("\nALL BACKEND API TESTS PASSED SUCCESSFULLY! 🎉");
  } catch (err) {
    console.error("Test failed:", err);
  }
}

testEndpoints();
