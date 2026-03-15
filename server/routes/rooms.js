const express = require('express');
const Room = require('../models/Room');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { requireRole, ROLES } = require('../middleware/rbac');
const { getIO } = require('../socket');
const { getUserSocketIds, removeUserFromRoom, getRoomOnlineUsers } = require('../socket/presence');

const router = express.Router();

const isSameId = (a, b) => a.toString() === b.toString();

// GET /api/rooms - List all rooms (public + joined private rooms)
router.get('/', auth, async (req, res) => {
  try {
    const rooms = await Room.find({
      $or: [{ isPrivate: false }, { members: req.user._id }],
    })
      .populate('createdBy', 'username role')
      .populate('members', 'username role avatar')
      .sort({ createdAt: -1 });

    return res.json({ rooms });
  } catch (error) {
    console.error('Get Rooms Error:', error.message);
    return res.status(500).json({ message: 'Server error while fetching rooms.' });
  }
});

// POST /api/rooms - Create room (Moderator+)
router.post('/', auth, requireRole(ROLES.MODERATOR), async (req, res) => {
  try {
    let { name, description, isPrivate, roomType } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Room name is required.' });
    }

    name = name.trim();
    description = description ? description.trim() : '';

    // Determine roomType: explicit roomType takes priority over isPrivate flag
    if (roomType && ['public', 'private', 'broadcast'].includes(roomType)) {
      isPrivate = roomType === 'private';
    } else {
      isPrivate = Boolean(isPrivate);
      roomType = isPrivate ? 'private' : 'public';
    }

    // Only SuperAdmin can create broadcast rooms
    if (roomType === 'broadcast' && req.user.role < ROLES.SUPERADMIN) {
      return res.status(403).json({ message: 'Only SuperAdmins can create broadcast rooms.' });
    }

    const existing = await Room.findOne({ name });
    if (existing) {
      return res.status(400).json({ message: 'Room name already exists.' });
    }

    const room = await Room.create({
      name,
      description,
      isPrivate,
      roomType,
      createdBy: req.user._id,
      members: [req.user._id],
      moderators: [req.user._id],
    });

    await AuditLog.create({
      action: 'ROOM_CREATED',
      performedBy: req.user._id,
      room: room._id,
      details: `${req.user.username} created room ${room.name}`,
      metadata: { isPrivate: room.isPrivate },
    });

    await room.populate('createdBy', 'username role');
    await room.populate('members', 'username role avatar');

    const io = getIO();
    if (io) {
      io.emit('room:listUpdated');
    }

    return res.status(201).json({
      message: 'Room created successfully.',
      room,
    });
  } catch (error) {
    console.error('Create Room Error:', error.message);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ message: messages.join(', ') });
    }

    return res.status(500).json({ message: 'Server error while creating room.' });
  }
});

// POST /api/rooms/:id/join
router.post('/:id/join', auth, async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);

    if (!room) {
      return res.status(404).json({ message: 'Room not found.' });
    }

    if (room.isBanned(req.user._id)) {
      return res.status(403).json({ message: 'You are banned from this room.' });
    }

    if (room.isMember(req.user._id)) {
      return res.status(400).json({ message: 'Already a member of this room.' });
    }

    if (room.isPrivate) {
      return res.status(403).json({
        message: 'This is a private room. You need to be added by a moderator.',
      });
    }

    room.addMember(req.user._id);
    await room.save();

    await room.populate('members', 'username role avatar');

    const io = getIO();
    if (io) {
      io.emit('room:listUpdated');
    }

    return res.json({
      message: 'Joined room successfully.',
      room,
    });
  } catch (error) {
    console.error('Join Room Error:', error.message);
    return res.status(500).json({ message: 'Server error while joining room.' });
  }
});

