import express from 'express';
import {
  initiateGatewayOrder,
  getGatewayOrder,
  submitOrderUtr,
  getAdminGatewayOrders,
  approveGatewayOrder,
  rejectGatewayOrder,
} from '../controllers/gateway.controller.js';
import { protect, adminOnly } from '../middlewares/auth.middleware.js';

const router = express.Router();

// User Gateway Checkout Flow
router.post('/initiate', protect, initiateGatewayOrder);
router.get('/orders/:transactionId', getGatewayOrder);
router.post('/orders/:transactionId/submit-utr', submitOrderUtr);

// Admin Gateway Review Queue
router.get('/admin/orders', protect, adminOnly, getAdminGatewayOrders);
router.put('/admin/orders/:transactionId/approve', protect, adminOnly, approveGatewayOrder);
router.put('/admin/orders/:transactionId/reject', protect, adminOnly, rejectGatewayOrder);

export default router;
