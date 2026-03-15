const express = require('express');
const Message = require('../models/Message');
const Room = require('../models/Room');
const AuditLog = require('../models/AuditLog');
const auth = require('../middleware/auth');
const { ROLES } = require('../middleware/rbac');

const router = express.Router();

const isSameId = (a, b) => a.toString() === b.toString();

// GET /api/rooms/:id/messages
router.get('/:id/messages', auth, async (req, res) => {
  try {
    let { page = 1, limit = 50 } = req.query;

    page = parseInt(page, 10);
    limit = parseInt(limit, 10);

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 50;
    if (limit > 100) limit = 100;

    const room = await Room.findById(req.params.id).populate('createdBy', 'username role');

    if (!room) {
      return res.status(404).json({ message: 'Room not found.' });
    }

    const isMember = room.members.some((memberId) => isSameId(memberId, req.user._id));
    const isSuperAdmin = req.user.role >= ROLES.SUPERADMIN;

    if (room.isBanned(req.user._id) && !isSuperAdmin) {
      return res.status(403).json({ message: 'You are banned from this room.' });
    }

    if (!isMember && !isSuperAdmin) {
      return res.status(403).json({ message: 'You are not a member of this room.' });
    }

    const query = { room: req.params.id };

    const messages = await Message.find(query)
      .populate('sender', 'username role avatar')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Message.countDocuments(query);

    return res.json({
      room: {
        id: room._id,
        name: room.name,
        isPrivate: room.isPrivate,
        createdBy: room.createdBy,
      },
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
    console.error('Get Messages Error:', error.message);
    return res.status(500).json({ message: 'Server error while fetching messages.' });
  }
});

// PATCH /api/rooms/messages/:messageId
router.patch('/messages/:messageId', auth, async (req, res) => {
  try {
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Updated content is required.' });
    }

    const message = await Message.findById(req.params.messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found.' });
    }

    if (!isSameId(message.sender, req.user._id)) {
      return res.status(403).json({ message: 'You can edit only your own messages.' });
    }

    if (message.deletedForEveryone) {
      return res.status(400).json({ message: 'Deleted messages cannot be edited.' });
    }

    message.markAsEdited(content);
    await message.save();
    await message.populate('sender', 'username role avatar');

    return res.json({
      message: 'Message updated successfully.',
      updatedMessage: message,
    });
  } catch (error) {
    console.error('Edit Message Error:', error.message);
    return res.status(500).json({ message: 'Server error while editing message.' });
  }
});

// DELETE /api/rooms/messages/:messageId
router.delete('/messages/:messageId', auth, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId).populate('room');
    if (!message) {
      return res.status(404).json({ message: 'Message not found.' });
    }

    const room = await Room.findById(message.room._id);
    if (!room) {
      return res.status(404).json({ message: 'Room not found.' });
    }

    const canDeleteOwn = isSameId(message.sender, req.user._id);
    const canModerate =
      room.isRoomModerator(req.user._id) || req.user.role >= ROLES.SUPERADMIN;

    if (!canDeleteOwn && !canModerate) {
      return res.status(403).json({
        message: 'You do not have permission to delete this message.',
      });
    }

    message.softDelete();
    await message.save();

    await AuditLog.create({
      action: 'MESSAGE_DELETED',
      performedBy: req.user._id,
      room: room._id,
      targetUser: message.sender,
      details: `${req.user.username} deleted a message in room ${room.name}`,
      metadata: {
        messageId: message._id.toString(),
      },
    });

    await message.populate('sender', 'username role avatar');

    return res.json({
      message: 'Message deleted successfully.',
      deletedMessage: message,
    });
  } catch (error) {
    console.error('Delete Message Error:', error.message);
    return res.status(500).json({ message: 'Server error while deleting message.' });
  }
});

module.exports = router;
