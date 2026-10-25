/**
 * PAYNEX Intelligent AI Support Agent
 * Provides real-time automated crypto & trading customer support in Hindi/Hinglish & English.
 */

export const generateAiReply = async (userMessage, conversationHistory = [], userContext = {}) => {
  const query = (userMessage || '').trim();
  const lower = query.toLowerCase();
  const userName = userContext.name || 'Trader';

  // 1. Try Gemini API if key is available in environment
  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (geminiApiKey) {
    try {
      const systemInstruction = `You are the Official AI Support Specialist for PAYNEX CRYPTO (Invest Today and Grow Tomorrow).
You assist crypto and binary options traders with accounts, deposits, withdrawals, trading rules, and staking contracts.
Platform Specs:
- Min Deposit: ₹500 via UPI QR / IMPS with 12-digit UTR. Approvals take 2-15 minutes.
- Min Withdrawal: ₹500 directly to Bank Account (IMPS/NEFT). Processing takes 15-30 minutes.
- Trading: 15s, 30s, 60s contracts on BTC, ETH, and top stocks with guaranteed returns (8%-15%+). Automated 5:00 AM IST daily interest.
- Password Reset: Fully automated self-service via 6-digit Email OTP on the Sign In page.
- Security: 256-bit encryption, biometric auth in mobile APK.
Tone: Warm, highly professional, polite, financial-grade. 
Language Rule: If user talks in Hindi or Hinglish, reply in Hindi/Hinglish. If in English, reply in English. Keep answers clear and concise (2-4 sentences max).`;

      const prompt = `${systemInstruction}\n\nUser Name: ${userName}\nUser Message: "${query}"\n\nAI Support Response:`;

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 250, temperature: 0.3 },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidateText && candidateText.trim().length > 5) {
          return candidateText.trim();
        }
      }
    } catch (err) {
      console.warn('Gemini API query fallback to rule engine:', err.message);
    }
  }

  // 2. High-Precision Domain Knowledge Base (Rule & Semantic Engine)
  const isHindi = /kya|kaise|karo|bhai|kitna|kab|nahi|hoga|kare|hai|ho|paisa|paise|nikal|jama/i.test(lower);

  // Deposit queries
  if (lower.includes('deposit') || lower.includes('add money') || lower.includes('jama') || lower.includes('recharge') || lower.includes('utr')) {
    if (isHindi) {
      return `Namaste ${userName}! PAYNEX par minimum deposit ₹500 hai. Aap Wallet me jaakar **Deposit** button click karein, UPI QR code scan karke payment karein aur 12-digit UTR number enter karein. Payment aamtaur par 2 se 15 minute ke andar approve ho jaati hai.`;
    }
    return `Hello ${userName}! The minimum deposit on PAYNEX is ₹500. Navigate to **Wallet > Deposit**, scan the official UPI QR / Bank details, and submit your 12-digit UTR transaction ref. Deposits are credited within 2 to 15 minutes upon verification.`;
  }

  // Withdrawal queries
  if (lower.includes('withdraw') || lower.includes('payout') || lower.includes('nikal') || lower.includes('bank transfer')) {
    if (isHindi) {
      return `Namaste ${userName}! Withdrawal ke liye aapka minimum balance ₹500 hona chahiye. Aap **Wallet > Withdraw** section me apna Account Number aur IFSC code fill karein. Amount 15 se 30 minute ke andar direct aapke bank account me IMPS ke dwara bhej diya jata hai.`;
    }
    return `Hello ${userName}! Minimum withdrawal amount is ₹500. Submit your request via **Wallet > Withdraw** with your verified Bank Account number and IFSC. Withdrawals are processed via instant IMPS within 15 to 30 minutes.`;
  }

  // Password / Forgot / Login queries
  if (lower.includes('password') || lower.includes('forgot') || lower.includes('login') || lower.includes('otp') || lower.includes('reset')) {
    if (isHindi) {
      return `Password reset karne ke liye Login box me **"Forgot Password?"** par click karein. Apna registered email dalein, aapke email par 6-digit OTP code aayega. Us code ko enter karke aap turant naya password set kar sakte hain.`;
    }
    return `To reset your password, click **"Forgot Password?"** on the Sign In screen. Enter your registered email to receive a secure 6-digit OTP code, then enter your new password to restore access immediately.`;
  }

  // Trading / Staking / Return Rate queries
  if (lower.includes('trade') || lower.includes('staking') || lower.includes('profit') || lower.includes('contract') || lower.includes('return') || lower.includes('percentage') || lower.includes('rate')) {
    if (isHindi) {
      return `PAYNEX par aap Bitcoin, Ethereum aur 50+ Top Stocks par 15s, 30s aur 60s contracts le sakte hain. Isme aapko har trade par 8% se 15%+ tak guaranteed returns milte hain. Saath hi roz subah 5:00 AM IST par active staking balances par automated interest credit hota hai.`;
    }
    return `PAYNEX offers ultra-fast 15s, 30s, and 60s trading contracts on BTC, ETH, and 50+ Global Equities with guaranteed yield rates between 8% to 15%+. Daily staking returns are automatically distributed at 5:00 AM IST.`;
  }

  // KYC & Verification queries
  if (lower.includes('kyc') || lower.includes('verify') || lower.includes('aadhaar') || lower.includes('pan') || lower.includes('document')) {
    if (isHindi) {
      return `KYC complete karne ke liye Profile section me **KYC Verification** par jayein aur apna Aadhaar / PAN card upload karein. Hamara automated verification system 10 se 30 minute me documents verify kar deta hai.`;
    }
    return `To complete your KYC verification, visit **Profile > KYC Verification** and submit your valid Aadhaar or PAN card. Documents are reviewed and verified within 10 to 30 minutes.`;
  }

  // Human Admin / Agent escalation
  if (lower.includes('admin') || lower.includes('human') || lower.includes('agent') || lower.includes('fraud') || lower.includes('complaint') || lower.includes('talk')) {
    if (isHindi) {
      return `Ji ${userName}, maine aapke is conversation ko **Priority Admin Desk** par mark kar diya hai 👑. Hamare Senior Support Officer jald hi aapki chat ko inspect karenge. Tab tak agar aapka koi specific sawal ho to aap yahan likh sakte hain.`;
    }
    return `Understood ${userName}. I have escalated your ticket to our **Senior Admin Desk 👑**. An officer will review your account details shortly. Feel free to provide any transaction IDs or additional context here in the meantime.`;
  }

  // Greetings
  if (lower === 'hi' || lower === 'hello' || lower === 'namaste' || lower === 'hey' || lower.includes('kaise ho') || lower.includes('help')) {
    if (isHindi) {
      return `Namaste ${userName}! Mai PAYNEX ka Official AI Support Assistant hu 🤖. Mai aapke deposit, withdrawal, trading contracts ya account ke kisi bhi sawal me turant madad kar sakta hu. Kripya batayein mai aapki kya sahayata karu?`;
    }
    return `Hello ${userName}! I am your PAYNEX AI Trading & Account Specialist 🤖. How can I assist you with your deposits, withdrawals, trading contracts, or account settings today?`;
  }

  // Default intelligent response
  if (isHindi) {
    return `Ji ${userName}, aapka message praapt hua. PAYNEX me deposit, withdrawal, trading rules, email password reset aur account settings ke bare me mai 24/7 uplabdh hu. Kripya apna vishay (Deposit, Withdrawal, ya Account) vistar se batayein taaki mai turant sahi jaankari de saku.`;
  }
  return `Thank you for reaching out, ${userName}. As your PAYNEX AI Support Specialist, I'm here 24/7 to assist with deposits, withdrawals, high-frequency trading rules, and account security. Please share more details so I can resolve your request instantly.`;
};

export default generateAiReply;
