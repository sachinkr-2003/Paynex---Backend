import express from 'express';
import { getWalletHistory, submitDeposit, submitWithdrawal, getUserNotifications } from '../controllers/wallet.controller.js';
import { protect, optionalProtect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.get('/history', protect, getWalletHistory);
router.get('/notifications', optionalProtect, getUserNotifications);
router.post('/deposit', protect, submitDeposit);
router.post('/withdraw', protect, submitWithdrawal);

export default router;
