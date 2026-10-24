import express from 'express';
import { getWalletHistory, submitDeposit, submitWithdrawal } from '../controllers/wallet.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.get('/history', protect, getWalletHistory);
router.post('/deposit', protect, submitDeposit);
router.post('/withdraw', protect, submitWithdrawal);

export default router;
