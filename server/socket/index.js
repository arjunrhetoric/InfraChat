const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { registerHandlers } = require('./handlers');
const { addUserSocket, removeUserSocket, setUserOnline, setUserOffline, setPresenceCallback } = require('./presence');

let ioInstance = null;

const getIO = () => ioInstance;

const initializeSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: ['https://infra-chat-faeg.vercel.app'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  ioInstance = io;

  // Set up presence change broadcaster
  setPresenceCallback((userId, status) => {
    io.emit(status === 'offline' ? 'user:offline' : 'user:online', {
      userId,
      status,
    });
  });

  // JWT auth middleware for socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);

      if (!user) {
        return next(new Error('User not found'));
      }

      if (user.isBanned) {
        return next(new Error('Account banned'));
      }

      // Auto-check mute expiry
      user.checkMuteStatus?.();
      if (user.isModified && user.isModified('isMuted')) {
        await user.save();
      }

      socket.user = user;
      next();
    } catch (err) {
      console.error('Socket Auth Error:', err.message);

      if (err.name === 'TokenExpiredError') {
        return next(new Error('Token expired'));
      }

      if (err.name === 'JsonWebTokenError') {
        return next(new Error('Invalid token'));
      }

      return next(new Error('Socket authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`⚡ User connected: ${socket.user.username} (${socket.id})`);
    addUserSocket(socket.user._id.toString(), socket.id);
    setUserOnline(socket.user._id.toString());

    socket.emit('socket:connected', {
      message: 'Socket connected successfully',
      user: {
        id: socket.user._id,
        username: socket.user.username,
        role: socket.user.role,
      },
    });

    registerHandlers(io, socket);

    socket.on('disconnect', (reason) => {
      removeUserSocket(socket.user._id.toString(), socket.id);
      setUserOffline(socket.user._id.toString());

      console.log(
        `🔌 User disconnected: ${socket.user.username} (${socket.id}) - ${reason}`
      );
    });
  });

  return io;
};

module.exports = { initializeSocket, getIO };
