const mongoose = require('mongoose');

const repSchema = new mongoose.Schema(
  {
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

repSchema.index({ name: 1, teamId: 1 }, { unique: true });

module.exports = mongoose.model('Rep', repSchema);