// POST /api/rooms/:id/leave
router.post('/:id/leave', auth, async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);

    if (!room) {
      return res.status(404).json({ message: 'Room not found.' });
    }

    if (!room.isMember(req.user._id)) {
      return res.status(400).json({ message: 'You are not a member of this room.' });
    }

    const isCreator = isSameId(room.createdBy, req.user._id);
    const isOnlyModerator =
      room.moderators.length === 1 &&
      room.moderators.some((id) => isSameId(id, req.user._id));

    if (isCreator && isOnlyModerator) {
      return res.status(400).json({
        message: 'You cannot leave this room as the only moderator/creator.',
      });
    }

    room.removeMember(req.user._id);
    room.moderators = room.moderators.filter(
      (id) => !isSameId(id, req.user._id)
    );

    await room.save();

    const io = getIO();
    if (io) {
      io.emit('room:listUpdated');
    }

    return res.json({ message: 'Left the room successfully.' });
  } catch (error) {
    console.error('Leave Room Error:', error.message);
    return res.status(500).json({ message: 'Server error while leaving room.' });
  }
});

// GET /api/rooms/:id/members
router.get('/:id/members', auth, async (req, res) => {
  try {
    const room = await Room.findById(req.params.id).populate(
      'members',
      'username role avatar email'
    );

    if (!room) {
      return res.status(404).json({ message: 'Room not found.' });
    }

    if (room.isPrivate && !room.isMember(req.user._id)) {
      return res.status(403).json({
        message: 'You do not have access to view members of this private room.',
      });
    }

    return res.json({ members: room.members });
  } catch (error) {
    console.error('Get Members Error:', error.message);
    return res.status(500).json({ message: 'Server error while fetching members.' });
  }
});

// PATCH /api/rooms/:id - Update room details
router.patch('/:id', auth, async (req, res) => {
  try {
    const { name, description, isPrivate } = req.body;

    const room = await Room.findById(req.params.id);
    if (!room) {
      return res.status(404).json({ message: 'Room not found.' });
    }

    const canManage =
      room.isRoomModerator(req.user._id) || req.user.role >= ROLES.SUPERADMIN;

    if (!canManage) {
      return res.status(403).json({
        message: 'Only room moderators or superadmins can update this room.',
      });
    }

    if (name && name.trim()) {
      const existing = await Room.findOne({
        name: name.trim(),
        _id: { $ne: room._id },
      });

      if (existing) {
        return res.status(400).json({ message: 'Another room with this name already exists.' });
      }

      room.name = name.trim();
    }

    if (description !== undefined) {
      room.description = description.trim();
    }

    if (typeof isPrivate === 'boolean') {
      room.isPrivate = isPrivate;
    }

    await room.save();

    const io = getIO();
    if (io) {
      io.emit('room:listUpdated');
    }

    return res.json({
      message: 'Room updated successfully.',
      room,
    });
  } catch (error) {
    console.error('Update Room Error:', error.message);
    return res.status(500).json({ message: 'Server error while updating room.' });
  }
});

// DELETE /api/rooms/:id - Delete room
router.delete('/:id', auth, requireRole(ROLES.SUPERADMIN), async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);

    if (!room) {
      return res.status(404).json({ message: 'Room not found.' });
    }

    await AuditLog.create({
      action: 'ROOM_DELETED',
      performedBy: req.user._id,
      room: room._id,
      details: `${req.user.username} deleted room ${room.name}`,
    });

    await Room.findByIdAndDelete(room._id);

    const io = getIO();
    if (io) {
      io.emit('room:listUpdated');
    }

    return res.json({ message: 'Room deleted successfully.' });
  } catch (error) {
    console.error('Delete Room Error:', error.message);
    return res.status(500).json({ message: 'Server error while deleting room.' });
  }
});

// POST /api/rooms/:id/members - Add member to room
router.post('/:id/members', auth, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required.' });
    }

    const room = await Room.findById(req.params.id);
    if (!room) {
      return res.status(404).json({ message: 'Room not found.' });
    }

    const canManage =
      room.isRoomModerator(req.user._id) || req.user.role >= ROLES.SUPERADMIN;

    if (!canManage) {
      return res.status(403).json({
        message: 'Only room moderators or superadmins can add members.',
      });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ message: 'Target user not found.' });
    }

    if (room.isBanned(targetUser._id)) {
      return res.status(403).json({ message: 'User is banned from this room.' });
    }

    if (room.isMember(targetUser._id)) {
      return res.status(400).json({ message: 'User is already a member of this room.' });
    }

    room.addMember(targetUser._id);
    await room.save();
    await room.populate('members', 'username role avatar email');

    await AuditLog.create({
      action: 'USER_PROMOTED',
      performedBy: req.user._id,
      targetUser: targetUser._id,
      room: room._id,
      details: `${req.user.username} added ${targetUser.username} to room ${room.name}`,
      metadata: { actionType: 'ROOM_MEMBER_ADDED' },
    });

    const io = getIO();
    if (io) {
      io.emit('room:listUpdated');
    }

    return res.json({
      message: 'Member added successfully.',
      members: room.members,
    });
  } catch (error) {
    console.error('Add Member Error:', error.message);
    return res.status(500).json({ message: 'Server error while adding member.' });
  }
});

