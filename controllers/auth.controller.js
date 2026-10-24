import User from '../models/user.model.js';
import jwt from 'jsonwebtoken';

// Helper to generate JWT
const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, uid: user.uid, email: user.email, role: user.role },
    process.env.JWT_SECRET || 'paynex_crypto_jwt_secret_2026',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// @desc    Register a new user
// @route   POST /api/auth/register
export const register = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide name, email, and password.' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User already exists with this email address.' });
    }

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      phone: phone || '+91 98765 43210',
      password,
      balance: 25000, // Trial starter balance
    });

    const token = generateToken(user);

    return res.status(201).json({
      success: true,
      message: 'Registration successful! Welcome to PAYNEX CRYPTO.',
      token,
      user: {
        id: user._id,
        uid: user.uid,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        balance: user.balance,
        kycStatus: user.kycStatus,
        vipLevel: user.vipLevel,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Server error during registration.' });
  }
};

// @desc    Login user / admin
// @route   POST /api/auth/login
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials. User not found.' });
    }

    if (user.isBanned) {
      return res.status(403).json({ success: false, message: 'Your account has been suspended by administration.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials. Incorrect password.' });
    }

    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: user._id,
        uid: user.uid,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        balance: user.balance,
        totalStaked: user.totalStaked,
        totalWon: user.totalWon,
        kycStatus: user.kycStatus,
        vipLevel: user.vipLevel,
        bankDetails: user.bankDetails,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Server error during login.' });
  }
};

// @desc    Get current authenticated user profile & balance
// @route   GET /api/auth/me
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update profile or bank details
// @route   PUT /api/auth/profile
export const updateProfile = async (req, res) => {
  try {
    const { phone, bankDetails, name, password } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (name) user.name = name;
    if (phone) user.phone = phone;
    if (password && password.length >= 6) {
      user.password = password;
    }
    if (bankDetails) {
      user.bankDetails = { ...user.bankDetails, ...bankDetails };
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      user: {
        id: user._id,
        uid: user.uid,
        name: user.name,
        email: user.email,
        phone: user.phone,
        balance: user.balance,
        bankDetails: user.bankDetails,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
