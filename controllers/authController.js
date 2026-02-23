const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { logger } = require('../utils/logger');

function getClientIp(req) {
  const rawIp = req.headers['x-forwarded-for'] || req.ip || req.connection?.remoteAddress;
  return rawIp ? String(rawIp).split(',')[0].trim() : null;
}

/**
 * Register new user
 * POST /api/v1/auth/register
 */
exports.register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists',
      });
    }

    // Create user
    const lastKnownIp = getClientIp(req);
    const user = await User.create({
      email,
      password,
      firstName,
      lastName,
      phone,
      role: 'customer',
      lastKnownIp: lastKnownIp || undefined,
    });

    // Generate JWT token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

    logger.info('User registered', { userId: user._id, email });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
        token,
      },
    });
  } catch (error) {
    logger.error('Error registering user', { error: error.message });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to register user',
      error: error.message,
    });
  }
};

/**
 * Login user
 * POST /api/v1/auth/login
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    // Find user and include password
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Update last known IP (non-blocking)
    const lastKnownIp = getClientIp(req);
    if (lastKnownIp) {
      User.findByIdAndUpdate(user._id, { lastKnownIp }).catch(() => {});
    }

    // Generate JWT token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

    logger.info('User logged in', { userId: user._id, email });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          permissions: user.permissions || [],
        },
        token,
      },
    });
  } catch (error) {
    logger.error('Error logging in user', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to login',
      error: error.message,
    });
  }
};

/**
 * Get current user profile
 * GET /api/v1/auth/me
 */
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
        permissions: user.permissions || [],
        shippingAddress: user.shippingAddress,
        billingAddress: user.billingAddress,
      },
    });
  } catch (error) {
    logger.error('Error getting user profile', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get user profile',
      error: error.message,
    });
  }
};

/**
 * Update user profile
 * PUT /api/v1/auth/profile
 */
exports.updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, phone, shippingAddress, billingAddress } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Update fields
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (phone) user.phone = phone;
    if (shippingAddress) user.shippingAddress = { ...user.shippingAddress, ...shippingAddress };
    if (billingAddress) user.billingAddress = { ...user.billingAddress, ...billingAddress };

    await user.save();

    logger.info('User profile updated', { userId: user._id });

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        shippingAddress: user.shippingAddress,
        billingAddress: user.billingAddress,
      },
    });
  } catch (error) {
    logger.error('Error updating user profile', { error: error.message });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to update profile',
      error: error.message,
    });
  }
};

/**
 * Change password
 * PUT /api/v1/auth/change-password
 */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters',
      });
    }

    const user = await User.findById(req.user.id).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Verify current password
    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect',
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    logger.info('User password changed', { userId: user._id });

    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    logger.error('Error changing password', { error: error.message });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to change password',
      error: error.message,
    });
  }
};




