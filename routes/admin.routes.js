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

// Allow public/demo access or protected by protect & adminOnly
router.get('/dashboard-kpis', getDashboardKPIs);
router.get('/users', getAllTraders);
router.get('/traders', getAllTraders);
router.put('/users/:id/balance', adjustUserBalance);
router.put('/users/:id/status', updateUserStatus);
router.put('/users/:id/reset-password', adminResetUserPassword);

router.get('/deposits', getAllDeposits);
router.put('/deposits/:id/approve', approveDeposit);
router.put('/deposits/:id/reject', rejectDeposit);

router.get('/withdrawals', getAllWithdrawals);
router.put('/withdrawals/:id/release', releaseWithdrawal);
router.put('/withdrawals/:id/reject', rejectWithdrawal);

router.put('/engine/rate', updateEngineRate);
router.get('/notifications', getAdminNotifications);
router.get('/settings', getSettings);
router.put('/settings', updateSettings);
router.post('/distribute-daily-interest', triggerDailyInterest);

export default router;
