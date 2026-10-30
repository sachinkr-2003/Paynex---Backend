import express from 'express';
import {
  getDashboardKPIs,
  getAllTraders,
  adjustUserBalance,
  updateUserStatus,
  getAllDeposits,
  approveDeposit,
  rejectDeposit,
  getAllWithdrawals,
  releaseWithdrawal,
  rejectWithdrawal,
  updateEngineRate,
  getSettings,
  updateSettings,
  triggerDailyInterest,
  adminResetUserPassword,
  getAdminNotifications,
} from '../controllers/admin.controller.js';
import { protect, adminOnly } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.get('/dashboard-kpis', protect, adminOnly, getDashboardKPIs);
router.get('/users', protect, adminOnly, getAllTraders);
router.get('/traders', protect, adminOnly, getAllTraders);
router.put('/users/:id/balance', protect, adminOnly, adjustUserBalance);
router.put('/users/:id/status', protect, adminOnly, updateUserStatus);
router.put('/users/:id/reset-password', protect, adminOnly, adminResetUserPassword);

router.get('/deposits', protect, adminOnly, getAllDeposits);
router.put('/deposits/:id/approve', protect, adminOnly, approveDeposit);
router.put('/deposits/:id/reject', protect, adminOnly, rejectDeposit);

router.get('/withdrawals', protect, adminOnly, getAllWithdrawals);
router.put('/withdrawals/:id/release', protect, adminOnly, releaseWithdrawal);
router.put('/withdrawals/:id/reject', protect, adminOnly, rejectWithdrawal);

router.put('/engine/rate', protect, adminOnly, updateEngineRate);
router.get('/notifications', protect, adminOnly, getAdminNotifications);
router.get('/settings', protect, adminOnly, getSettings);
router.put('/settings', protect, adminOnly, updateSettings);
router.post('/distribute-daily-interest', protect, adminOnly, triggerDailyInterest);

export default router;
