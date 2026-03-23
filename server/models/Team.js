const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Team name is required'],
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

teamSchema.index(
  { organizationId: 1, name: 1 },
  {
    unique: true,
    partialFilterExpression: {
      organizationId: { $type: 'objectId' },
    },
  }
);

module.exports = mongoose.model('Team', teamSchema);