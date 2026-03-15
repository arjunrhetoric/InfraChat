const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN}
  );
};

const formatUserResponse = (user) => {
  return {
    id: user._id,
    username: user.username,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    isBanned: user.isBanned,
    isMuted: user.isMuted,
    mutedUntil: user.mutedUntil,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    let { username, email, password } = req.body;

    // Basic validation
    if (!username || !email || !password) {
      return res.status(400).json({
        message: 'Username, email, and password are required.',
      });
    }

    username = username.trim();
    email = email.trim().toLowerCase();
    password = password.trim();

    if (username.length < 3) {
      return res.status(400).json({
        message: 'Username must be at least 3 characters.',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: 'Password must be at least 6 characters.',
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }],
    });

    if (existingUser) {
      return res.status(400).json({
        message:
          existingUser.email === email
            ? 'Email already registered.'
            : 'Username already taken.',
      });
    }

    // First user becomes SuperAdmin, others default to Member
    const userCount = await User.countDocuments();
    const role = userCount === 0 ? 3 : 1;

    // Create user
    const user = await User.create({
      username,
      email,
      password,
      role,
    });

    // Generate token
    const token = generateToken(user);

    return res.status(201).json({
      message: 'Registration successful.',
      token,
      user: formatUserResponse(user),
    });
  } catch (error) {
    console.error('Register Error:', error.message);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({
        message: messages.join(', '),
      });
    }

    return res.status(500).json({
      message: 'Server error during registration.',
    });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    let { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: 'Email and password are required.',
      });
    }

    email = email.trim().toLowerCase();
    password = password.trim();

    // Find user with password
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({
        message: 'Invalid credentials.',
      });
    }

    if (user.isBanned) {
      return res.status(403).json({
        message: 'Your account has been banned.',
      });
    }

    // Auto-check mute expiry
    user.checkMuteStatus?.();

    // Check password
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({
        message: 'Invalid credentials.',
      });
    }

    // Generate token
    const token = generateToken(user);

    return res.json({
      message: 'Login successful.',
      token,
      user: formatUserResponse(user),
    });
  } catch (error) {
    console.error('Login Error:', error.message);
    return res.status(500).json({
      message: 'Server error during login.',
    });
  }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  try {
    return res.json({
      user: formatUserResponse(req.user),
    });
  } catch (error) {
    console.error('Get Me Error:', error.message);
    return res.status(500).json({
      message: 'Server error while fetching user profile.',
    });
  }
});

module.exports = router;
