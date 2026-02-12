const mongoose = require('mongoose');

const paymentMethodSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      default: null,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Payment method name is required'],
      unique: true,
      trim: true,
      enum: ['Flutterwave', 'Stripe', 'PayPal', 'Squad', 'Bank Transfer'],
    },
    type: {
      type: String,
      required: [true, 'Payment method type is required'],
      enum: ['flutterwave', 'stripe', 'paypal', 'squad', 'bank_transfer'],
      unique: true,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    config: {
      // Flutterwave specific
      publicKey: {
        type: String,
        trim: true,
      },
      secretKey: {
        type: String,
        required: false, // Not required for bank_transfer
        select: false, // Don't include in queries by default
      },
      encryptionKey: {
        type: String,
        trim: true, // Flutterwave encryption key for 3DS
      },
      webhookSecret: {
        type: String,
        trim: true,
        select: false, // Don't include in queries by default
      },
      currency: {
        type: String,
        default: 'USD',
      },
      paymentOptions: {
        type: String,
        default: 'card', // card,mobilemoney,ussd
      },
      title: {
        type: String,
        default: 'Order Payment',
      },
      description: {
        type: String,
        default: 'Complete your order payment',
      },
      logo: {
        type: String,
        default: '',
      },
      // Squad specific
      callbackUrl: { type: String, trim: true },
      paymentChannels: {
        type: [String],
        default: ['card', 'bank', 'ussd', 'transfer'],
      },
      // Bank transfer: multiple currency-specific bank details
      bankTransfers: [{
        currency: { type: String, trim: true },
        label: { type: String, trim: true },
        bankName: { type: String, trim: true },
        accountName: { type: String, trim: true },
        iban: { type: String, trim: true },
        bic: { type: String, trim: true },
        accountNumber: { type: String, trim: true },
        sortCode: { type: String, trim: true },
        routingNumber: { type: String, trim: true },
        swiftCode: { type: String, trim: true },
        referenceFormat: { type: String, trim: true },
        instructions: { type: String, trim: true },
      }],
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

// Index for faster lookups
paymentMethodSchema.index({ type: 1, isActive: 1 });

// Ensure only one default payment method
paymentMethodSchema.pre('save', async function (next) {
  if (this.isDefault) {
    await this.constructor.updateMany(
      { _id: { $ne: this._id } },
      { $set: { isDefault: false } }
    );
  }
  next();
});

module.exports = mongoose.model('PaymentMethod', paymentMethodSchema);




