const Coupon = require('../models/Coupon');
const { getStoreFilter } = require('../middleware/resolveStore');
const { logger } = require('../utils/logger');

/**
 * Admin: List coupons
 * GET /api/v1/admin/coupons
 */
exports.getAdminCoupons = async (req, res) => {
  try {
    const couponFilter = getStoreFilter(req.storeId);
    const coupons = await Coupon.find(couponFilter).sort({ createdAt: -1 }).lean();
    res.status(200).json({ success: true, data: coupons });
  } catch (error) {
    logger.error('Error getting coupons', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get coupons',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

/**
 * Admin: Create coupon
 * POST /api/v1/admin/coupons
 */
exports.createCoupon = async (req, res) => {
  try {
    const { code, description, discountType, discountValue, minOrderAmount, maxUses, startsAt, expiresAt, isActive } = req.body;
    if (!code || !discountValue) {
      return res.status(400).json({ success: false, message: 'Code and discount value are required' });
    }
    const coupon = await Coupon.create({
      ...(req.storeId && { storeId: req.storeId }),
      code: String(code).trim().toUpperCase(),
      description: description?.trim(),
      discountType: discountType || 'percentage',
      discountValue: parseFloat(discountValue) || 0,
      minOrderAmount: parseFloat(minOrderAmount) || 0,
      maxUses: maxUses ? parseInt(maxUses, 10) : null,
      startsAt: startsAt ? new Date(startsAt) : null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      isActive: isActive !== false,
    });
    res.status(201).json({ success: true, message: 'Coupon created', data: coupon });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Coupon code already exists' });
    }
    logger.error('Error creating coupon', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to create coupon',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

/**
 * Admin: Update coupon
 * PUT /api/v1/admin/coupons/:id
 */
exports.updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const couponFilter = getStoreFilter(req.storeId);
    const coupon = await Coupon.findOne({ _id: id, ...couponFilter });
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });
    const { code, description, discountType, discountValue, minOrderAmount, maxUses, startsAt, expiresAt, isActive } = req.body;
    if (code !== undefined) coupon.code = String(code).trim().toUpperCase();
    if (description !== undefined) coupon.description = description?.trim();
    if (discountType !== undefined) coupon.discountType = discountType;
    if (discountValue !== undefined) coupon.discountValue = parseFloat(discountValue) || 0;
    if (minOrderAmount !== undefined) coupon.minOrderAmount = parseFloat(minOrderAmount) || 0;
    if (maxUses !== undefined) coupon.maxUses = maxUses ? parseInt(maxUses, 10) : null;
    if (startsAt !== undefined) coupon.startsAt = startsAt ? new Date(startsAt) : null;
    if (expiresAt !== undefined) coupon.expiresAt = expiresAt ? new Date(expiresAt) : null;
    if (isActive !== undefined) coupon.isActive = isActive;
    await coupon.save();
    res.status(200).json({ success: true, message: 'Coupon updated', data: coupon });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Coupon code already exists' });
    }
    logger.error('Error updating coupon', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to update coupon',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

/**
 * Admin: Delete coupon
 * DELETE /api/v1/admin/coupons/:id
 */
exports.deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const couponFilter = getStoreFilter(req.storeId);
    const coupon = await Coupon.findOneAndDelete({ _id: id, ...couponFilter });
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });
    res.status(200).json({ success: true, message: 'Coupon deleted' });
  } catch (error) {
    logger.error('Error deleting coupon', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to delete coupon',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

/**
 * Public: Validate coupon (for checkout)
 * POST /api/v1/coupons/validate
 * Body: { code, subtotal }
 */
exports.validateCoupon = async (req, res) => {
  try {
    const { code, subtotal = 0 } = req.body || {};
    if (!code || !code.trim()) {
      return res.status(400).json({ success: false, message: 'Coupon code is required' });
    }
    const couponFilter = getStoreFilter(req.storeId);
    const coupon = await Coupon.findOne({ code: String(code).trim().toUpperCase(), ...couponFilter });
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Invalid coupon code' });
    }
    if (!coupon.isValid(subtotal)) {
      return res.status(400).json({
        success: false,
        message: 'Coupon is expired, invalid, or minimum order not met',
      });
    }
    const discount = coupon.calculateDiscount(subtotal);
    res.status(200).json({
      success: true,
      data: {
        code: coupon.code,
        discountAmount: discount,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
      },
    });
  } catch (error) {
    logger.error('Error validating coupon', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to validate coupon',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};
