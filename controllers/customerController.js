const User = require('../models/User');
const Order = require('../models/Order');
const mongoose = require('mongoose');
const { getStoreFilter } = require('../middleware/resolveStore');
const { logger } = require('../utils/logger');

/**
 * Admin: Get list of customers with order stats
 * GET /api/v1/admin/customers
 * Query: page, limit, search, sort (totalSpent|orderCount|createdAt)
 */
exports.getCustomers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { search, sort = 'createdAt' } = req.query;

    const matchStage = { role: 'customer' };
    if (search && search.trim()) {
      const term = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(term, 'i');
      matchStage.$or = [
        { email: regex },
        { firstName: regex },
        { lastName: regex },
      ];
    }

    const sortField =
      sort === 'totalSpent'
        ? { totalSpent: -1 }
        : sort === 'orderCount'
          ? { orderCount: -1 }
          : { createdAt: -1 };

    const orderFilter = getStoreFilter(req.storeId);
    const lookupMatch = { $expr: { $eq: ['$userId', '$$userId'] } };
    if (Object.keys(orderFilter).length) {
      Object.assign(lookupMatch, orderFilter);
    }
    const lookupPipeline = [{ $match: lookupMatch }];

    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: 'orders',
          let: { userId: '$_id' },
          pipeline: lookupPipeline,
          as: 'orders',
        },
      },
      {
        $addFields: {
          orderCount: { $size: '$orders' },
          totalSpent: { $sum: '$orders.total' },
          lastOrderAt: { $max: '$orders.createdAt' },
        },
      },
      ...(Object.keys(orderFilter).length ? [{ $match: { orderCount: { $gt: 0 } } }] : []),
      {
        $facet: {
          data: [
            { $sort: sortField },
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                _id: 1,
                firstName: 1,
                lastName: 1,
                email: 1,
                phone: 1,
                orderCount: 1,
                totalSpent: 1,
                lastOrderAt: 1,
                lastKnownIp: 1,
                createdAt: 1,
              },
            },
          ],
          total: [{ $count: 'count' }],
        },
      },
    ];

    const result = await User.aggregate(pipeline);
    const customers = result[0]?.data || [];
    const totalResult = result[0]?.total?.[0]?.count ?? 0;

    res.status(200).json({
      success: true,
      data: customers,
      pagination: {
        page,
        limit,
        total: totalResult,
        pages: Math.ceil(totalResult / limit) || 1,
      },
    });
  } catch (error) {
    logger.error('Error getting customers', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get customers',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

/**
 * Admin: Get customer LTV (lifetime value) distribution buckets
 * GET /api/v1/admin/customers/ltv-distribution
 */
exports.getLtvDistribution = async (req, res) => {
  try {
    const orderFilter = getStoreFilter(req.storeId);
    const ltvMatch = { userId: { $exists: true, $ne: null } };
    if (Object.keys(orderFilter).length) Object.assign(ltvMatch, orderFilter);

    // Aggregate totalSpent from Order (source of truth)
    const rawBuckets = await Order.aggregate([
      { $match: ltvMatch },
      {
        $group: {
          _id: '$userId',
          totalSpent: { $sum: '$total' },
        },
      },
      {
        $bucket: {
          groupBy: '$totalSpent',
          boundaries: [0, 50, 200, 500],
          default: '500+',
          output: {
            count: { $sum: 1 },
          },
        },
      },
    ]);

    const countsByKey = rawBuckets.reduce((acc, b) => {
      acc[String(b._id)] = b.count || 0;
      return acc;
    }, {});

    const buckets = [
      { key: '0', label: '< $50', min: 0, max: 50 },
      { key: '50', label: '$50–$200', min: 50, max: 200 },
      { key: '200', label: '$200–$500', min: 200, max: 500 },
      { key: '500+', label: '$500+', min: 500, max: null },
    ];

    const data = buckets.map((b) => ({
      label: b.label,
      min: b.min,
      max: b.max,
      count: countsByKey[b.key] || 0,
    }));

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error('Error getting customer LTV distribution', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get customer LTV distribution',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

/**
 * Admin: Get customer detail + orders
 * GET /api/v1/admin/customers/:id
 */
exports.getCustomerDetail = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid customer ID',
      });
    }

    const user = await User.findById(id)
      .select('firstName lastName email phone role lastKnownIp createdAt shippingAddress billingAddress')
      .lean();

    if (!user || user.role !== 'customer') {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      });
    }

    const [orders, stats, ipList] = await Promise.all([
      Order.find({ userId: id })
        .select('orderNumber total status paymentStatus createdAt customerIp _id')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
      Order.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(id) } },
        {
          $group: {
            _id: null,
            orderCount: { $sum: 1 },
            totalSpent: { $sum: '$total' },
            firstOrderAt: { $min: '$createdAt' },
            lastOrderAt: { $max: '$createdAt' },
          },
        },
      ]),
      Order.distinct('customerIp', { userId: id, customerIp: { $exists: true, $nin: [null, ''] } }),
    ]);

    const s = stats[0] || { orderCount: 0, totalSpent: 0, firstOrderAt: null, lastOrderAt: null };

    // Same IP: get all orders from any of this customer's IPs
    const ips = ipList.filter(Boolean);
    let sameIpOrders = [];
    if (ips.length > 0) {
      sameIpOrders = await Order.find({ customerIp: { $in: ips } })
        .populate('userId', 'firstName lastName email')
        .select('orderNumber total status createdAt customerIp userId')
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
    }


    res.status(200).json({
      success: true,
      data: {
        ...user,
        orderCount: s.orderCount,
        totalSpent: s.totalSpent,
        firstOrderAt: s.firstOrderAt,
        lastOrderAt: s.lastOrderAt,
        orders,
        sameIpOrders,
      },
    });
  } catch (error) {
    logger.error('Error getting customer detail', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get customer',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

/**
 * Admin: Get orders for customer (paginated)
 * GET /api/v1/admin/customers/:id/orders
 */
exports.getCustomerOrders = async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid customer ID',
      });
    }

    const user = await User.findById(id).select('_id role').lean();
    if (!user || user.role !== 'customer') {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      });
    }

    const [orders, total] = await Promise.all([
      Order.find({ userId: id })
        .populate('paymentId', 'status amount currency')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments({ userId: id }),
    ]);

    res.status(200).json({
      success: true,
      data: orders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    logger.error('Error getting customer orders', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get customer orders',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

/**
 * Admin: Get orders grouped by IP
 * GET /api/v1/admin/customers/by-ip/:ip
 */
exports.getOrdersByIp = async (req, res) => {
  try {
    const { ip } = req.params;

    const orders = await Order.find({ customerIp: ip })
      .populate('userId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      data: orders,
    });
  } catch (error) {
    logger.error('Error getting orders by IP', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get orders by IP',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

/**
 * Admin: Backfill customer stats (orderCount, totalSpent, lastKnownIp)
 * POST /api/v1/admin/customers/backfill-stats
 */
exports.backfillCustomerStats = async (req, res) => {
  try {
    const stats = await Order.aggregate([
      { $match: { userId: { $exists: true, $ne: null } } },
      { $sort: { createdAt: 1 } }, // ensure $last is most recent
      {
        $group: {
          _id: '$userId',
          orderCount: { $sum: 1 },
          totalSpent: { $sum: '$total' },
          lastOrderAt: { $max: '$createdAt' },
          lastOrderIp: { $last: '$customerIp' },
        },
      },
    ]);

    if (!stats.length) {
      return res.status(200).json({ success: true, message: 'No orders found to backfill', data: { updated: 0 } });
    }

    const ops = stats.map((s) => {
      const set = {
        orderCount: s.orderCount || 0,
        totalSpent: s.totalSpent || 0,
      };
      if (s.lastOrderIp) set.lastKnownIp = s.lastOrderIp;
      return {
        updateOne: {
          filter: { _id: s._id },
          update: { $set: set },
        },
      };
    });

    const result = await User.bulkWrite(ops, { ordered: false });
    const updated = result.modifiedCount || result.nModified || 0;

    res.status(200).json({
      success: true,
      message: 'Customer stats backfilled successfully',
      data: { updated },
    });
  } catch (error) {
    logger.error('Error backfilling customer stats', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to backfill customer stats',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};
