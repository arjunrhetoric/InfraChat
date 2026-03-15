const Message = require('../models/Message');
const Room = require('../models/Room');
const User = require('../models/User');
const DirectMessage = require('../models/DirectMessage');
const { getUserSocketIds, touchUserActivity } = require('./presence');

const {
  addUserToRoom,
  removeUserFromRoom,
  removeUserFromAllRooms,
  getRoomOnlineUsers,
} = require('./presence');
const { processCommand } = require('../commands/pipeline');
const { ROLES } = require('../middleware/rbac');

const isSameId = (a, b) => a.toString() === b.toString();

const registerHandlers = (io, socket) => {
  const user = socket.user;

  const emitSocketError = (message) => {
    socket.emit('socket:error', { message });
  };


  // ── Silent Room Subscribe (for unread notifications) ──
socket.on('room:subscribe', async (roomIds = []) => {
  try {
    if (!Array.isArray(roomIds)) return;

    for (const roomId of roomIds) {
      const room = await Room.findById(roomId);
      if (!room) continue;

      const isSuperAdmin = user.role >= ROLES.SUPERADMIN;
      const isMember = room.isMember(user._id);

      if (!isMember && !isSuperAdmin) continue;
      if (room.isBanned(user._id) && !isSuperAdmin) continue;

      socket.join(roomId);
    }
  } catch (err) {
    console.error('room:subscribe error:', err.message);
  }
});

  // ── Room Join ──
  socket.on('room:join', async (roomId) => {
    try {
      if (!roomId) {
        return emitSocketError('Room ID is required.');
      }

      const room = await Room.findById(roomId);
      if (!room) {
        return emitSocketError('Room not found.');
      }

      const isSuperAdmin = user.role >= ROLES.SUPERADMIN;

      if (room.isBanned(reqSafeUserId(user)) && !isSuperAdmin) {
        return emitSocketError('You are banned from this room.');
      }

      // Private rooms should not be freely joinable unless already a member or superadmin
      const alreadyMember = room.isMember(reqSafeUserId(user));
      if (room.isPrivate && !alreadyMember && !isSuperAdmin) {
        return emitSocketError('This is a private room. You cannot join directly.');
      }

      if (!alreadyMember) {
        room.addMember(reqSafeUserId(user));
        await room.save();
      }

      socket.join(roomId);
      addUserToRoom(roomId, user._id.toString(), user.username, socket.id);

      socket.emit('room:joined', {
        roomId,
        roomName: room.name,
      });

      io.to(roomId).emit('room:onlineUsers', {
        roomId,
        users: getRoomOnlineUsers(roomId),
      });

      socket.to(roomId).emit('user:joined', {
        userId: user._id,
        username: user.username,
        roomId,
      });

      const sysMsg = await Message.create({
        content: `${user.username} joined the room`,
        sender: user._id,
        room: roomId,
        type: 'system',
      });

      await sysMsg.populate('sender', 'username role avatar');
      io.to(roomId).emit('message:new', sysMsg);
    } catch (err) {
      console.error('room:join error:', err.message);
      emitSocketError('Failed to join room.');
    }
  });

  // ── Room Leave ──
  socket.on('room:leave', async (roomId) => {
    try {
      if (!roomId) {
        return emitSocketError('Room ID is required.');
      }

      const room = await Room.findById(roomId);
      if (!room) {
        return emitSocketError('Room not found.');
      }

      socket.leave(roomId);
      removeUserFromRoom(roomId, user._id.toString());

      io.to(roomId).emit('room:onlineUsers', {
        roomId,
        users: getRoomOnlineUsers(roomId),
      });

      socket.to(roomId).emit('user:left', {
        userId: user._id,
        username: user.username,
        roomId,
      });
    } catch (err) {
      console.error('room:leave error:', err.message);
      emitSocketError('Failed to leave room.');
    }
  });

  // ── Direct Message Send ──
socket.on('dm:send', async ({ recipientId, content, attachments }) => {
  try {
    if (!recipientId) {
      return emitSocketError('Recipient ID is required.');
    }

    const trimmedContent = content ? content.trim() : '';
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

    if (!trimmedContent && !hasAttachments) {
      return emitSocketError('Message content is required.');
    }

    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return emitSocketError('Recipient not found.');
    }

    if (recipient.isBanned) {
      return emitSocketError('Cannot send message to this user.');
    }

    if (recipient._id.toString() === user._id.toString()) {
      return emitSocketError('You cannot message yourself.');
    }

    const dmData = {
      content: trimmedContent,
      sender: user._id,
      recipient: recipient._id,
    };

    if (hasAttachments) {
      dmData.attachments = attachments;
    }

    const directMessage = await DirectMessage.create(dmData);

    await directMessage.populate('sender', 'username role avatar');
    await directMessage.populate('recipient', 'username role avatar');

    // sender gets copy
    socket.emit('dm:new', directMessage);

    // recipient gets copy on all active sockets
    const recipientSocketIds = getUserSocketIds(recipient._id.toString());
    recipientSocketIds.forEach((socketId) => {
      io.to(socketId).emit('dm:new', directMessage);
    });
  } catch (err) {
    console.error('dm:send error:', err.message);
    emitSocketError('Failed to send direct message.');
  }
});


  // ── Message Send ──
  socket.on('message:send', async ({ roomId, content, attachments }) => {
    try {
      touchUserActivity(user._id.toString());

      if (!roomId) {
        return emitSocketError('Room ID is required.');
      }

      const trimmedContent = content ? content.trim() : '';
      const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

      if (!trimmedContent && !hasAttachments) {
        return;
      }

      const room = await Room.findById(roomId);
      if (!room) {
        return emitSocketError('Room not found.');
      }

      const freshUser = await User.findById(user._id);
      if (!freshUser) {
        return emitSocketError('User not found.');
      }

      const isSuperAdmin = freshUser.role >= ROLES.SUPERADMIN;
      const isMember = room.isMember(freshUser._id);

      if (room.isBanned(freshUser._id) && !isSuperAdmin) {
        return emitSocketError('You are banned from this room.');
      }

      if (!isMember && !isSuperAdmin) {
        return emitSocketError('You are not a member of this room.');
      }

      // Check if room is archived (read-only)
      if (room.isArchived) {
        return emitSocketError('This room is archived and read-only.');
      }

      // Check broadcast room restriction (only Moderator+ can send)
      if (room.roomType === 'broadcast' && freshUser.role < ROLES.MODERATOR) {
        return emitSocketError('Only moderators and admins can send messages in broadcast rooms.');
      }

      // Check mute
      freshUser.checkMuteStatus?.();
      if (freshUser.isModified && freshUser.isModified('isMuted')) {
        await freshUser.save();
      }

      if (freshUser.isMuted) {
        if (freshUser.mutedUntil) {
          return emitSocketError(
            `You are muted until ${freshUser.mutedUntil.toLocaleString()}.`
          );
        }
        return emitSocketError('You are muted.');
      }

      // Check for command (only text commands, not file attachments)
      if (trimmedContent.startsWith('/') && !hasAttachments) {
        const result = await processCommand(trimmedContent, {
          user: freshUser,
          room,
          io,
          socket,
        });

        if (result && result.message) {
          const cmdMsg = await Message.create({
            content: result.message,
            sender: user._id,
            room: roomId,
            type: 'command',
          });

          await cmdMsg.populate('sender', 'username role avatar');

          if (result.broadcast) {
            io.to(roomId).emit('message:new', cmdMsg);
          } else {
            socket.emit('message:new', cmdMsg);
          }
        }

        return;
      }

      const messageData = {
        content: trimmedContent,
        sender: user._id,
        room: roomId,
        type: 'text',
      };

      if (hasAttachments) {
        messageData.attachments = attachments;
      }

      const message = await Message.create(messageData);

      await message.populate('sender', 'username role avatar');
      io.to(roomId).emit('message:new', message);
    } catch (err) {
      console.error('message:send error:', err.message);
      emitSocketError('Failed to send message.');
    }
  });

  // ── Typing Indicators ──
  socket.on('typing:start', async ({ roomId }) => {
    try {
      touchUserActivity(user._id.toString());

      if (!roomId) return;

      const room = await Room.findById(roomId);
      if (!room) return;

      if (!room.isMember(user._id) && user.role < ROLES.SUPERADMIN) return;

      socket.to(roomId).emit('typing:update', {
        userId: user._id,
        username: user.username,
        isTyping: true,
      });
    } catch (err) {
      console.error('typing:start error:', err.message);
    }
  });

  socket.on('typing:stop', async ({ roomId }) => {
    try {
      if (!roomId) return;

      const room = await Room.findById(roomId);
      if (!room) return;

      if (!room.isMember(user._id) && user.role < ROLES.SUPERADMIN) return;

      socket.to(roomId).emit('typing:update', {
        userId: user._id,
        username: user.username,
        isTyping: false,
      });
    } catch (err) {
      console.error('typing:stop error:', err.message);
    }
  });

  // ── Presence Heartbeat ──
  socket.on('presence:heartbeat', () => {
    touchUserActivity(user._id.toString());
  });

  // ── Disconnect ──
  socket.on('disconnect', () => {
    try {
      const removedFrom = removeUserFromAllRooms(socket.id);

      removedFrom.forEach(({ roomId, username }) => {
        io.to(roomId).emit('user:left', {
          userId: user._id,
          username,
          roomId,
        });

        io.to(roomId).emit('room:onlineUsers', {
          roomId,
          users: getRoomOnlineUsers(roomId),
        });
      });
    } catch (err) {
      console.error('disconnect error:', err.message);
    }
  });
};

const reqSafeUserId = (user) => user._id;

module.exports = { registerHandlers };
