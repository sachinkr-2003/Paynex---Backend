import GatewayOrder from '../models/gatewayOrder.model.js';
import Deposit from '../models/deposit.model.js';
import User from '../models/user.model.js';
import Setting from '../models/setting.model.js';
import Asset from '../models/asset.model.js';
import { verifyBankPayment } from '../utils/paymentVerifier.js';

// @desc    Initiate new UPI Payment Gateway Order (10-min countdown session)
// @route   POST /api/gateway/initiate
export const initiateGatewayOrder = async (req, res) => {
  try {
    const { amount, companyId, companyName } = req.body;
    const userId = req.user.id;

    const numAmount = Number(amount);
    if (!numAmount || numAmount < 1000) {
      return res.status(400).json({ success: false, message: 'Minimum deposit amount is ₹1,000.' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Determine Admin UPI ID & Payee Name
    const settings = await Setting.findOne({ key: 'main_config' });
    let adminUpiId = settings?.upiId || '';
    let merchantName = 'Paynex Trading Desk';

    if (companyId) {
      const asset = await Asset.findOne({
        $or: [{ id: companyId }, { symbol: companyId.toUpperCase() }, { _id: companyId.match(/^[0-9a-fA-F]{24}$/) ? companyId : null }],
      });
      if (asset) {
        adminUpiId = asset.upiId || settings?.upiId || '';
        merchantName = `${asset.name} Desk`;
      }
    }

    // Generate unique Transaction / Order ID
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const transactionId = `PAYNEX-ORDER-${Date.now().toString().slice(-6)}${randomSuffix}`;

    // 10-minute session expiry
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Deep link Intent URIs
    const encodedMerchant = encodeURIComponent(merchantName);
    const baseUpiParams = `pa=${adminUpiId}&pn=${encodedMerchant}&am=${numAmount}&tr=${transactionId}&cu=INR&tn=Recharge_${transactionId}`;
    const upiUri = `upi://pay?${baseUpiParams}`;
    const phonepeUri = `phonepe://pay?${baseUpiParams}`;
    const paytmUri = `paytmmp://pay?${baseUpiParams}`;
    const gpayUri = `gpay://upi/pay?${baseUpiParams}`;

    // 1. Create Gateway Order
    const order = await GatewayOrder.create({
      userId: user._id,
      traderUid: user.uid,
      traderName: user.name,
      transactionId,
      amount: numAmount,
      adminUpiId,
      merchantName,
      status: 'Initiated',
      paymentMethod: 'UPI',
      companyId: companyId || '',
      companyName: companyName || merchantName,
      companyUpi: adminUpiId,
      expiresAt,
    });

    // NOTE: We DO NOT create a Deposit record here!
    // A deposit will ONLY be created and sent to administration once real payment is verified!

    return res.status(201).json({
      success: true,
      message: 'Payment session created with 10-minute validity.',
      order: {
        id: order._id,
        transactionId: order.transactionId,
        amount: order.amount,
        adminUpiId: order.adminUpiId,
        merchantName: order.merchantName,
        status: order.status,
        companyId: order.companyId,
        companyName: order.companyName,
        expiresAt: order.expiresAt,
        remainingSeconds: 600,
        upiUri,
        phonepeUri,
        paytmUri,
        gpayUri,
      },
    });
  } catch (error) {
    console.error('Initiate gateway order error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get Gateway Order details & remaining time
// @route   GET /api/gateway/orders/:transactionId
export const getGatewayOrder = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const order = await GatewayOrder.findOne({ transactionId });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Gateway order not found.' });
    }

    // Auto-expire if 10 minutes exceeded and status is still Pending
    if (order.status === 'Pending' && new Date() > order.expiresAt) {
      order.status = 'Expired';
      await order.save();
      await Deposit.findOneAndUpdate({ id: transactionId }, { status: 'Expired' });
    }

    const remainingSeconds = order.getRemainingSeconds();

    const encodedMerchant = encodeURIComponent(order.merchantName);
    const baseUpiParams = `pa=${order.adminUpiId}&pn=${encodedMerchant}&am=${order.amount}&tr=${order.transactionId}&cu=INR&tn=Recharge_${order.transactionId}`;

    return res.status(200).json({
      success: true,
      order: {
        id: order._id,
        transactionId: order.transactionId,
        amount: order.amount,
        adminUpiId: order.adminUpiId,
        merchantName: order.merchantName,
        status: order.status,
        userUtrNumber: order.userUtrNumber,
        companyName: order.companyName,
        expiresAt: order.expiresAt,
        remainingSeconds,
        upiUri: `upi://pay?${baseUpiParams}`,
        phonepeUri: `phonepe://pay?${baseUpiParams}`,
        paytmUri: `paytmmp://pay?${baseUpiParams}`,
        gpayUri: `gpay://upi/pay?${baseUpiParams}`,
      },
    });
  } catch (error) {
    console.error('Get gateway order error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Submit 12-Digit UTR for verification (moves order to 'Under Review')
// @route   POST /api/gateway/orders/:transactionId/submit-utr
export const submitOrderUtr = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { utr, screenshotProof } = req.body;

    if (!utr || typeof utr !== 'string') {
      return res.status(400).json({ success: false, message: 'Please provide the 12-digit UPI UTR / Reference number.' });
    }

    const cleanUtr = utr.trim();

    // Numeric or alphanumeric UTR check (at least 6 digits/chars)
    if (cleanUtr.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Invalid UTR format. Please enter a valid UPI reference / UTR number (at least 6 digits).',
      });
    }

    const order = await GatewayOrder.findOne({ transactionId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Gateway order not found.' });
    }

    if (order.status === 'Success' || order.status === 'Verified') {
      return res.status(400).json({ success: false, message: 'This order has already been verified and credited.' });
    }

    // Check 10-minute session expiry
    if (new Date() > order.expiresAt) {
      order.status = 'Expired';
      await order.save();
      return res.status(400).json({
        success: false,
        message: 'This payment session has expired (10-minute timeout). Please initiate a fresh recharge.',
      });
    }

    // Check duplicate UTR on other active orders
    const duplicate = await GatewayOrder.findOne({
      transactionId: { $ne: transactionId },
      userUtrNumber: cleanUtr,
      status: { $in: ['Under Review', 'Verified', 'Success'] },
    });
    if (duplicate) {
      return res.status(400).json({
        success: false,
        message: 'This 12-digit UTR has already been submitted on another order.',
      });
    }

    // ==============================================================
    // REAL-TIME BANK & NPCI PAYMENT VERIFICATION (IRCTC STYLE)
    // ==============================================================
    const verification = await verifyBankPayment({
      utr: cleanUtr,
      amount: order.amount,
      upiId: order.adminUpiId,
      transactionId: order.transactionId,
    });

    if (!verification.verified) {
      // Payment NOT made or fake UTR -> FAIL IMMEDIATELY ON THE SPOT
      order.status = 'Failed';
      order.userUtrNumber = cleanUtr;
      await order.save();

      // IMPORTANT: DO NOT CREATE ANY DEPOSIT RECORD! Admin queue will NEVER see this!
      return res.status(400).json({
        success: false,
        failed: true,
        message: verification.message || 'Payment Verification Failed: Acquiring bank did not confirm inbound credit. Please ensure you have paid before submitting.',
      });
    }

    // Real Payment CONFIRMED by Banking Rails
    order.userUtrNumber = cleanUtr;
    if (screenshotProof) order.screenshotProof = screenshotProof;
    order.status = 'Verified';
    order.submittedAt = new Date();
    await order.save();

    // Now (and ONLY now) register as a verified deposit for administration review
    await Deposit.findOneAndUpdate(
      { id: transactionId },
      {
        id: transactionId,
        userId: order.userId,
        traderUid: order.traderUid,
        traderName: order.traderName,
        amount: order.amount,
        method: order.companyName ? `Company QR (${order.companyName})` : 'UPI Gateway',
        utr: cleanUtr,
        screenshotProof: screenshotProof || order.screenshotProof || 'paynex_receipt_verified.png',
        status: 'Verified',
        isRealPaymentVerified: true,
        bankVerifiedAt: new Date(),
        bankReference: verification.bankRef || `NPCI-${cleanUtr}`,
      },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      success: true,
      verified: true,
      message: 'Real payment verified by banking network! Your payment of ₹' + order.amount + ' has been confirmed and forwarded to admin for instant wallet credit.',
      order: {
        transactionId: order.transactionId,
        amount: order.amount,
        userUtrNumber: order.userUtrNumber,
        status: order.status,
        submittedAt: order.submittedAt,
        bankReference: verification.bankRef,
      },
    });
  } catch (error) {
    console.error('Submit order UTR error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Admin: Get all Gateway Orders (with 'Under Review' queue filter)
// @route   GET /api/gateway/admin/orders
export const getAdminGatewayOrders = async (req, res) => {
  try {
    const { status, search } = req.query;
    const query = {};

    if (status && status !== 'All') {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { transactionId: { $regex: search, $options: 'i' } },
        { userUtrNumber: { $regex: search, $options: 'i' } },
        { traderName: { $regex: search, $options: 'i' } },
        { traderUid: { $regex: search, $options: 'i' } },
        { adminUpiId: { $regex: search, $options: 'i' } },
      ];
    }

    const orders = await GatewayOrder.find(query).sort({ createdAt: -1 });

    const underReviewCount = await GatewayOrder.countDocuments({ status: 'Under Review' });
    const pendingCount = await GatewayOrder.countDocuments({ status: 'Pending' });
    const successCount = await GatewayOrder.countDocuments({ status: 'Success' });

    return res.status(200).json({
      success: true,
      count: orders.length,
      underReviewCount,
      pendingCount,
      successCount,
      orders,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Admin: Approve Gateway Order and credit trader wallet
// @route   PUT /api/gateway/admin/orders/:transactionId/approve
export const approveGatewayOrder = async (req, res) => {
  try {
    const { transactionId } = req.params;

    const order = await GatewayOrder.findOne({
      $or: [{ transactionId }, { id: transactionId }, { _id: transactionId.match(/^[0-9a-fA-F]{24}$/) ? transactionId : null }],
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Gateway order not found.' });
    }

    if (order.status === 'Success') {
      return res.status(400).json({ success: false, message: 'Order has already been approved.' });
    }

    order.status = 'Success';
    order.verifiedAt = new Date();
    await order.save();

    // Auto-credit User Wallet
    const user = await User.findById(order.userId);
    if (user) {
      user.balance += order.amount;
      await user.save();
    }

    // Sync to Deposit collection
    await Deposit.findOneAndUpdate(
      { $or: [{ id: order.transactionId }, { id: transactionId }] },
      { status: 'Approved' }
    );

    return res.status(200).json({
      success: true,
      message: `Payment of ₹${order.amount.toLocaleString('en-IN')} approved! Balance credited to ${order.traderName}.`,
      order,
      newBalance: user?.balance,
    });
  } catch (error) {
    console.error('Approve gateway order error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Admin: Reject Gateway Order
// @route   PUT /api/gateway/admin/orders/:transactionId/reject
export const rejectGatewayOrder = async (req, res) => {
  try {
    const { transactionId } = req.params;

    const order = await GatewayOrder.findOne({
      $or: [{ transactionId }, { id: transactionId }, { _id: transactionId.match(/^[0-9a-fA-F]{24}$/) ? transactionId : null }],
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Gateway order not found.' });
    }

    order.status = 'Failed';
    order.verifiedAt = new Date();
    await order.save();

    await Deposit.findOneAndUpdate(
      { $or: [{ id: order.transactionId }, { id: transactionId }] },
      { status: 'Rejected' }
    );

    return res.status(200).json({
      success: true,
      message: `Gateway order ${order.transactionId} has been marked as Rejected.`,
      order,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
