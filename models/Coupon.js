const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      default: null,
      index: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
    },
    discountType: {
      type: String,
      enum: ['percentage', 'fixed'],
      default: 'percentage',
    },
    discountValue: {
      type: Number,
      required: true,
      min: 0,
    },
    minOrderAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxUses: {
      type: Number,
      default: null,
      min: 1,
    },
    usedCount: {
      type: Number,
      default: 0,
    },
    startsAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

couponSchema.index({ code: 1, isActive: 1 });

couponSchema.methods.isValid = function (orderTotal = 0) {
  if (!this.isActive) return false;
  const now = new Date();
  if (this.startsAt && now < this.startsAt) return false;
  if (this.expiresAt && now > this.expiresAt) return false;
  if (this.maxUses != null && this.usedCount >= this.maxUses) return false;
  if (this.minOrderAmount > 0 && orderTotal < this.minOrderAmount) return false;
  return true;
};

couponSchema.methods.calculateDiscount = function (subtotal) {
  if (this.discountType === 'percentage') {
    return Math.min((subtotal * this.discountValue) / 100, subtotal);
  }
  return Math.min(this.discountValue, subtotal);
};

module.exports = mongoose.model('Coupon', couponSchema);
