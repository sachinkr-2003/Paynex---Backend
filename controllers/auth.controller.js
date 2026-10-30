import User from '../models/user.model.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { sendPasswordResetOtpEmail } from '../services/emailService.js';

// Helper to generate JWT
const generateToken = (user) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured.');
  return jwt.sign(
    { id: user._id, uid: user.uid, email: user.email, role: user.role },
    secret,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// @desc    Register a new user
// @route   POST /api/auth/register
export const register = async (req, res) => {
  try {
    const { name, email, phone, password, referralCode } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide name, email, and password.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User already exists with this email address.' });
    }

    // Check optional referral code
    let referredBy = null;
    let referrerUid = null;
    if (referralCode && typeof referralCode === 'string' && referralCode.trim()) {
      const cleanRef = referralCode.trim();
      const referrer = await User.findOne({
        $or: [
          { uid: cleanRef.toUpperCase() },
          { email: cleanRef.toLowerCase() },
          { phone: cleanRef },
        ],
      });
      if (referrer) {
        referredBy = referrer._id;
        referrerUid = referrer.uid;
        referrer.referralCount = (referrer.referralCount || 0) + 1;
        await referrer.save();
      }
    }

    const user = await User.create({
      name: name.trim(),
      email: cleanEmail,
      phone: phone ? phone.trim() : '+91 98765 43210',
      password,
      balance: 0, // Clean, fresh account balance
      referredBy,
      referrerUid,
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
        referralCount: user.referralCount || 0,
        referralEarnings: user.referralEarnings || 0,
        referrerUid: user.referrerUid || null,
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
      return res.status(400).json({ success: false, message: 'Please provide email or mobile and password.' });
    }

    const clean = email.trim();
    const user = await User.findOne({
      $or: [
        { email: clean.toLowerCase() },
        { phone: clean },
        { uid: clean.toUpperCase() },
      ],
    });

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

    // If this is an admin panel login request, verify admin role
    const isAdminLogin = req.headers['x-admin-login'] === 'true';
    if (isAdminLogin && user.role !== 'admin' && user.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: 'Access denied. Administrator credentials required.' });
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
        hasWithdrawalPassword: Boolean(user.withdrawalPassword),
        referralCount: user.referralCount || 0,
        referralEarnings: user.referralEarnings || 0,
        referrerUid: user.referrerUid || null,
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

    const userObj = user.toObject();
    const hasWithdrawalPassword = Boolean(user.withdrawalPassword);
    delete userObj.withdrawalPassword;

    return res.status(200).json({
      success: true,
      user: {
        ...userObj,
        hasWithdrawalPassword,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update profile, login password, or withdrawal password
// @route   PUT /api/auth/profile
export const updateProfile = async (req, res) => {
  try {
    const { phone, bankDetails, name, password, currentPassword, withdrawalPassword, currentWithdrawalPassword } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (name) user.name = name.trim();
    if (phone) user.phone = phone.trim();

    // Change Login Password - currentPassword is mandatory
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ success: false, message: 'New login password must be at least 6 characters long.' });
      }
      if (!currentPassword) {
        return res.status(400).json({ success: false, message: 'Current password is required to change your password.' });
      }
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: 'Current login password is incorrect.' });
      }
      user.password = password;
    }

    // Create / Change Withdrawal Password (Fund PIN / Password)
    if (withdrawalPassword) {
      const cleanWithdrawPass = withdrawalPassword.toString().trim();
      if (cleanWithdrawPass.length < 4) {
        return res.status(400).json({ success: false, message: 'Withdrawal password must be at least 4 digits/characters long.' });
      }
      // If user already has a withdrawal password set, verification of current PIN/password is mandatory
      if (user.withdrawalPassword) {
        if (!currentWithdrawalPassword && !currentPassword) {
          return res.status(400).json({
            success: false,
            message: 'Current login password or withdrawal PIN is required to change your withdrawal password.',
          });
        }
        let isPinMatch = false;
        if (currentWithdrawalPassword) {
          isPinMatch = await user.compareWithdrawalPassword(currentWithdrawalPassword.toString().trim());
        }
        if (!isPinMatch && currentPassword) {
          isPinMatch = await user.comparePassword(currentPassword);
        }
        if (!isPinMatch) {
          return res.status(400).json({ success: false, message: 'Incorrect current withdrawal password or login password.' });
        }
      }
      const salt = await bcrypt.genSalt(10);
      user.withdrawalPassword = await bcrypt.hash(cleanWithdrawPass, salt);
    }

    if (bankDetails) {
      user.bankDetails = { ...user.bankDetails, ...bankDetails };
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Profile & security settings updated successfully.',
      user: {
        id: user._id,
        uid: user.uid,
        name: user.name,
        email: user.email,
        phone: user.phone,
        balance: user.balance,
        bankDetails: user.bankDetails,
        hasWithdrawalPassword: Boolean(user.withdrawalPassword),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Initiate Forgot Password - Generate & Send 6-Digit Email OTP
// @route   POST /api/auth/forgot-password
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, message: 'Please enter your registered email address.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(404).json({ success: false, message: 'No registered PAYNEX account found with this email address.' });
    }

    // Generate 6-digit random numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetPasswordOtp = otp;
    user.resetPasswordOtpExpires = new Date(Date.now() + 15 * 60 * 1000); // Valid for 15 minutes
    await user.save();

    await sendPasswordResetOtpEmail(user.email, user.name, otp);

    return res.status(200).json({
      success: true,
      message: `A 6-digit OTP code has been sent to ${cleanEmail}. Please check your inbox or spam folder.`,
      email: cleanEmail,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Verify 6-digit Reset OTP
// @route   POST /api/auth/verify-reset-otp
export const verifyResetOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Please provide email and 6-digit OTP code.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanOtp = otp.toString().trim();

    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (!user.resetPasswordOtp || user.resetPasswordOtp !== cleanOtp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP code. Please enter the correct 6-digit code.' });
    }

    if (!user.resetPasswordOtpExpires || new Date() > user.resetPasswordOtpExpires) {
      return res.status(400).json({ success: false, message: 'OTP code has expired. Please request a new OTP.' });
    }

    return res.status(200).json({
      success: true,
      message: 'OTP verified successfully. You may now enter your new password.',
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Reset Password using verified OTP
// @route   POST /api/auth/reset-password
export const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ success: false, message: 'Please provide email, OTP, and your new password.' });
    }

    if (newPassword.trim().length < 4) {
      return res.status(400).json({ success: false, message: 'New password must be at least 4 characters long.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanOtp = otp.toString().trim();

    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (!user.resetPasswordOtp || user.resetPasswordOtp !== cleanOtp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP code. Please check and try again.' });
    }

    if (!user.resetPasswordOtpExpires || new Date() > user.resetPasswordOtpExpires) {
      return res.status(400).json({ success: false, message: 'OTP code has expired. Please request a new OTP.' });
    }

    // Set new password (auto-hashed by pre-save hook) and clear OTP
    user.password = newPassword.trim();
    user.resetPasswordOtp = null;
    user.resetPasswordOtpExpires = null;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Your password has been reset successfully! You can now sign in with your new password.',
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

