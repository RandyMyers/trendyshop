const mongoose = require('mongoose');

const disputeSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      default: null,
      index: true,
    },
    cjDisputeId: {
      type: String,
      index: true,
    },
    reason: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['open', 'resolved', 'cancelled'],
      default: 'open',
      index: true,
    },
    resolution: {
      type: String,
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

disputeSchema.index({ storeId: 1, status: 1 });

module.exports = mongoose.model('Dispute', disputeSchema);
