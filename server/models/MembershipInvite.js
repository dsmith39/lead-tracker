const mongoose = require('mongoose');

const membershipInviteSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      required: [true, 'Invite email is required'],
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
      index: true,
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'manager', 'canvasser'],
      default: 'canvasser',
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'revoked', 'expired'],
      default: 'pending',
      index: true,
    },
    invitedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AppUser',
      required: true,
    },
    acceptedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AppUser',
      default: null,
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

membershipInviteSchema.index(
  { organizationId: 1, email: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: 'pending',
    },
  }
);

module.exports = mongoose.model('MembershipInvite', membershipInviteSchema);
