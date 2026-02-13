const Order = require('../models/Order');
const Payment = require('../models/Payment');
const { getStoreFilter } = require('../middleware/resolveStore');
const { logger } = require('../utils/logger');

/**
 * Top products by revenue (from order items)
 * GET /api/v1/admin/analytics/top-products?limit=10
 */
exports.getTopProducts = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 5), 50);
    const days = req.query.days ? Math.min(Math.max(parseInt(req.query.days), 7), 365) : null;

    const orderFilter = getStoreFilter(req.storeId);
    const matchStage = { ...orderFilter };
    if (days) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - days);
      matchStage.createdAt = { $gte: start };
    }

    const rows = await Order.aggregate([
      { $match: matchStage },
      { $unwind: '$items' },
      {
        $group: {
          _id: { productId: '$items.productId', productName: '$items.productName' },
          revenue: { $sum: '$items.subtotal' },
          units: { $sum: '$items.quantity' },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: limit },
      {
        $project: {
          productId: '$_id.productId',
          productName: '$_id.productName',
          revenue: 1,
          units: 1,
          _id: 0,
        },
      },
    ]);

    const data = rows.map((r) => ({
      productId: r.productId,
      productName: r.productName || 'Unknown',
      revenue: r.revenue,
      units: r.units,
    }));

    res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('Error getting top products', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get top products',
      error: error.message,
    });
  }
};

/**
 * Revenue by country (from shipping address)
 * GET /api/v1/admin/analytics/revenue-by-country?limit=15
 */
exports.getRevenueByCountry = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 15, 5), 50);
    const days = req.query.days ? Math.min(Math.max(parseInt(req.query.days), 7), 365) : null;

    const orderFilter = getStoreFilter(req.storeId);
    const matchStage = { ...orderFilter };
    if (days) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - days);
      matchStage.createdAt = { $gte: start };
    }

    const rows = await Order.aggregate([
      { $match: matchStage },
      { $group: { _id: '$shippingAddress.country', revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
      { $sort: { revenue: -1 } },
      { $limit: limit },
      { $project: { country: '$_id', revenue: 1, orders: 1, _id: 0 } },
    ]);

    const data = rows.map((r) => ({
      country: r.country || 'Unknown',
      revenue: r.revenue,
      orders: r.orders,
    }));

    res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('Error getting revenue by country', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get revenue by country',
      error: error.message,
    });
  }
};

/**
 * Revenue by payment method (successful payments only)
 * GET /api/v1/admin/analytics/revenue-by-payment-method
 */
exports.getRevenueByPaymentMethod = async (req, res) => {
  try {
    const days = req.query.days ? Math.min(Math.max(parseInt(req.query.days), 7), 365) : null;

    const paymentFilter = getStoreFilter(req.storeId);
    const matchStage = { ...paymentFilter, status: 'successful' };
    if (days) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - days);
      matchStage.createdAt = { $gte: start };
    }

    const rows = await Payment.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$paymentMethodType',
          revenue: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { revenue: -1 } },
      { $project: { method: '$_id', revenue: 1, count: 1, _id: 0 } },
    ]);

    const labels = { flutterwave: 'Flutterwave', squad: 'Squad', stripe: 'Stripe', paypal: 'PayPal' };
    const data = rows.map((r) => ({
      method: r.method,
      label: labels[r.method] || r.method,
      revenue: r.revenue,
      count: r.count,
    }));

    res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('Error getting revenue by payment method', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get revenue by payment method',
      error: error.message,
    });
  }
};

/**
 * Cross-store analytics: revenue, orders, AOV per store
 * GET /api/v1/admin/analytics/by-store
 */
exports.getAnalyticsByStore = async (req, res) => {
  try {
    const Store = require('../models/Store');
    const days = req.query.days ? Math.min(Math.max(parseInt(req.query.days), 7), 365) : null;

    const matchStage = {};
    if (days) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - days);
      matchStage.createdAt = { $gte: start };
    }

    const rows = await Order.aggregate([
      ...(Object.keys(matchStage).length ? [{ $match: matchStage }] : []),
      {
        $group: {
          _id: { $ifNull: ['$storeId', null] },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 },
        },
      },
      {
        $addFields: {
          aov: { $cond: [{ $eq: ['$orders', 0] }, 0, { $divide: ['$revenue', '$orders'] }] },
        },
      },
      { $sort: { revenue: -1 } },
    ]);

    const storeIds = [...new Set(rows.map((r) => r._id).filter(Boolean))];
    const stores = storeIds.length
      ? await Store.find({ _id: { $in: storeIds } }).select('name slug').lean()
      : [];
    const storeMap = new Map(stores.map((s) => [s._id.toString(), s]));

    const data = rows.map((r) => {
      const store = r._id ? storeMap.get(r._id.toString()) : null;
      return {
        storeId: r._id,
        storeName: store?.name || (r._id ? 'Unknown' : 'Unassigned'),
        storeSlug: store?.slug || null,
        revenue: r.revenue,
        orders: r.orders,
        aov: Math.round(r.aov * 100) / 100,
      };
    });

    res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('Error getting analytics by store', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get analytics by store',
      error: error.message,
    });
  }
};
