const Dispute = require('../models/Dispute');
const Order = require('../models/Order');
const { getStoreFilter } = require('../middleware/resolveStore');
const { logger } = require('../utils/logger');

/**
 * Customer: List disputes for own order
 * GET /api/v1/orders/:id/disputes
 */
exports.getOrderDisputes = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const order = await Order.findOne({ _id: id, userId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const disputes = await Dispute.find({ orderId: id })
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json({ success: true, data: disputes });
  } catch (error) {
    logger.error('Error getting order disputes', { error: error.message });
    res.status(500).json({ success: false, message: error?.message || 'Failed to get disputes', error: error?.message });
  }
};

/**
 * Customer: Create dispute for own order
 * POST /api/v1/orders/:id/disputes
 */
exports.createOrderDispute = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { reason } = req.body;

    const order = await Order.findOne({ _id: id, userId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const existing = await Dispute.findOne({ orderId: id, status: 'open' });
    if (existing) {
      return res.status(400).json({ success: false, message: 'An open dispute already exists for this order' });
    }

    const dispute = await Dispute.create({
      orderId: id,
      ...(req.storeId && { storeId: req.storeId }),
      reason: reason?.trim() || '',
      status: 'open',
    });

    res.status(201).json({
      success: true,
      message: 'Dispute submitted successfully',
      data: dispute,
    });
  } catch (error) {
    logger.error('Error creating dispute', { error: error.message });
    res.status(500).json({ success: false, message: error?.message || 'Failed to create dispute', error: error?.message });
  }
};

/**
 * Admin: List disputes
 */
exports.getAdminDisputes = async (req, res) => {
  try {
    const filter = getStoreFilter(req.storeId);
    const disputes = await Dispute.find(filter)
      .populate('orderId', 'orderNumber total status')
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json({ success: true, data: disputes });
  } catch (error) {
    logger.error('Error getting disputes', { error: error.message });
    res.status(500).json({ success: false, message: error?.message || 'Failed to get disputes', error: error?.message });
  }
};

/**
 * Admin: Create dispute (stub - CJ integration to be wired)
 */
exports.createDispute = async (req, res) => {
  try {
    const { orderId, reason } = req.body;
    if (!orderId) return res.status(400).json({ success: false, message: 'Order ID is required' });
    const dispute = await Dispute.create({
      ...(req.storeId && { storeId: req.storeId }),
      orderId,
      reason: reason || '',
      status: 'open',
    });
    res.status(201).json({ success: true, data: dispute });
  } catch (error) {
    logger.error('Error creating dispute', { error: error.message });
    res.status(500).json({ success: false, message: error?.message || 'Failed to create dispute', error: error?.message });
  }
};
