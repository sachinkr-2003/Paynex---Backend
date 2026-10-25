import Deposit from '../models/deposit.model.js';
import Withdrawal from '../models/withdrawal.model.js';
import User from '../models/user.model.js';
import Setting from '../models/setting.model.js';
import { verifyBankPayment } from '../utils/paymentVerifier.js';

// @desc    Get user wallet details, deposits, and withdrawals
// @route   GET /api/wallet/history
export const getWalletHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId).select('balance uid name');
    const deposits = await Deposit.find({ userId }).sort({ createdAt: -1 });
    const withdrawals = await Withdrawal.find({ userId }).sort({ createdAt: -1 });
    const settings = await Setting.findOne({ key: 'main_config' });

    return res.status(200).json({
      success: true,
      balance: user.balance,
      deposits,
      withdrawals,
      gatewayConfig: {
        officialUpiId: settings?.officialUpiId || 'paynex.crypto@icici',
        merchantName: settings?.merchantName || 'Paynex Crypto Technologies Pvt Ltd',
        minDeposit: settings?.minDeposit || 500,
        minWithdrawal: settings?.minWithdrawal || 1000,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Submit deposit request with UTR
// @route   POST /api/wallet/deposit
export const submitDeposit = async (req, res) => {
  try {
    const { amount, utr, method, screenshotProof, companyId, companyName, companyUpi } = req.body;
    const userId = req.user.id;

    if (!amount || !utr) {
      return res.status(400).json({ success: false, message: 'Amount and 12-digit UTR number are required.' });
    }

    const settings = await Setting.findOne({ key: 'main_config' });
    const minDeposit = settings?.minDeposit || 500;
    if (Number(amount) < minDeposit) {
      return res.status(400).json({ success: false, message: `Minimum deposit amount is ₹${minDeposit}.` });
    }

    // Check duplicate UTR
    const existingUtr = await Deposit.findOne({ utr: utr.trim() });
    if (existingUtr) {
      return res.status(400).json({ success: false, message: 'This UTR has already been submitted for verification.' });
    }

    // ==============================================================
    // REAL-TIME BANK & NPCI PAYMENT VERIFICATION (IRCTC STYLE)
    // ==============================================================
    const verification = await verifyBankPayment({
      utr: utr.trim(),
      amount: Number(amount),
      upiId: companyUpi || settings?.officialUpiId,
    });

    if (!verification.verified) {
      // Payment NOT detected on banking rails -> FAIL ON THE SPOT
      // DO NOT create any deposit record for administration!
      return res.status(400).json({
        success: false,
        failed: true,
        message: verification.message || 'Payment Verification Failed: Acquiring bank did not confirm inbound credit. Please ensure you have paid via UPI before submitting.',
      });
    }

    const user = await User.findById(userId);

    // Create verified deposit record for administration review
    const deposit = await Deposit.create({
      userId,
      traderUid: user?.uid || 'PAYNEX-USER',
      traderName: user?.name || 'Trader',
      amount: Number(amount),
      method: method || 'UPI',
      utr: verification.cleanUtr,
      screenshotProof: screenshotProof || 'paynex_receipt_verified.png',
      companyId: companyId || '',
      companyName: companyName || '',
      companyUpi: companyUpi || '',
      status: 'Verified',
      isRealPaymentVerified: true,
      bankVerifiedAt: new Date(),
      bankReference: verification.bankRef || `NPCI-${verification.cleanUtr}`,
    });

    return res.status(201).json({
      success: true,
      verified: true,
      message: 'Real payment verified by banking network! Your payment of ₹' + amount + ' has been confirmed and forwarded to admin for instant credit.',
      deposit,
    });
  } catch (error) {
    console.error('Submit deposit error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Submit withdrawal request with password security verification
// @route   POST /api/wallet/withdraw
export const submitWithdrawal = async (req, res) => {
  try {
    const { amount, method, destinationType, upiId, bankName, accountNumber, ifsc, accountHolder, password } = req.body;
    const userId = req.user.id;

    if (!password || typeof password !== 'string' || !password.trim()) {
      return res.status(401).json({
        success: false,
        message: 'Security Verification Required: Please enter your account login password to authorize this withdrawal.',
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Verify that entered password matches the account password used to login
    const isPasswordMatch = await user.comparePassword(password.trim());
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Incorrect Password! Withdrawal authorization failed. Please enter the valid password you use to log in.',
      });
    }

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Please provide a valid withdrawal amount.' });
    }

    const numAmount = Number(amount);
    const settings = await Setting.findOne({ key: 'main_config' });
    const minWithdrawal = settings?.minWithdrawal || 1000;

    if (numAmount < minWithdrawal) {
      return res.status(400).json({ success: false, message: `Minimum withdrawal amount is ₹${minWithdrawal}.` });
    }

    if (settings?.emergencyFreeze) {
      return res.status(403).json({ success: false, message: 'Withdrawals are currently suspended due to system maintenance.' });
    }

    if (user.balance < numAmount) {
      return res.status(400).json({ success: false, message: 'Insufficient wallet balance for withdrawal.' });
    }

    // Deduct balance (hold funds)
    user.balance -= numAmount;
    await user.save();

    const withdrawal = await Withdrawal.create({
      userId,
      traderUid: user.uid,
      traderName: user.name,
      amount: numAmount,
      destinationType: destinationType || 'UPI',
      upiId: upiId || user.bankDetails?.upiId || '',
      bankName: bankName || user.bankDetails?.bankName || '',
      accountNumber: accountNumber || user.bankDetails?.accountNumber || '',
      ifsc: ifsc || user.bankDetails?.ifsc || '',
      status: 'Pending',
    });

    return res.status(201).json({
      success: true,
      message: 'Withdrawal request registered. Payout will be dispatched via IMPS.',
      withdrawal,
      newBalance: user.balance,
    });
  } catch (error) {
    console.error('Submit withdrawal error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
