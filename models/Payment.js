const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      default: null,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: [true, 'Order ID is required'],
    },
    paymentMethodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PaymentMethod',
      required: [true, 'Payment method ID is required'],
    },
    paymentMethodName: {
      type: String,
      required: true,
      enum: ['Flutterwave', 'Stripe', 'PayPal', 'Squad'],
    },
    paymentMethodType: {
      type: String,
      required: true,
      enum: ['flutterwave', 'stripe', 'paypal', 'squad'],
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0, 'Amount must be positive'],
    },
    currency: {
      type: String,
      required: [true, 'Currency is required'],
      default: 'USD',
    },
    txRef: {
      type: String,
      required: [true, 'Transaction reference is required'],
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'successful', 'failed', 'cancelled'],
      default: 'pending',
    },
    // Flutterwave specific fields
    flwRef: {
      type: String,
      index: true,
    },
    flutterwaveTransactionId: {
      type: Number,
    },
    flutterwaveResponse: {
      type: mongoose.Schema.Types.Mixed,
    },
    // Common payment fields
    failureReason: {
      type: String,
    },
    paidAt: {
      type: Date,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for faster queries
paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index({ orderId: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ txRef: 1 });

module.exports = mongoose.model('Payment', paymentSchema);




