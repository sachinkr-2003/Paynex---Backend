import express from 'express';
import { getPlans, subscribePlan } from '../controllers/plan.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.get('/', getPlans);
router.post('/subscribe', protect, subscribePlan);

export default router;
