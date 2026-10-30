import jwt from 'jsonwebtoken';

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        return res.status(500).json({ success: false, message: 'Server configuration error.' });
      }
      const decoded = jwt.verify(token, secret);
      const User = (await import('../models/user.model.js')).default;
      const userDoc = await User.findById(decoded.id).select('-password');
      if (!userDoc) {
        return res.status(401).json({ success: false, message: 'User account not found or removed.' });
      }
      if (userDoc.isBanned) {
        return res.status(403).json({ success: false, message: 'Your account has been suspended by administration.' });
      }
      req.user = userDoc;
      return next();
    } catch (error) {
      console.warn('JWT verification failed:', error.message);
      return res.status(401).json({ success: false, message: 'Not authorized, invalid token.' });
    }
  }

  return res.status(401).json({ success: false, message: 'Not authorized, please log in.' });
};

const adminOnly = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'superadmin')) {
    next();
  } else {
    res.status(403).json({ success: false, message: 'Access denied: Admins only' });
  }
};

const optionalProtect = async (req, res, next) => {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      const token = req.headers.authorization.split(' ')[1];
      const secret = process.env.JWT_SECRET;
      if (secret) {
        const decoded = jwt.verify(token, secret);
        const User = (await import('../models/user.model.js')).default;
        const userDoc = await User.findById(decoded.id).select('-password');
        if (userDoc) {
          req.user = userDoc;
        } else {
          req.user = decoded;
        }
      }
    } catch (_) {}
  }
  return next();
};

export { protect, adminOnly, optionalProtect };
