const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    // Check authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        message: 'Access denied. No token provided.',
      });
    }

    // Extract token
    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find user
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        message: 'User not found.',
      });
    }

    // Check if user is banned
    if (user.isBanned) {
      return res.status(403).json({
        message: 'Your account has been banned.',
      });
    }

    // Check if mute expired
    user.checkMuteStatus?.();

    // Attach user to request
    req.user = user;

    next();
  } catch (error) {
    console.error('Auth Middleware Error:', error.message);

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        message: 'Invalid token.',
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        message: 'Token expired.',
      });
    }

    return res.status(500).json({
      message: 'Authentication failed.',
    });
  }
};

module.exports = auth;
