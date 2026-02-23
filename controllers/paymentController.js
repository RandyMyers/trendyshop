const Payment = require('../models/Payment');
const Order = require('../models/Order');
const PaymentMethod = require('../models/PaymentMethod');
const flutterwaveService = require('../services/flutterwaveService');
const squadService = require('../services/squadService');
const { getStoreFilter } = require('../middleware/resolveStore');
const { logger } = require('../utils/logger');
const axios = require('axios');
const cloudinary = require('cloudinary').v2;

/**
 * Initialize Flutterwave payment
 * POST /api/v1/payments/flutterwave/initialize
 */
exports.initializeFlutterwavePayment = async (req, res) => {
  try {
    const { orderId, customer } = req.body;
    const userId = req.user.id;

    // Validate input
    if (!orderId || !customer) {
      return res.status(400).json({
        success: false,
        message: 'Order ID and customer information are required',
      });
    }

    // Get order
    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    // Check if order is already paid
    if (order.paymentStatus === 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Order is already paid',
      });
    }

    // Get Flutterwave payment method via service (handles decryption)
    let paymentMethod;
    try {
      paymentMethod = await flutterwaveService.getPaymentMethod();
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Flutterwave payment method is not configured',
      });
    }

    // Initialize payment
    const paymentData = {
      orderNumber: order.orderNumber,
      amount: order.total,
      currency: order.currency || 'USD',
      customer: {
        email: customer.email,
        phone: customer.phone || order.shippingAddress.phone,
        name: customer.name || `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`,
      },
      userId: userId,
    };

    const { publicKey, payload, txRef } = await flutterwaveService.initializePayment(paymentData);

    // Create payment record
    const payment = await Payment.create({
      userId,
      orderId: order._id,
      paymentMethodId: paymentMethod._id,
      paymentMethodName: paymentMethod.name,
      paymentMethodType: paymentMethod.type,
      amount: order.total,
      currency: order.currency || 'USD',
      txRef,
      status: 'pending',
    });

    // Make request to Flutterwave API (secretKey is already decrypted by service)
    const response = await axios.post(
      'https://api.flutterwave.com/v3/payments',
      payload,
      {
        headers: {
          Authorization: `Bearer ${paymentMethod.config.secretKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    logger.info('Flutterwave payment initialized', { paymentId: payment._id, txRef, orderId });

    res.status(200).json({
      success: true,
      message: 'Payment initialized successfully',
      data: {
        paymentId: payment._id,
        txRef,
        publicKey,
        paymentUrl: response.data.data.link, // Flutterwave payment URL
        orderId: order._id,
        orderNumber: order.orderNumber,
      },
    });
  } catch (error) {
    logger.error('Error initializing Flutterwave payment', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to initialize payment',
      error: error.message,
    });
  }
};

/**
 * Verify Flutterwave payment
 * POST /api/v1/payments/flutterwave/verify
 */
exports.verifyFlutterwavePayment = async (req, res) => {
  try {
    const { txRef } = req.body;

    if (!txRef) {
      return res.status(400).json({
        success: false,
        message: 'Transaction reference is required',
      });
    }

    // Find payment by txRef
    const payment = await Payment.findOne({ txRef });
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found',
      });
    }

    // Verify with Flutterwave
    const verification = await flutterwaveService.verifyPayment(txRef);

    // Update payment record
    payment.status = verification.status === 'successful' ? 'successful' : 'failed';
    payment.flwRef = verification.flwRef;
    payment.flutterwaveTransactionId = verification.transactionId;
    payment.flutterwaveResponse = verification.fullResponse;

    if (verification.status === 'successful') {
      payment.paidAt = new Date();
    } else {
      payment.failureReason = 'Payment verification failed';
    }

    await payment.save();

    // Update order payment status
    const order = await Order.findById(payment.orderId);
    if (order) {
      order.paymentStatus = payment.status === 'successful' ? 'paid' : 'failed';
      order.paymentId = payment._id;
      
      if (payment.status === 'successful') {
        order.status = 'processing';
      }
      
      await order.save();
    }

    logger.info('Flutterwave payment verified', { paymentId: payment._id, txRef, status: payment.status });

    res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      data: {
        paymentId: payment._id,
        status: payment.status,
        orderId: order?._id,
        orderNumber: order?.orderNumber,
      },
    });
  } catch (error) {
    logger.error('Error verifying Flutterwave payment', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to verify payment',
      error: error.message,
    });
  }
};

/**
 * Flutterwave payment callback (webhook)
 * POST /api/v1/payments/flutterwave/callback
 */
exports.flutterwaveCallback = async (req, res) => {
  try {
    const { tx_ref, status, flw_ref, transaction_id } = req.body;

    if (!tx_ref) {
      return res.status(400).json({
        success: false,
        message: 'Transaction reference is required',
      });
    }

    // Find payment
    const payment = await Payment.findOne({ txRef: tx_ref });
    if (!payment) {
      logger.warn('Payment not found for callback', { txRef: tx_ref });
      return res.status(404).json({
        success: false,
        message: 'Payment not found',
      });
    }

    // Verify payment with Flutterwave
    const verification = await flutterwaveService.verifyPayment(tx_ref);

    // Update payment record
    payment.status = verification.status === 'successful' ? 'successful' : 'failed';
    payment.flwRef = verification.flwRef || flw_ref;
    payment.flutterwaveTransactionId = verification.transactionId || transaction_id;
    payment.flutterwaveResponse = verification.fullResponse;

    if (verification.status === 'successful') {
      payment.paidAt = new Date();
    }

    await payment.save();

    // Update order
    const order = await Order.findById(payment.orderId);
    if (order) {
      order.paymentStatus = payment.status === 'successful' ? 'paid' : 'failed';
      order.paymentId = payment._id;
      
      if (payment.status === 'successful') {
        order.status = 'processing';
        // TODO: Create CJ order here or in a background job
      }
      
      await order.save();
    }

    logger.info('Flutterwave callback processed', { paymentId: payment._id, txRef: tx_ref, status: payment.status });

    // Return success response to Flutterwave
    res.status(200).json({
      success: true,
      message: 'Callback processed successfully',
    });
  } catch (error) {
    logger.error('Error processing Flutterwave callback', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to process callback',
      error: error.message,
    });
  }
};

/**
 * Get payment by ID
 * GET /api/v1/payments/:id
 */
exports.getPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const payment = await Payment.findOne({ _id: id, userId })
      .populate('orderId', 'orderNumber total status')
      .populate('paymentMethodId', 'name type');

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found',
      });
    }

    res.status(200).json({
      success: true,
      data: payment,
    });
  } catch (error) {
    logger.error('Error getting payment', { error: error.message });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to get payment',
      error: error.message,
    });
  }
};

/**
 * Get all payments for user
 * GET /api/v1/payments
 */
exports.getPayments = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const payments = await Payment.find({ userId })
      .populate('orderId', 'orderNumber total status')
      .populate('paymentMethodId', 'name type')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Payment.countDocuments({ userId });

    res.status(200).json({
      success: true,
      data: payments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error('Error getting payments', { error: error.message });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to get payments',
      error: error.message,
    });
  }
};

/**
 * Admin: Get all payments (no userId filter)
 * GET /api/v1/admin/payments
 */
exports.getAdminPayments = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { status } = req.query;

    const paymentFilter = getStoreFilter(req.storeId);
    const query = { ...paymentFilter };
    if (status) query.status = status;

    const payments = await Payment.find(query)
      .populate('orderId', 'orderNumber total status createdAt')
      .populate('userId', 'firstName lastName email')
      .populate('paymentMethodId', 'name type')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Payment.countDocuments(query);

    res.status(200).json({
      success: true,
      data: payments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    logger.error('Error getting admin payments', { error: error.message });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to get payments',
      error: error.message,
    });
  }
};

/**
 * Initialize Squad payment
 * POST /api/v1/payments/squad/initialize
 */
exports.initializeSquadPayment = async (req, res) => {
  try {
    const { orderId, customer } = req.body;
    const userId = req.user.id;

    if (!orderId || !customer) {
      return res.status(400).json({
        success: false,
        message: 'Order ID and customer information are required',
      });
    }

    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    if (order.paymentStatus === 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Order is already paid',
      });
    }

    let paymentMethod;
    try {
      paymentMethod = await squadService.getPaymentMethod();
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Squad payment method is not configured',
      });
    }

    const paymentData = {
      orderNumber: order.orderNumber,
      amount: order.total,
      currency: order.currency || 'NGN',
      customer: {
        email: customer.email,
        phone: customer.phone || order.shippingAddress.phone,
        name: customer.name || `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`,
      },
      userId: userId,
    };

    const { checkout_url, transaction_ref } = await squadService.initializePayment(paymentData);

    const payment = await Payment.create({
      userId,
      orderId: order._id,
      paymentMethodId: paymentMethod._id,
      paymentMethodName: paymentMethod.name,
      paymentMethodType: paymentMethod.type,
      amount: order.total,
      currency: order.currency || 'NGN',
      txRef: transaction_ref,
      status: 'pending',
    });

    logger.info('Squad payment initialized', { paymentId: payment._id, txRef: transaction_ref, orderId });

    res.status(200).json({
      success: true,
      message: 'Payment initialized successfully',
      data: {
        paymentId: payment._id,
        txRef: transaction_ref,
        checkout_url,
        orderId: order._id,
        orderNumber: order.orderNumber,
      },
    });
  } catch (error) {
    logger.error('Error initializing Squad payment', { error: error.message });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to initialize payment',
      error: error.message,
    });
  }
};

/**
 * Verify Squad payment
 * POST /api/v1/payments/squad/verify
 */
exports.verifySquadPayment = async (req, res) => {
  try {
    const { txRef } = req.body;
    const userId = req.user.id;

    if (!txRef) {
      return res.status(400).json({
        success: false,
        message: 'Transaction reference is required',
      });
    }

    const payment = await Payment.findOne({ txRef, userId });
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found',
      });
    }

    const result = await squadService.verifyPayment(txRef);

    if (result.status === 'success' || result.status === 'successful') {
      payment.status = 'successful';
      payment.paidAt = new Date();
      await payment.save();

      const order = await Order.findById(payment.orderId);
      if (order) {
        order.paymentStatus = 'paid';
        order.status = 'processing';
        await order.save();
      }

      logger.info('Squad payment verified and order updated', { paymentId: payment._id, orderId: order?._id });

      return res.status(200).json({
        success: true,
        message: 'Payment verified successfully',
        data: { payment, order },
      });
    } else {
      payment.status = 'failed';
      payment.failureReason = result.data?.gateway_response || 'Payment verification failed';
      await payment.save();

      return res.status(400).json({
        success: false,
        message: 'Payment verification failed',
        data: { payment },
      });
    }
  } catch (error) {
    logger.error('Error verifying Squad payment', { error: error.message });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to verify payment',
      error: error.message,
    });
  }
};

/**
 * Get bank transfer details for an order
 * POST /api/v1/payments/bank-transfer/details
 */
exports.getBankTransferDetails = async (req, res) => {
  try {
    const { orderId, currency } = req.body;
    const userId = req.user.id;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required',
      });
    }

    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    if (order.paymentStatus === 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Order is already paid',
      });
    }

    const storeFilter = order.storeId ? { storeId: { $in: [order.storeId, null] } } : {};
    const paymentMethod = await PaymentMethod.findOne({
      ...storeFilter,
      type: 'bank_transfer',
      isActive: true,
    }).lean();

    if (!paymentMethod || !paymentMethod.config?.bankTransfers?.length) {
      return res.status(400).json({
        success: false,
        message: 'Bank transfer payment method is not configured',
      });
    }

    const bankTransfers = paymentMethod.config.bankTransfers;
    const orderCurrency = order.currency || 'USD';
    const requestedCurrency = currency || orderCurrency;

    let bankDetails = bankTransfers.find((bt) => bt.currency === requestedCurrency);
    if (!bankDetails) {
      bankDetails = bankTransfers.find((bt) => bt.currency === orderCurrency) || bankTransfers[0];
    }

    res.status(200).json({
      success: true,
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        amount: order.total,
        currency: order.currency || 'USD',
        reference: order.orderNumber,
        bankDetails,
        instructions: bankDetails?.instructions || 'Please include the order number in your transfer reference.',
      },
    });
  } catch (error) {
    logger.error('Error getting bank transfer details', { error: error.message });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to get bank transfer details',
      error: error.message,
    });
  }
};

/**
 * Upload bank transfer receipt (screenshot/proof) for faster processing
 * POST /api/v1/payments/bank-transfer/upload-receipt
 * Uses express-fileupload + Cloudinary (already configured)
 */
exports.uploadBankTransferReceipt = async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.user.id;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required',
      });
    }

    const file = req.files?.file || req.files?.receipt;
    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'Receipt file is required',
      });
    }

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Use JPEG, PNG, GIF, WebP, or PDF.',
      });
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum is 5MB.',
      });
    }

    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    if (order.paymentStatus === 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Order is already paid',
      });
    }

    const resourceType = file.mimetype === 'application/pdf' ? 'raw' : 'image';
    const uploadResult = await cloudinary.uploader.upload(file.tempFilePath, {
      folder: 'bank-transfer-receipts',
      resource_type: resourceType,
    });

    order.bankTransferReceiptUrl = uploadResult.secure_url;
    order.bankTransferReceiptSubmittedAt = new Date();
    await order.save();

    logger.info('Bank transfer receipt uploaded', { orderId, imageUrl: uploadResult.secure_url });

    res.status(200).json({
      success: true,
      message: 'Receipt uploaded successfully. We will process your payment as soon as we verify it.',
      data: {
        imageUrl: uploadResult.secure_url,
      },
    });
  } catch (error) {
    logger.error('Error uploading bank transfer receipt', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to upload receipt',
      error: error.message,
    });
  }
};