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
      error: error.message,
    });
  }
};

/**
 * Admin: Update user
 * PUT /api/v1/admin/users/:id
 */
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, email, phone, role } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (firstName != null) user.firstName = String(firstName).trim();
    if (lastName != null) user.lastName = String(lastName).trim();
    if (phone !== undefined) user.phone = String(phone || '').trim();
    if (role != null && ['customer', 'admin'].includes(role)) user.role = role;
    if (email != null && email.trim()) {
      const normalized = email.toLowerCase().trim();
      const existing = await User.findOne({ email: normalized, _id: { $ne: id } });
      if (existing) {
        return res.status(400).json({ success: false, message: 'Email already in use' });
      }
      user.email = normalized;
    }

    await user.save();
    const result = user.toObject();
    delete result.password;
    delete result.refreshToken;
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    logger.error('Error updating user', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: error.message,
    });
  }
};

/**
 * Admin: Delete user
 * DELETE /api/v1/admin/users/:id
 */
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user?._id?.toString();

    if (id === currentUserId) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
    }

    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({ success: true, message: 'User deleted' });
  } catch (error) {
    logger.error('Error deleting user', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to delete user',
      error: error.message,
    });
  }
};
