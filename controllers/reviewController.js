const Review = require('../models/Review');
const { getStoreFilter } = require('../middleware/resolveStore');
const { logger } = require('../utils/logger');

/**
 * Public: List approved reviews for a product
 * GET /api/v1/products/:id/reviews
 */
exports.getProductReviews = async (req, res) => {
  try {
    const { id } = req.params;
    const productFilter = getStoreFilter(req.storeId);
    const reviewFilter = { productId: id, status: 'approved', ...productFilter };
    const reviews = await Review.find(reviewFilter)
      .populate('userId', 'firstName lastName')
      .select('rating title body createdAt')
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json({ success: true, data: reviews });
  } catch (error) {
    logger.error('Error getting product reviews', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to get reviews', error: error.message });
  }
};

/**
 * Public: Create review for a product (authenticated)
 * POST /api/v1/products/:id/reviews
 */
exports.createProductReview = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { rating, title, body } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
    }

    const productFilter = getStoreFilter(req.storeId);
    const Product = require('../models/Product');
    const product = await Product.findOne({ _id: id, ...productFilter });
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const existing = await Review.findOne({ productId: id, userId });
    if (existing) {
      return res.status(400).json({ success: false, message: 'You have already reviewed this product' });
    }

    const review = await Review.create({
      productId: id,
      userId,
      ...(req.storeId && { storeId: req.storeId }),
      rating: Math.round(rating),
      title: title?.trim() || '',
      body: body?.trim() || '',
      status: 'pending',
    });

    res.status(201).json({
      success: true,
      message: 'Review submitted for moderation',
      data: review,
    });
  } catch (error) {
    logger.error('Error creating review', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to submit review', error: error.message });
  }
};

/**
 * Admin: List reviews
 */
exports.getAdminReviews = async (req, res) => {
  try {
    const filter = getStoreFilter(req.storeId);
    const reviews = await Review.find(filter)
      .populate('productId', 'name')
      .populate('userId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json({ success: true, data: reviews });
  } catch (error) {
    logger.error('Error getting reviews', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to get reviews', error: error.message });
  }
};

/**
 * Admin: Update review status (approve/reject)
 */
exports.updateReviewStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const filter = getStoreFilter(req.storeId);
    const review = await Review.findOneAndUpdate(
      { _id: id, ...filter },
      { status },
      { new: true }
    );
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });
    res.status(200).json({ success: true, data: review });
  } catch (error) {
    logger.error('Error updating review', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to update review', error: error.message });
  }
};
