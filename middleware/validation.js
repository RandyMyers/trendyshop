const { body, query, param, validationResult } = require('express-validator');

/**
 * Validate request and return errors if any
 */
exports.validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Format error message from validation errors
    const errorMessages = errors.array().map(err => err.msg || err.message).join(', ');
    return res.status(400).json({
      success: false,
      message: errorMessages || 'Validation failed',
      errors: errors.array(),
    });
  }
  next();
};

/**
 * Validation rules for user registration
 */
exports.validateRegister = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  body('firstName').notEmpty().trim().withMessage('First name is required'),
  body('lastName').notEmpty().trim().withMessage('Last name is required'),
  body('phone').optional().isMobilePhone().withMessage('Valid phone number is required'),
  exports.validate,
];

/**
 * Validation rules for user login
 */
exports.validateLogin = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
  exports.validate,
];

/**
 * Validation rules for order creation
 */
exports.validateCreateOrder = [
  body('items').isArray({ min: 1 }).withMessage('At least one order item is required'),
  body('items.*.productId').notEmpty().withMessage('Product ID is required for each item'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('items.*.price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('shippingAddress.street').notEmpty().withMessage('Shipping street address is required'),
  body('shippingAddress.city').notEmpty().withMessage('Shipping city is required'),
  body('shippingAddress.state').notEmpty().withMessage('Shipping state is required'),
  body('shippingAddress.zipCode').notEmpty().withMessage('Shipping zip code is required'),
  body('shippingAddress.country').notEmpty().withMessage('Shipping country is required'),
  body('shippingAddress.phone').notEmpty().withMessage('Shipping phone is required'),
  body('billingAddress.street').notEmpty().withMessage('Billing street address is required'),
  body('billingAddress.city').notEmpty().withMessage('Billing city is required'),
  body('billingAddress.state').notEmpty().withMessage('Billing state is required'),
  body('billingAddress.zipCode').notEmpty().withMessage('Billing zip code is required'),
  body('billingAddress.country').notEmpty().withMessage('Billing country is required'),
  exports.validate,
];

/**
 * Validation rules for payment initialization
 */
exports.validateInitializePayment = [
  body('orderId').notEmpty().withMessage('Order ID is required'),
  body('customer.email').isEmail().normalizeEmail().withMessage('Valid customer email is required'),
  body('customer.name').notEmpty().withMessage('Customer name is required'),
  exports.validate,
];

/**
 * Validation rules for pagination
 */
exports.validatePagination = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  exports.validate,
];

