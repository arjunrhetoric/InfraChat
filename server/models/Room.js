const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Room name is required'],
      unique: true,
      trim: true,
      minlength: [2, 'Room name must be at least 2 characters'],
      maxlength: [50, 'Room name cannot exceed 50 characters'],
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: [200, 'Description cannot exceed 200 characters'],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    bannedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    moderators: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    isPrivate: {
      type: Boolean,
      default: false,
    },
    roomType: {
      type: String,
      enum: ['public', 'private', 'broadcast'],
      default: 'public',
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    announcement: {
      text: { type: String, default: '' },
      setBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      setAt: { type: Date, default: null },
    },
  },
  {
    timestamps: true,
  }
);

// Keep only useful non-duplicate index
roomSchema.index({ createdBy: 1 });

// Ensure creator is automatically added as member and moderator, sync isPrivate with roomType
roomSchema.pre('save', function (next) {
  // Keep isPrivate in sync with roomType
  if (this.isModified('roomType')) {
    this.isPrivate = this.roomType === 'private';
  } else if (this.isModified('isPrivate')) {
    this.roomType = this.isPrivate ? 'private' : 'public';
  }

  if (
    this.createdBy &&
    !this.members.some(
      (memberId) => memberId.toString() === this.createdBy.toString()
    )
  ) {
    this.members.push(this.createdBy);
  }

  if (
    this.createdBy &&
    !this.moderators.some(
      (moderatorId) => moderatorId.toString() === this.createdBy.toString()
    )
  ) {
    this.moderators.push(this.createdBy);
  }

  next();
});

// Helper: check if a user is a member
roomSchema.methods.isMember = function (userId) {
  return this.members.some(
    (memberId) => memberId.toString() === userId.toString()
  );
};

// Helper: check if a user is banned
roomSchema.methods.isBanned = function (userId) {
  return this.bannedUsers.some(
    (bannedUserId) => bannedUserId.toString() === userId.toString()
  );
};

// Helper: check if a user is room moderator
roomSchema.methods.isRoomModerator = function (userId) {
  return this.moderators.some(
    (moderatorId) => moderatorId.toString() === userId.toString()
  );
};

// Helper: add member safely
roomSchema.methods.addMember = function (userId) {
  if (!this.isMember(userId) && !this.isBanned(userId)) {
    this.members.push(userId);
  }
};

// Helper: remove member safely
roomSchema.methods.removeMember = function (userId) {
  this.members = this.members.filter(
    (memberId) => memberId.toString() !== userId.toString()
  );

  this.moderators = this.moderators.filter(
    (moderatorId) => moderatorId.toString() !== userId.toString()
  );
};

// Helper: ban user safely
roomSchema.methods.banUser = function (userId) {
  if (!this.isBanned(userId)) {
    this.bannedUsers.push(userId);
  }

  this.removeMember(userId);
};

module.exports = mongoose.model('Room', roomSchema);
