const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      enum: [
        'USER_KICKED',
        'USER_BANNED',
        'USER_UNBANNED',
        'USER_MUTED',
        'USER_UNMUTED',
        'USER_PROMOTED',
        'USER_DEMOTED',
        'ROOM_CREATED',
        'ROOM_DELETED',
        'ROOM_ARCHIVED',
        'ROOM_UNARCHIVED',
        'ROOM_ANNOUNCEMENT',
        'MESSAGE_DELETED',
      ],
    },

    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    targetUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      default: null,
    },

    details: {
      type: String,
      trim: true,
      maxlength: [500, 'Details cannot exceed 500 characters'],
      default: '',
    },

    metadata: {
      type: Object,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast auditing queries
auditLogSchema.index({ performedBy: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ room: 1, createdAt: -1 });
auditLogSchema.index({ targetUser: 1, createdAt: -1 });

// Prevent modifications (append-only logs)
auditLogSchema.pre(
  [
    'updateOne',
    'updateMany',
    'findOneAndUpdate',
    'findOneAndDelete',
    'deleteOne',
    'deleteMany',
  ],
  function () {
    throw new Error('Audit logs are append-only and cannot be modified or deleted');
  }
);

// Helper method to format log output
auditLogSchema.methods.toJSON = function () {
  const obj = this.toObject();
  return obj;
};

module.exports = mongoose.model('AuditLog', auditLogSchema);
