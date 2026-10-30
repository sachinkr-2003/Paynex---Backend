import express from 'express';
import {
  getMyChat,
  sendMessage,
  getAllChatsAdmin,
  getChatByIdAdmin,
  sendAdminReply,
  updateChatStatus,
} from '../controllers/chat.controller.js';

import { protect, adminOnly, optionalProtect } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Trader / User routes
router.get('/my-chat', optionalProtect, getMyChat);
router.get('/my', optionalProtect, getMyChat);
router.post('/send', optionalProtect, sendMessage);

// Admin management routes
router.get('/admin/all', protect, adminOnly, getAllChatsAdmin);
router.get('/admin/:id', protect, adminOnly, getChatByIdAdmin);
router.post('/admin/:id/reply', protect, adminOnly, sendAdminReply);
router.put('/admin/:id/status', protect, adminOnly, updateChatStatus);

export default router;
