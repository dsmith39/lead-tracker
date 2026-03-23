const mongoose = require('mongoose');

const visitSchema = new mongoose.Schema(
  {
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

module.exports = mongoose.model('Visit', visitSchema);
