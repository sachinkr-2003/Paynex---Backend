import Chat from '../models/chat.model.js';
import User from '../models/user.model.js';
import { generateAiReply } from '../services/aiChatService.js';

// @desc    Get or Create active chat for trader
// @route   GET /api/chat/my-chat
export const getMyChat = async (req, res) => {
  try {
    const user = req.user;

    let query = {};
    if (user?._id) {
      // Authenticated user: strictly access their own chat
      query = { $or: [{ user: user._id }, { userUid: user.uid }] };
    } else {
      // Unauthenticated visitor: isolated guest thread by IP
      const guestKey = 'GUEST-' + Buffer.from(req.ip || 'visitor').toString('hex').slice(0, 10);
      query = { userUid: guestKey, user: null };
    }

    let chat = await Chat.findOne(query);

    if (!chat) {
      const initialGreeting = `Hello ${user?.name || 'Trader'}! Welcome to PAYNEX 24/7 AI Desk 🤖. How can I assist you with your account, deposits, withdrawals, or contracts today?`;
      chat = await Chat.create({
        user: user?._id || null,
        userUid: user?.uid || ('GUEST-' + Buffer.from(req.ip || 'visitor').toString('hex').slice(0, 10)),
        userName: user?.name || 'Trader',
        userEmail: user?.email || 'guest@paynex.io',
        userPhone: user?.phone || '+91 98765 43210',
        subject: 'Trader Support Desk',
        status: 'Active',
        aiEnabled: true,
        messages: [
          {
            sender: 'ai',
            senderName: 'PAYNEX AI Agent',
            text: initialGreeting,
            createdAt: new Date(),
          },
        ],
        lastMessage: initialGreeting,
        lastSender: 'ai',
        lastMessageAt: new Date(),
      });
    }

    return res.status(200).json({
      success: true,
      chat,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    User sends message -> AI automatically answers in real-time
// @route   POST /api/chat/send
export const sendMessage = async (req, res) => {
  try {
    const { chatId } = req.body;
    const cleanText = (req.body.text || req.body.message || '').trim();

    if (!cleanText) {
      return res.status(400).json({ success: false, message: 'Message text cannot be empty.' });
    }

    let chat;
    if (chatId) {
      chat = await Chat.findById(chatId);
      // If chat belongs to a registered user, caller must be owner or admin
      if (chat && chat.user && req.user?._id) {
        const isOwner = chat.user.toString() === req.user._id.toString();
        const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
        if (!isOwner && !isAdmin) {
          return res.status(403).json({ success: false, message: 'Unauthorized chat access.' });
        }
      }
    }

    if (!chat && req.user?._id) {
      chat = await Chat.findOne({ $or: [{ user: req.user._id }, { userUid: req.user.uid }] });
    }

    const userName = req.user?.name || chat?.userName || 'Trader';
    const userEmail = req.user?.email || chat?.userEmail || 'guest@paynex.io';
    const userUid = req.user?.uid || chat?.userUid || ('GUEST-' + Buffer.from(req.ip || 'visitor').toString('hex').slice(0, 10));

    if (!chat) {
      chat = new Chat({
        user: req.user?._id || null,
        userUid,
        userName,
        userEmail,
        subject: cleanText.slice(0, 40) + '...',
        status: 'Active',
        aiEnabled: true,
        messages: [],
      });
    }

    // 1. Append User Message
    const userMsg = {
      sender: 'user',
      senderName: userName,
      text: cleanText,
      createdAt: new Date(),
    };
    chat.messages.push(userMsg);
    chat.lastMessage = cleanText;
    chat.lastSender = 'user';
    chat.lastMessageAt = new Date();
    chat.unreadAdmin += 1;
    chat.status = 'Active';

    // 2. Automated Real-Time AI Reply
    let aiMsg = null;
    if (chat.aiEnabled !== false) {
      const aiReplyText = await generateAiReply(cleanText, chat.messages, {
        name: userName,
        email: userEmail,
        uid: userUid,
      });

      aiMsg = {
        sender: 'ai',
        senderName: 'PAYNEX AI Agent 🤖',
        text: aiReplyText,
        createdAt: new Date(Date.now() + 500),
      };
      chat.messages.push(aiMsg);
      chat.lastMessage = aiReplyText;
      chat.lastSender = 'ai';
      chat.lastMessageAt = new Date();
    }

    await chat.save();

    return res.status(200).json({
      success: true,
      chat,
      userMessage: userMsg,
      aiMessage: aiMsg,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Admin: List all support conversations
// @route   GET /api/chat/admin/all
export const getAllChatsAdmin = async (req, res) => {
  try {
    const { status, search } = req.query;
    const query = {};

    if (status && status !== 'All') {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { userName: { $regex: search, $options: 'i' } },
        { userEmail: { $regex: search, $options: 'i' } },
        { userUid: { $regex: search, $options: 'i' } },
        { lastMessage: { $regex: search, $options: 'i' } },
      ];
    }

    const chats = await Chat.find(query).sort({ lastMessageAt: -1 }).limit(100);

    return res.status(200).json({
      success: true,
      count: chats.length,
      chats,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Admin: Get single conversation detail and mark read
// @route   GET /api/chat/admin/:id
export const getChatByIdAdmin = async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.id);
    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat thread not found.' });
    }

    chat.unreadAdmin = 0;
    await chat.save();

    return res.status(200).json({
      success: true,
      chat,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Admin: Send manual response to user
// @route   POST /api/chat/admin/:id/reply
export const sendAdminReply = async (req, res) => {
  try {
    const { text, officerName } = req.body;
    const cleanText = (text || '').trim();

    if (!cleanText) {
      return res.status(400).json({ success: false, message: 'Reply text cannot be empty.' });
    }

    const chat = await Chat.findById(req.params.id);
    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat conversation not found.' });
    }

    const adminMsg = {
      sender: 'admin',
      senderName: officerName || 'PAYNEX Support Officer',
      text: cleanText,
      createdAt: new Date(),
    };

    chat.messages.push(adminMsg);
    chat.lastMessage = cleanText;
    chat.lastSender = 'admin';
    chat.lastMessageAt = new Date();
    chat.unreadUser += 1;
    await chat.save();

    return res.status(200).json({
      success: true,
      chat,
      message: adminMsg,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Admin: Update chat status or toggle AI
// @route   PUT /api/chat/admin/:id/status
export const updateChatStatus = async (req, res) => {
  try {
    const { status, aiEnabled } = req.body;
    const chat = await Chat.findById(req.params.id);

    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat conversation not found.' });
    }

    if (status) chat.status = status;
    if (aiEnabled !== undefined) chat.aiEnabled = aiEnabled;

    await chat.save();

    return res.status(200).json({
      success: true,
      message: 'Chat state updated.',
      chat,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
