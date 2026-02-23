const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const { logger } = require('../utils/logger');
const { validatePermissions } = require('../middleware/permissions');

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
      .select('firstName lastName email phone role permissions createdAt')
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
      message: error?.message || 'Failed to get users',
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
    const { firstName, lastName, email, phone, role, permissions } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (firstName != null) user.firstName = String(firstName).trim();
    if (lastName != null) user.lastName = String(lastName).trim();
    if (phone !== undefined) user.phone = String(phone || '').trim();
    if (role != null && ['customer', 'admin', 'member'].includes(role)) user.role = role;
    if (Array.isArray(permissions)) {
      user.permissions = validatePermissions(permissions, req.user.role === 'admin');
    }
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
      message: error?.message || 'Failed to update user',
      error: error.message,
    });
  }
};

/**
 * Admin: Invite user (full admin only).
 * POST /api/v1/admin/users/invite
 * Body: { email, firstName, lastName, role: 'admin'|'member', permissions?: [] }
 */
exports.inviteUser = async (req, res) => {
  try {
    const { email, firstName, lastName, role = 'member', permissions } = req.body;

    if (!email || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message: 'Email, firstName, and lastName are required',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'A user with this email already exists',
      });
    }

    const invitedRole = role === 'admin' ? 'admin' : 'member';
    let finalPermissions = [];
    if (invitedRole === 'member') {
      finalPermissions = validatePermissions(Array.isArray(permissions) ? permissions : [], false);
      if (finalPermissions.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Member must have at least one permission',
        });
      }
    }

    const tempPassword = crypto.randomBytes(12).toString('base64').replace(/[+/=]/g, '').slice(0, 12);
    const user = await User.create({
      email: normalizedEmail,
      password: tempPassword,
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      role: invitedRole,
      permissions: finalPermissions,
      invitedBy: mongoose.Types.ObjectId.isValid(req.user.id) ? req.user.id : undefined,
      invitedAt: new Date(),
    });

    const result = user.toObject();
    delete result.password;
    delete result.refreshToken;

    logger.info('User invited', { userId: user._id, email: user.email, invitedBy: req.user.id });

    res.status(201).json({
      success: true,
      message: 'User invited successfully',
      data: {
        user: result,
        tempPassword, // Display once; admin should share with invitee
      },
    });
  } catch (error) {
    logger.error('Error inviting user', { error: error.message });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to invite user',
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
    const currentUserId = req.user?.id;

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
      message: error?.message || 'Failed to delete user',
      error: error.message,
    });
  }
};
