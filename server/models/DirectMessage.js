const mongoose = require('mongoose');

const directMessageSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      default: '',
      trim: true,
      maxlength: [2000, 'Message cannot exceed 2000 characters'],
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    edited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    deletedForEveryone: {
      type: Boolean,
      default: false,
    },
    attachments: [
      {
        url: { type: String, required: true },
        name: { type: String, required: true },
        size: { type: Number },
        type: { type: String },
      },
    ],
  },
  {
    timestamps: true,
  }
);

directMessageSchema.index({ sender: 1, recipient: 1, createdAt: -1 });
directMessageSchema.index({ recipient: 1, sender: 1, createdAt: -1 });

directMessageSchema.pre('validate', function (next) {
  if (typeof this.content === 'string') {
    this.content = this.content.trim();
  }

  if (!this.content && (!this.attachments || this.attachments.length === 0)) {
    return next(new Error('Message content is required'));
  }

  if (!this.content && this.attachments && this.attachments.length > 0) {
    this.content = '';
  }

  if (this.sender && this.recipient && this.sender.toString() === this.recipient.toString()) {
    return next(new Error('You cannot send a direct message to yourself.'));
  }

  next();
});

directMessageSchema.methods.markAsEdited = function (newContent) {
  this.content = newContent.trim();
  this.edited = true;
  this.editedAt = new Date();
};

directMessageSchema.methods.softDelete = function () {
  this.content = 'This message was deleted';
  this.deletedForEveryone = true;
};

module.exports = mongoose.model('DirectMessage', directMessageSchema);
