const Order = require('../models/Order');
const Product = require('../models/Product');
const cjBalanceService = require('../services/cjBalanceService');
const { getStoreFilter } = require('../middleware/resolveStore');
const { logger } = require('../utils/logger');

/**
 * Get CJ balance for admin dashboard
 * GET /api/v1/admin/cj/balance
 */
exports.getCjBalance = async (req, res) => {
  try {
    const balance = await cjBalanceService.getBalance();
    res.status(200).json({
      success: true,
      data: balance,
    });
  } catch (error) {
    logger.error('Error getting CJ balance', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get CJ balance',
      error: error.message,
    });
  }
};

/**
 * Get dashboard stats for admin
 * GET /api/v1/admin/dashboard/stats
 */
exports.getDashboardStats = async (req, res) => {
  try {
    const orderFilter = getStoreFilter(req.storeId);
    const productFilter = getStoreFilter(req.storeId);

    const lowStockFilter = {
      ...productFilter,
      isInStore: true,
      $or: [
        { stock: { $lte: 5 } },
        { stock: null },
        { stock: { $exists: false } },
        { 'variants.stock': { $lte: 5 } },
        { isAvailable: false },
      ],
    };

    const [revenueAndCount, ordersByStatus, totalProducts, lowStockCount, recentOrders, recentProducts, lowStockProducts] = await Promise.all([
      Order.aggregate([
        ...(Object.keys(orderFilter).length ? [{ $match: orderFilter }] : []),
        { $group: { _id: null, totalRevenue: { $sum: '$total' }, totalOrders: { $sum: 1 } } },
      ]).then((r) => (r[0] ? { totalRevenue: r[0].totalRevenue, totalOrders: r[0].totalOrders } : { totalRevenue: 0, totalOrders: 0 })),
      Order.aggregate([
        ...(Object.keys(orderFilter).length ? [{ $match: orderFilter }] : []),
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]).then((rows) => {
        const byStatus = {};
        rows.forEach((r) => { byStatus[r._id] = r.count; });
        return byStatus;
      }),
      Product.countDocuments({ ...productFilter, isInStore: true }),
      Product.countDocuments(lowStockFilter),
      Order.find(orderFilter).sort({ createdAt: -1 }).limit(5).populate('userId', 'firstName lastName email').lean(),
      Product.find({ ...productFilter, isInStore: true }).sort({ updatedAt: -1 }).limit(10).select('name sku price stock images customImages status isAvailable storeId').populate('storeId', 'name slug').lean(),
      Product.find(lowStockFilter).sort({ stock: 1, updatedAt: -1 }).limit(10).select('name sku price stock images customImages status isAvailable storeId').populate('storeId', 'name slug').lean(),
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalOrders: revenueAndCount.totalOrders || 0,
        totalRevenue: revenueAndCount.totalRevenue || 0,
        ordersByStatus,
        totalProducts: totalProducts || 0,
        lowStockCount: lowStockCount || 0,
        recentOrders,
        recentProducts: recentProducts || [],
        lowStockProducts: lowStockProducts || [],
      },
    });
  } catch (error) {
    logger.error('Error getting dashboard stats', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get dashboard stats',
      error: error.message,
    });
  }
};

/**
 * Get dashboard trends (orders + revenue by day)
 * GET /api/v1/admin/dashboard/trends?days=30
 */
exports.getDashboardTrends = async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 7), 365);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));

    const orderFilter = getStoreFilter(req.storeId);
    const matchStage = { createdAt: { $gte: start } };
    if (Object.keys(orderFilter).length) {
      Object.assign(matchStage, orderFilter);
    }

    const rows = await Order.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          orders: { $sum: 1 },
          revenue: { $sum: '$total' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const byDate = new Map(rows.map((r) => [r._id, r]));
    const series = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const r = byDate.get(key);
      series.push({
        date: key,
        orders: r?.orders || 0,
        revenue: r?.revenue || 0,
      });
    }

    res.status(200).json({
      success: true,
      data: { days, series },
    });
  } catch (error) {
    logger.error('Error getting dashboard trends', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get dashboard trends',
      error: error.message,
    });
  }
};
