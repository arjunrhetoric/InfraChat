const express = require('express');
const DirectMessage = require('../models/DirectMessage');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

const isSameId = (a, b) => a.toString() === b.toString();

// GET /api/direct-messages/:userId
router.get('/:userId', auth, async (req, res) => {
  try {
    let { page = 1, limit = 50 } = req.query;

    page = parseInt(page, 10);
    limit = parseInt(limit, 10);

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 50;
    if (limit > 100) limit = 100;

    const otherUser = await User.findById(req.params.userId).select('username role avatar isBanned');
    if (!otherUser) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const query = {
      $or: [
        { sender: req.user._id, recipient: req.params.userId },
        { sender: req.params.userId, recipient: req.user._id },
      ],
    };

    const messages = await DirectMessage.find(query)
      .populate('sender', 'username role avatar')
      .populate('recipient', 'username role avatar')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await DirectMessage.countDocuments(query);

    return res.json({
      user: otherUser,
      messages: messages.reverse(),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error('Get Direct Messages Error:', error.message);
    return res.status(500).json({ message: 'Server error while fetching direct messages.' });
  }
});

// POST /api/direct-messages/:userId
router.post('/:userId', auth, async (req, res) => {
  try {
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Message content is required.' });
    }

    const recipient = await User.findById(req.params.userId);
    if (!recipient) {
      return res.status(404).json({ message: 'Recipient not found.' });
    }

    if (recipient.isBanned) {
      return res.status(403).json({ message: 'Cannot send message to this user.' });
    }

    if (isSameId(req.user._id, recipient._id)) {
      return res.status(400).json({ message: 'You cannot message yourself.' });
    }

    const message = await DirectMessage.create({
      content: content.trim(),
      sender: req.user._id,
      recipient: recipient._id,
    });

    await message.populate('sender', 'username role avatar');
    await message.populate('recipient', 'username role avatar');

    return res.status(201).json({
      message: 'Direct message sent successfully.',
      directMessage: message,
    });
  } catch (error) {
    console.error('Send Direct Message Error:', error.message);
    return res.status(500).json({ message: 'Server error while sending direct message.' });
  }
});

module.exports = router;
