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
router.get('/admin/orders', getAdminGatewayOrders);
router.put('/admin/orders/:transactionId/approve', approveGatewayOrder);
router.put('/admin/orders/:transactionId/reject', rejectGatewayOrder);

export default router;
