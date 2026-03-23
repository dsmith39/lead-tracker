const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
      index: true,
    },
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
    turf: {
      type: {
        type: String,
        enum: ['neighborhood', 'zip', 'grid'],
        default: 'zip',
      },
      label: {
        type: String,
        trim: true,
      },
    },
    assignedTeamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null,
    },
    assignedTeamName: {
      type: String,
      trim: true,
      default: '',
    },
    assignedRepId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Rep',
      default: null,
    },
    assignedRep: {
      type: String,
      trim: true,
      default: '',
    },
    routePlan: {
      date: {
        type: String,
        match: [/^\d{4}-\d{2}-\d{2}$/, 'Route date must be in YYYY-MM-DD format'],
        default: null,
      },
      order: {
        type: Number,
        min: 1,
        default: null,
      },
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

leadSchema.index({ organizationId: 1, createdAt: -1 });
leadSchema.index({ organizationId: 1, assignedRepId: 1, 'routePlan.date': 1 });

module.exports = mongoose.model('Lead', leadSchema);
