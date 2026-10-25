import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  sender: {
    type: String,
    enum: ['user', 'ai', 'admin'],
    required: true,
  },
  senderName: {
    type: String,
    default: 'Trader',
  },
  text: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const chatSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    userUid: {
      type: String,
      index: true,
    },
    userName: {
      type: String,
      default: 'Trader',
    },
    userEmail: {
      type: String,
      index: true,
    },
    userPhone: {
      type: String,
    },
    subject: {
      type: String,
      default: 'General Support Inquiry',
    },
    status: {
      type: String,
      enum: ['Active', 'Resolved', 'Closed'],
      default: 'Active',
    },
    priority: {
      type: String,
      enum: ['Normal', 'High', 'Urgent'],
      default: 'Normal',
    },
    aiEnabled: {
      type: Boolean,
      default: true,
    },
    messages: [messageSchema],
    lastMessage: {
      type: String,
      default: 'Chat conversation initiated.',
    },
    lastSender: {
      type: String,
      default: 'system',
    },
    unreadAdmin: {
      type: Number,
      default: 0,
    },
    unreadUser: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

export const Chat = mongoose.model('Chat', chatSchema);
export default Chat;
