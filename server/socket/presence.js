// In-memory presence tracker
// Structure:
// roomId -> Map(userId -> { userId, username, socketIds: Set<string> })

const onlineUsers = new Map();
const userSockets = new Map(); // userId -> Set(socketId)

// ── Presence status tracking ──
// userId -> { status: 'online'|'away'|'offline', lastActivity: timestamp, timer: NodeJS.Timeout }
const AWAY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const userPresence = new Map();
let presenceChangeCallback = null;

const setPresenceCallback = (callback) => {
  presenceChangeCallback = callback;
};

const getUserStatus = (userId) => {
  const entry = userPresence.get(userId);
  return entry ? entry.status : 'offline';
};

const setUserOnline = (userId) => {
  const existing = userPresence.get(userId);
  if (existing && existing.timer) {
    clearTimeout(existing.timer);
  }

  const timer = setTimeout(() => {
    const entry = userPresence.get(userId);
    if (entry && entry.status === 'online') {
      entry.status = 'away';
      if (presenceChangeCallback) {
        presenceChangeCallback(userId, 'away');
      }
    }
  }, AWAY_TIMEOUT_MS);

  const oldStatus = existing ? existing.status : 'offline';
  userPresence.set(userId, { status: 'online', lastActivity: Date.now(), timer });

  if (oldStatus !== 'online' && presenceChangeCallback) {
    presenceChangeCallback(userId, 'online');
  }
};

const touchUserActivity = (userId) => {
  const entry = userPresence.get(userId);
  if (!entry) return;

  if (entry.timer) {
    clearTimeout(entry.timer);
  }

  entry.lastActivity = Date.now();
  const wasAway = entry.status === 'away';
  entry.status = 'online';

  entry.timer = setTimeout(() => {
    const e = userPresence.get(userId);
    if (e && e.status === 'online') {
      e.status = 'away';
      if (presenceChangeCallback) {
        presenceChangeCallback(userId, 'away');
      }
    }
  }, AWAY_TIMEOUT_MS);

  if (wasAway && presenceChangeCallback) {
    presenceChangeCallback(userId, 'online');
  }
};

const setUserOffline = (userId) => {
  const entry = userPresence.get(userId);
  if (entry && entry.timer) {
    clearTimeout(entry.timer);
  }
  // Only go offline if no more sockets
  if (!userSockets.has(userId) || userSockets.get(userId).size === 0) {
    userPresence.delete(userId);
    if (presenceChangeCallback) {
      presenceChangeCallback(userId, 'offline');
    }
  }
};

const getAllUserStatuses = () => {
  const statuses = {};
  for (const [userId, entry] of userPresence.entries()) {
    statuses[userId] = entry.status;
  }
  return statuses;
};

const addUserToRoom = (roomId, userId, username, socketId) => {
  if (!onlineUsers.has(roomId)) {
    onlineUsers.set(roomId, new Map());
  }

  const roomUsers = onlineUsers.get(roomId);

  if (!roomUsers.has(userId)) {
    roomUsers.set(userId, {
      userId,
      username,
      socketIds: new Set(),
    });
  }

  roomUsers.get(userId).socketIds.add(socketId);
};

const removeUserFromRoom = (roomId, userId, socketId = null) => {
  if (!onlineUsers.has(roomId)) return;

  const roomUsers = onlineUsers.get(roomId);
  const userEntry = roomUsers.get(userId);

  if (!userEntry) return;

  if (socketId) {
    userEntry.socketIds.delete(socketId);

    if (userEntry.socketIds.size === 0) {
      roomUsers.delete(userId);
    }
  } else {
    roomUsers.delete(userId);
  }

  if (roomUsers.size === 0) {
    onlineUsers.delete(roomId);
  }
};

const removeUserFromAllRooms = (socketId) => {
  const removedFrom = [];

  for (const [roomId, users] of onlineUsers.entries()) {
    for (const [userId, data] of users.entries()) {
      if (data.socketIds.has(socketId)) {
        data.socketIds.delete(socketId);

        if (data.socketIds.size === 0) {
          users.delete(userId);
          removedFrom.push({
            roomId,
            userId,
            username: data.username,
          });
        }
      }
    }

    if (users.size === 0) {
      onlineUsers.delete(roomId);
    }
  }

  return removedFrom;
};

const getRoomOnlineUsers = (roomId) => {
  if (!onlineUsers.has(roomId)) return [];

  return Array.from(onlineUsers.get(roomId).values()).map((user) => ({
    userId: user.userId,
    username: user.username,
    status: getUserStatus(user.userId),
  }));
};

const isUserOnlineInRoom = (roomId, userId) => {
  if (!onlineUsers.has(roomId)) return false;
  return onlineUsers.get(roomId).has(userId);
};

const addUserSocket = (userId, socketId) => {
  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }
  userSockets.get(userId).add(socketId);
};

const removeUserSocket = (userId, socketId) => {
  if (!userSockets.has(userId)) return;

  userSockets.get(userId).delete(socketId);

  if (userSockets.get(userId).size === 0) {
    userSockets.delete(userId);
  }
};

const getUserSocketIds = (userId) => {
  if (!userSockets.has(userId)) return [];
  return Array.from(userSockets.get(userId));
};


module.exports = {
  addUserToRoom,
  removeUserFromRoom,
  removeUserFromAllRooms,
  getRoomOnlineUsers,
  isUserOnlineInRoom,
  addUserSocket,
  removeUserSocket,
  getUserSocketIds,
  setUserOnline,
  setUserOffline,
  touchUserActivity,
  getUserStatus,
  getAllUserStatuses,
  setPresenceCallback,
};
