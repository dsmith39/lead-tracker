const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
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
    company: {
      type: String,
      trim: true,
    },
    address: {
      street: {
        type: String,
        trim: true,
      },
      city: {
        type: String,
        trim: true,
      },
      state: {
        type: String,
        trim: true,
      },
      postalCode: {
        type: String,
        trim: true,
      },
      country: {
        type: String,
        trim: true,
        default: 'USA',
      },
    },
    location: {
      lat: {
        type: Number,
      },
      lng: {
        type: Number,
      },
    },
    homeType: {
      type: String,
      enum: ['single-family', 'multi-family', 'townhome', 'apartment', 'condo', 'mobile-home', 'other'],
      default: 'other',
    },
    status: {
      type: String,
      enum: ['not-visited', 'no-answer', 'spoke-to-owner', 'not-interested', 'callback-requested', 'sale-closed'],
      default: 'not-visited',
    },
    knockCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    lastVisitAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Lead', leadSchema);
