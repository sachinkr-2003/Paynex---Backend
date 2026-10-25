import express from 'express';
import {
  getMyChat,
  sendMessage,
  getAllChatsAdmin,
  getChatByIdAdmin,
  sendAdminReply,
  updateChatStatus,
} from '../controllers/chat.controller.js';

const router = express.Router();

// Trader / User routes
router.get('/my-chat', getMyChat);
router.get('/my', getMyChat);
router.post('/send', sendMessage);

// Admin management routes
router.get('/admin/all', getAllChatsAdmin);
router.get('/admin/:id', getChatByIdAdmin);
router.post('/admin/:id/reply', sendAdminReply);
router.put('/admin/:id/status', updateChatStatus);

export default router;
