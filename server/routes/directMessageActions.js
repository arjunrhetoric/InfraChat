const express = require('express');
const DirectMessage = require('../models/DirectMessage');
const auth = require('../middleware/auth');

const router = express.Router();

const isSameId = (a, b) => a.toString() === b.toString();

// PATCH /api/direct-message-actions/:messageId
router.patch('/:messageId', auth, async (req, res) => {
  try {
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Updated content is required.' });
    }

    const message = await DirectMessage.findById(req.params.messageId);
    if (!message) {
      return res.status(404).json({ message: 'Direct message not found.' });
    }

    if (!isSameId(message.sender, req.user._id)) {
      return res.status(403).json({ message: 'You can edit only your own direct messages.' });
    }

    if (message.deletedForEveryone) {
      return res.status(400).json({ message: 'Deleted messages cannot be edited.' });
    }

    message.markAsEdited(content);
    await message.save();
    await message.populate('sender', 'username role avatar');
    await message.populate('recipient', 'username role avatar');

    return res.json({
      message: 'Direct message updated successfully.',
      updatedMessage: message,
    });
  } catch (error) {
    console.error('Edit Direct Message Error:', error.message);
    return res.status(500).json({ message: 'Server error while editing direct message.' });
  }
});

// DELETE /api/direct-message-actions/:messageId
router.delete('/:messageId', auth, async (req, res) => {
  try {
    const message = await DirectMessage.findById(req.params.messageId);
    if (!message) {
      return res.status(404).json({ message: 'Direct message not found.' });
    }

    if (!isSameId(message.sender, req.user._id)) {
      return res.status(403).json({ message: 'You can delete only your own direct messages.' });
    }

    message.softDelete();
    await message.save();
    await message.populate('sender', 'username role avatar');
    await message.populate('recipient', 'username role avatar');

    return res.json({
      message: 'Direct message deleted successfully.',
      deletedMessage: message,
    });
  } catch (error) {
    console.error('Delete Direct Message Error:', error.message);
    return res.status(500).json({ message: 'Server error while deleting direct message.' });
  }
});

module.exports = router;
