const PaymentMethod = require('../models/PaymentMethod');
const flutterwaveService = require('../services/flutterwaveService');
const { getStoreFilter } = require('../middleware/resolveStore');
const { logger } = require('../utils/logger');

/**
 * Public: Get active payment methods for storefront
 * GET /api/v1/payment-methods/active
 */
exports.getActivePaymentMethods = async (req, res) => {
  try {
    const filter = getStoreFilter(req.storeId);
    const methods = await PaymentMethod.find({ ...filter, isActive: true })
      .select('name type isDefault config.bankTransfers config.currency config.title config.description')
      .sort({ isDefault: -1, createdAt: 1 })
      .lean();
    res.status(200).json({ success: true, data: methods });
  } catch (error) {
    logger.error('Error getting active payment methods', { error: error.message });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to get payment methods',
      error: error.message,
    });
  }
};

/**
 * Create or update payment method
 * POST /api/v1/payment-methods
 * PUT /api/v1/payment-methods/:id
 */
exports.createOrUpdatePaymentMethod = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, isActive, isDefault, config } = req.body;

    // Validate input
    if (!name || !type || !config) {
      return res.status(400).json({
        success: false,
        message: 'Name, type, and config are required',
      });
    }

    if (type === 'bank_transfer') {
      const bankTransfers = config.bankTransfers || [];
      if (!Array.isArray(bankTransfers) || bankTransfers.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one bank transfer (currency) config is required',
        });
      }
      delete config.secretKey; // Not used for bank transfer
    }

    const shouldEncryptSecret = (t) => t === 'flutterwave' || t === 'squad';

    let paymentMethod;

    if (id) {
      // Update existing
      // Include secretKey so we don't accidentally wipe it on update
      paymentMethod = await PaymentMethod.findById(id).select('+config.secretKey');
      if (!paymentMethod) {
        return res.status(404).json({
          success: false,
          message: 'Payment method not found',
        });
      }

      // Preserve existing secret key if not provided in update payload (skip for bank_transfer)
      if (type !== 'bank_transfer' && !config.secretKey && paymentMethod.config?.secretKey) {
        config.secretKey = paymentMethod.config.secretKey;
      }

      // Encrypt secret key for supported methods (avoid double-encrypt)
      if (shouldEncryptSecret(type) && config.secretKey && !String(config.secretKey).includes(':')) {
        config.secretKey = flutterwaveService.encryptSecretKey(config.secretKey);
      }

      paymentMethod.name = name;
      paymentMethod.type = type;
      paymentMethod.isActive = isActive !== undefined ? isActive : paymentMethod.isActive;
      paymentMethod.isDefault = isDefault !== undefined ? isDefault : paymentMethod.isDefault;
      paymentMethod.config = { ...paymentMethod.config, ...config };

      await paymentMethod.save();
    } else {
      // Encrypt secret key for supported methods (avoid double-encrypt)
      if (shouldEncryptSecret(type) && config.secretKey && !String(config.secretKey).includes(':')) {
        config.secretKey = flutterwaveService.encryptSecretKey(config.secretKey);
      }
      // Create new
      paymentMethod = await PaymentMethod.create({
        name,
        type,
        isActive: isActive !== undefined ? isActive : false,
        isDefault: isDefault !== undefined ? isDefault : false,
        config,
      });
    }

    logger.info('Payment method saved', { paymentMethodId: paymentMethod._id, type });

    // Return payment method without secret key
    const paymentMethodResponse = paymentMethod.toObject();
    delete paymentMethodResponse.config.secretKey;

    res.status(id ? 200 : 201).json({
      success: true,
      message: id ? 'Payment method updated successfully' : 'Payment method created successfully',
      data: paymentMethodResponse,
    });
  } catch (error) {
    logger.error('Error saving payment method', { error: error.message, stack: error.stack });
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Payment method with this name or type already exists',
      });
    }

    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to save payment method',
      error: error.message,
    });
  }
};

/**
 * Get all payment methods
 * GET /api/v1/payment-methods
 */
exports.getPaymentMethods = async (req, res) => {
  try {
    const { isActive } = req.query;
    const query = {};

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const paymentMethods = await PaymentMethod.find(query)
      .select('-config.secretKey') // Exclude secret key
      .sort({ isDefault: -1, createdAt: -1 });

    res.status(200).json({
      success: true,
      data: paymentMethods,
    });
  } catch (error) {
    logger.error('Error getting payment methods', { error: error.message });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to get payment methods',
      error: error.message,
    });
  }
};

/**
 * Get payment method by ID
 * GET /api/v1/payment-methods/:id
 */
exports.getPaymentMethod = async (req, res) => {
  try {
    const { id } = req.params;

    const paymentMethod = await PaymentMethod.findById(id)
      .select('-config.secretKey'); // Exclude secret key

    if (!paymentMethod) {
      return res.status(404).json({
        success: false,
        message: 'Payment method not found',
      });
    }

    res.status(200).json({
      success: true,
      data: paymentMethod,
    });
  } catch (error) {
    logger.error('Error getting payment method', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get payment method',
      error: error.message,
    });
  }
};

/**
 * Delete payment method
 * DELETE /api/v1/payment-methods/:id
 */
exports.deletePaymentMethod = async (req, res) => {
  try {
    const { id } = req.params;

    const paymentMethod = await PaymentMethod.findById(id);
    if (!paymentMethod) {
      return res.status(404).json({
        success: false,
        message: 'Payment method not found',
      });
    }

    // Check if it's in use (optional - you might want to prevent deletion if used)
    // const paymentCount = await Payment.countDocuments({ paymentMethodId: id });
    // if (paymentCount > 0) {
    //   return res.status(400).json({
    //     success: false,
    //     message: 'Cannot delete payment method that has been used',
    //   });
    // }

    await PaymentMethod.findByIdAndDelete(id);

    logger.info('Payment method deleted', { paymentMethodId: id });

    res.status(200).json({
      success: true,
      message: 'Payment method deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting payment method', { error: error.message });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to delete payment method',
      error: error.message,
    });
  }
};

/**
 * Toggle payment method active status
 * PATCH /api/v1/payment-methods/:id/toggle-active
 */
exports.toggleActive = async (req, res) => {
  try {
    const { id } = req.params;

    const paymentMethod = await PaymentMethod.findById(id);
    if (!paymentMethod) {
      return res.status(404).json({
        success: false,
        message: 'Payment method not found',
      });
    }

    paymentMethod.isActive = !paymentMethod.isActive;
    await paymentMethod.save();

    logger.info('Payment method active status toggled', { paymentMethodId: id, isActive: paymentMethod.isActive });

    const paymentMethodResponse = paymentMethod.toObject();
    delete paymentMethodResponse.config.secretKey;

    res.status(200).json({
      success: true,
      message: `Payment method ${paymentMethod.isActive ? 'activated' : 'deactivated'}`,
      data: paymentMethodResponse,
    });
  } catch (error) {
    logger.error('Error toggling payment method active status', { error: error.message });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to toggle payment method status',
      error: error.message,
    });
  }
};




