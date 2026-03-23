const mongoose = require('mongoose');

const visitSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
      index: true,
    },
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      required: true,
      index: true,
    },
    outcome: {
      type: String,
      enum: ['not-visited', 'no-answer', 'spoke-to-owner', 'not-interested', 'callback-requested', 'sale-closed'],
      required: true,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    dispositionReason: {
      type: String,
      trim: true,
      default: '',
    },
    nextFollowUpAt: {
      type: Date,
      default: null,
    },
    visitAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

visitSchema.index({ organizationId: 1, lead: 1, visitAt: -1 });

module.exports = mongoose.model('Visit', visitSchema);
