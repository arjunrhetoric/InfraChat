const express = require('express');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const auth = require('../middleware/auth');
const { requireRole, ROLES } = require('../middleware/rbac');
const { getIO } = require('../socket');
const { getUserSocketIds } = require('../socket/presence');

const router = express.Router();

// GET /api/users
router.get('/', auth, async (req, res) => {
  try {
    const users = await User.find({ isBanned: false }).select(
      'username email role avatar createdAt'
    );

    return res.json({ users });
  } catch (error) {
    console.error('Get Users Error:', error.message);
    return res.status(500).json({ message: 'Server error while fetching users.' });
  }
});

// PATCH /api/users/:id/role
router.patch('/:id/role', auth, requireRole(ROLES.SUPERADMIN), async (req, res) => {
  try {
    const { role } = req.body;

    if (![1, 2, 3].includes(role)) {
      return res.status(400).json({ message: 'Invalid role value.' });
    }

    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // prevent self-demotion for safety
    if (targetUser._id.toString() === req.user._id.toString() && role !== 3) {
      return res.status(400).json({
        message: 'You cannot change your own SuperAdmin role.',
      });
    }

    const oldRole = targetUser.role;
    targetUser.role = role;
    await targetUser.save();

    const roleNames = { 1: 'Member', 2: 'Moderator', 3: 'SuperAdmin' };
    const action = role > oldRole ? 'USER_PROMOTED' : 'USER_DEMOTED';

    await AuditLog.create({
      action,
      performedBy: req.user._id,
      targetUser: targetUser._id,
      details: `${req.user.username} changed ${targetUser.username} role from ${roleNames[oldRole]} to ${roleNames[role]}`,
    });

    // Emit user:role_changed to all of the target user's sockets
    const io = getIO();
    if (io) {
      const targetSocketIds = getUserSocketIds(targetUser._id.toString());
      targetSocketIds.forEach((socketId) => {
        io.to(socketId).emit('user:role_changed', {
          userId: targetUser._id,
          username: targetUser.username,
          oldRole,
          newRole: role,
        });
      });
    }

    return res.json({
      message: 'User role updated successfully.',
      user: {
        id: targetUser._id,
        username: targetUser.username,
        email: targetUser.email,
        role: targetUser.role,
      },
    });
  } catch (error) {
    console.error('Update Role Error:', error.message);
    return res.status(500).json({ message: 'Server error while updating role.' });
  }
});

module.exports = router;