// DELETE /api/rooms/:id/members/:userId - Remove member from room
router.delete('/:id/members/:userId', auth, async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) {
      return res.status(404).json({ message: 'Room not found.' });
    }

    const targetUser = await User.findById(req.params.userId);
    if (!targetUser) {
      return res.status(404).json({ message: 'Target user not found.' });
    }

    const canManage =
      room.isRoomModerator(req.user._id) || req.user.role >= ROLES.MODERATOR;

    if (!canManage) {
      return res.status(403).json({
        message: 'Only room moderators or superadmins can remove members.',
      });
    }

    if (!room.isMember(targetUser._id)) {
      return res.status(400).json({
        message: 'User is not a member of this room.',
      });
    }

    if (isSameId(targetUser._id, room.createdBy)) {
      return res.status(400).json({
        message: 'Room creator cannot be removed from the room.',
      });
    }

    const updatedRoom = await Room.findByIdAndUpdate(
      req.params.id,
      {
        $pull: {
          members: targetUser._id,
          moderators: targetUser._id,
        },
      },
      { new: true }
    ).populate('members', 'username role avatar email');

    await AuditLog.create({
      action: 'USER_KICKED',
      performedBy: req.user._id,
      targetUser: targetUser._id,
      room: room._id,
      details: `${req.user.username} removed ${targetUser.username} from room ${room.name}`,
      metadata: { actionType: 'ROOM_MEMBER_REMOVED' },
    });

    // Emit socket events to kick the removed user from the room in real-time
    const io = getIO();
    if (io) {
      const roomId = req.params.id;
      const targetSocketIds = getUserSocketIds(targetUser._id.toString());

      // Remove user's sockets from the Socket.io room and notify them
      for (const socketId of targetSocketIds) {
        const targetSocket = io.sockets.sockets.get(socketId);
        if (targetSocket) {
          targetSocket.leave(roomId);
          targetSocket.emit('room:kicked', {
            roomId,
            roomName: room.name,
            message: `You have been removed from ${room.name} by ${req.user.username}.`,
          });
        }
      }

      // Update presence tracking
      removeUserFromRoom(roomId, targetUser._id.toString());

      // Broadcast updated online users to remaining members
      io.to(roomId).emit('room:onlineUsers', {
        roomId,
        users: getRoomOnlineUsers(roomId),
      });

      // Notify room members that a user was removed
      io.to(roomId).emit('room:member_removed', {
        roomId,
        userId: targetUser._id,
        username: targetUser.username,
      });

      io.emit('room:listUpdated');
    }

    return res.json({
      message: 'Member removed successfully.',
      members: updatedRoom.members,
    });
  } catch (error) {
    console.error('Remove Member Error:', error.message);
    return res.status(500).json({
      message: 'Server error while removing member.',
    });
  }
});


// PATCH /api/rooms/:id/archive - Archive/unarchive room (SuperAdmin only)
router.patch('/:id/archive', auth, requireRole(ROLES.SUPERADMIN), async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) {
      return res.status(404).json({ message: 'Room not found.' });
    }

    room.isArchived = !room.isArchived;
    await room.save();

    await AuditLog.create({
      action: room.isArchived ? 'ROOM_ARCHIVED' : 'ROOM_UNARCHIVED',
      performedBy: req.user._id,
      room: room._id,
      details: `${req.user.username} ${room.isArchived ? 'archived' : 'unarchived'} room ${room.name}`,
    });

    const io = getIO();
    if (io) {
      io.emit('room:listUpdated');
    }

    return res.json({
      message: `Room ${room.isArchived ? 'archived' : 'unarchived'} successfully.`,
      room,
    });
  } catch (error) {
    console.error('Archive Room Error:', error.message);
    return res.status(500).json({ message: 'Server error while archiving room.' });
  }
});


module.exports = router;
