import express from 'express';
import {
  getReturnRate,
  placeStake,
  settleStake,
  getUserRounds,
  getLivePool,
} from '../controllers/staking.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.get('/rate', getReturnRate);
router.get('/live-pool', getLivePool);
router.post('/place', protect, placeStake);
router.post('/settle/:id', protect, settleStake);
router.get('/my-rounds', protect, getUserRounds);

export default router;
