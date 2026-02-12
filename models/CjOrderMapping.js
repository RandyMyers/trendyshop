const mongoose = require('mongoose');

const cjOrderMappingSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      unique: true,
    },
    cjOrderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    cjOrderNumber: {
      type: String,
    },
    cjTrackingNumber: {
      type: String,
    },
    cjStatus: {
      type: String,
    },
    cjResponse: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
cjOrderMappingSchema.index({ orderId: 1 });
cjOrderMappingSchema.index({ cjOrderId: 1 });

module.exports = mongoose.model('CjOrderMapping', cjOrderMappingSchema);




