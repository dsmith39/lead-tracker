const mongoose = require('mongoose');

const appUserSchema = new mongoose.Schema(
  {
    externalAuthProvider: {
      type: String,
      trim: true,
      default: '',
    },
    externalAuthSubject: {
      type: String,
      trim: true,
      default: '',
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
      required: [true, 'Email is required'],
    },
    displayName: {
      type: String,
      trim: true,
      default: '',
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

appUserSchema.index(
  { externalAuthProvider: 1, externalAuthSubject: 1 },
  {
    unique: true,
    partialFilterExpression: {
      externalAuthProvider: { $type: 'string', $ne: '' },
      externalAuthSubject: { $type: 'string', $ne: '' },
    },
  }
);

appUserSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model('AppUser', appUserSchema);