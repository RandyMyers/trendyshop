const User = require('../models/User');
const { logger } = require('../utils/logger');

/**
 * Admin: Get all users (optionally filter by role)
 * GET /api/v1/admin/users
 */
exports.getAdminUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { role } = req.query;

    const query = {};
    if (role) query.role = role;

    const users = await User.find(query)
      .select('firstName lastName email phone role createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      data: users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    logger.error('Error getting admin users', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get users',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};
