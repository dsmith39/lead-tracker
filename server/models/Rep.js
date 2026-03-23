const mongoose = require('mongoose');

const repSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Rep name is required'],
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
    },
    phone: {
      type: String,
      trim: true,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

repSchema.index(
  { organizationId: 1, name: 1, teamId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      organizationId: { $type: 'objectId' },
    },
  }
);
repSchema.index({ organizationId: 1, teamId: 1, active: 1 });

module.exports = mongoose.model('Rep', repSchema);