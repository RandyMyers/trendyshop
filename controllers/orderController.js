const Order = require('../models/Order');
const Coupon = require('../models/Coupon');
const Payment = require('../models/Payment');
const User = require('../models/User');
const cjOrderService = require('../services/cjOrderService');
const { getStoreFilter } = require('../middleware/resolveStore');
const { logger } = require('../utils/logger');

/**
 * Create order
 * POST /api/v1/orders
 */
exports.createOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      items,
      shippingAddress,
      billingAddress,
      shipping,
      shippingCost = 0,
      tax = 0,
      paymentMethodId,
      payment,
      couponCode,
      discountAmount = 0,
    } = req.body;

    // Support both shipping/billing and flat shipping object (client may send shipping with address fields)
    const shipAddr = shippingAddress || (shipping && {
      street: shipping.address || shipping.street || '',
      address2: shipping.apartment || shipping.address2 || '',
      city: shipping.city,
      state: shipping.state,
      zipCode: shipping.zipCode,
      country: shipping.country,
      phone: shipping.phone,
      firstName: shipping.firstName,
      lastName: shipping.lastName,
    });
    const billAddr = billingAddress || shipAddr;

    // Validate input
    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Order items are required',
      });
    }

    if (!shipAddr || !billAddr) {
      return res.status(400).json({
        success: false,
        message: 'Shipping and billing addresses are required',
      });
    }

    const cost = shipping?.cost ?? shippingCost;

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0);
    let total = subtotal + cost + tax;
    let finalDiscount = 0;
    let finalCouponCode = null;

    if (couponCode && discountAmount > 0) {
      const couponFilter = getStoreFilter(req.storeId);
      const coupon = await Coupon.findOne({ code: String(couponCode).trim().toUpperCase(), ...couponFilter });
      if (coupon && coupon.isValid(subtotal)) {
        const calculatedDiscount = coupon.calculateDiscount(subtotal);
        if (calculatedDiscount > 0) {
          finalDiscount = Math.min(calculatedDiscount, discountAmount);
          finalCouponCode = coupon.code;
          total = Math.max(0, total - finalDiscount);
          await Coupon.findByIdAndUpdate(coupon._id, { $inc: { usedCount: 1 } });
        }
      }
    }

    // Generate order number
    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;

    // Capture IP (x-forwarded-for if behind proxy, else req.ip)
    const rawIp = req.headers['x-forwarded-for'] || req.ip || req.connection?.remoteAddress;
    const customerIp = rawIp ? String(rawIp).split(',')[0].trim() : null;
    const userAgent = req.headers['user-agent'] || null;

    // Map items to order item schema (productId, productName, price, quantity, subtotal)
    const orderItems = items.map((item) => ({
      productId: String(item.productId || item.product?.id || item.product?._id || ''),
      productName: item.name || item.product?.name || item.productName || 'Product',
      productImage: item.product?.images?.[0] || item.productImage,
      price: item.price || 0,
      quantity: item.quantity || 1,
      subtotal: (item.price || 0) * (item.quantity || 1),
    }));

    const paymentMethodType = payment?.method || req.body.paymentMethodType || null;

    // Create order (storeId from resolveStore - host-based for storefront)
    const order = await Order.create({
      ...(req.storeId && { storeId: req.storeId }),
      orderNumber,
      userId,
      items: orderItems,
      subtotal,
      shippingCost: cost,
      tax,
      couponCode: finalCouponCode,
      discountAmount: finalDiscount,
      total,
      shippingAddress: shipAddr,
      billingAddress: billAddr,
      status: 'pending',
      paymentStatus: 'pending',
      ...(paymentMethodType && { paymentMethodType }),
      customerIp,
      userAgent,
    });

    // Update user's lastKnownIp (non-blocking)
    if (customerIp) {
      User.findByIdAndUpdate(userId, { lastKnownIp: customerIp }, { new: true }).catch(() => {});
    }

    logger.info('Order created', { orderId: order._id, orderNumber, userId });

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: order,
    });
  } catch (error) {
    logger.error('Error creating order', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.message,
    });
  }
};

/**
 * Get all orders for user
 * GET /api/v1/orders
 */
exports.getOrders = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { status } = req.query;
    const orderFilter = getStoreFilter(req.storeId);

    const query = { userId, ...orderFilter };
    if (status) {
      query.status = status;
    }

    const orders = await Order.find(query)
      .populate('paymentId', 'status amount currency')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Order.countDocuments(query);

    res.status(200).json({
      success: true,
      data: orders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error('Error getting orders', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get orders',
      error: error.message,
    });
  }
};

/**
 * Get order by ID
 * GET /api/v1/orders/:id
 */
exports.getOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const orderFilter = getStoreFilter(req.storeId);

    const order = await Order.findOne({ _id: id, userId, ...orderFilter })
      .populate('paymentId', 'status amount currency txRef flwRef');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    logger.error('Error getting order', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get order',
      error: error.message,
    });
  }
};

/**
 * Create CJ order (called after payment success)
 * POST /api/v1/orders/:id/create-cj-order
 */
exports.createCjOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const order = await Order.findOne({ _id: id, userId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    // Check if order is already linked to CJ
    if (order.cjOrderId) {
      return res.status(400).json({
        success: false,
        message: 'Order is already linked to CJ order',
      });
    }

    // Check if payment is completed
    if (order.paymentStatus !== 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Order payment must be completed before creating CJ order',
      });
    }

    // Map order data to CJ format
    const cjOrderData = {
      shippingInfo: {
        countryCode: order.shippingAddress.country,
        firstName: order.shippingAddress.firstName || '',
        lastName: order.shippingAddress.lastName || '',
        state: order.shippingAddress.state || '',
        city: order.shippingAddress.city,
        address1: order.shippingAddress.street,
        address2: order.shippingAddress.address2 || '',
        zipCode: order.shippingAddress.zipCode,
        phone: order.shippingAddress.phone,
        email: req.user.email,
      },
      products: order.items.map((item) => ({
        cjProductId: item.productId,
        variantId: item.variantId || '',
        quantity: item.quantity,
        price: item.price,
      })),
      paymentMethod: 'Balance',
      remark: `Order ${order.orderNumber}`,
    };

    // Create CJ order and link
    const result = await cjOrderService.createAndLinkOrder(order._id, cjOrderData);

    logger.info('CJ order created and linked', {
      orderId: order._id,
      cjOrderId: result.cjOrder.orderId,
    });

    res.status(200).json({
      success: true,
      message: 'CJ order created successfully',
      data: {
        order: result.order,
        cjOrder: result.cjOrder,
      },
    });
  } catch (error) {
    logger.error('Error creating CJ order', { error: error.message, orderId: req.params.id });
    res.status(500).json({
      success: false,
      message: 'Failed to create CJ order',
      error: error.message,
    });
  }
};

/**
 * Sync order status from CJ
 * POST /api/v1/orders/:id/sync-status
 */
exports.syncOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const order = await Order.findOne({ _id: id, userId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    if (!order.cjOrderId) {
      return res.status(400).json({
        success: false,
        message: 'Order is not linked to CJ order',
      });
    }

    const result = await cjOrderService.syncOrderStatus(order._id);

    res.status(200).json({
      success: true,
      message: 'Order status synced successfully',
      data: {
        order: result.order,
        cjStatus: result.cjOrderStatus,
      },
    });
  } catch (error) {
    logger.error('Error syncing order status', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to sync order status',
      error: error.message,
    });
  }
};

/**
 * Cancel order
 * POST /api/v1/orders/:id/cancel
 */
exports.cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';
    const { reason } = req.body;

    const order = await Order.findOne(isAdmin ? { _id: id } : { _id: id, userId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    // Check if order can be cancelled
    if (order.status === 'shipped' || order.status === 'delivered') {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel order that is already shipped or delivered',
      });
    }

    // Cancel in CJ if linked
    if (order.cjOrderId) {
      try {
        await cjOrderService.cancelOrder(order.cjOrderId, reason || 'Customer cancellation');
      } catch (error) {
        logger.warn('Failed to cancel CJ order', { error: error.message, cjOrderId: order.cjOrderId });
      }
    }

    // Update order status
    order.status = 'cancelled';
    await order.save();

    logger.info('Order cancelled', { orderId: order._id, userId: isAdmin ? order.userId : userId, byAdmin: isAdmin });

    res.status(200).json({
      success: true,
      message: 'Order cancelled successfully',
      data: order,
    });
  } catch (error) {
    logger.error('Error cancelling order', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to cancel order',
      error: error.message,
    });
  }
};

/**
 * Admin: Get all orders (no userId filter)
 * GET /api/v1/admin/orders
 */
exports.getAdminOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { status, paymentStatus, dateFrom, dateTo, search } = req.query;

    const orderFilter = getStoreFilter(req.storeId);
    const query = { ...orderFilter };
    if (status) query.status = status;
    if (paymentStatus) query.paymentStatus = paymentStatus;

    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    if (search && search.trim()) {
      const term = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(term, 'i');
      const orderNumMatch = { orderNumber: regex };
      const userIds = await User.find({
        $or: [
          { email: regex },
          { firstName: regex },
          { lastName: regex },
        ],
      })
        .select('_id')
        .lean();
      const ids = userIds.map((u) => u._id);
      if (ids.length > 0) {
        query.$or = [orderNumMatch, { userId: { $in: ids } }];
      } else {
        query.orderNumber = regex;
      }
    }

    const orders = await Order.find(query)
      .populate('userId', 'firstName lastName email')
      .populate('paymentId', 'status amount currency txRef')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Order.countDocuments(query);

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
    logger.error('Error getting admin orders', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get orders',
      error: error.message,
    });
  }
};

/**
 * Admin: Get single order by ID (no userId check)
 * GET /api/v1/admin/orders/:id
 */
exports.getAdminOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const orderFilter = getStoreFilter(req.storeId);

    const order = await Order.findOne({ _id: id, ...orderFilter })
      .populate('userId', 'firstName lastName email phone')
      .populate('paymentId', 'status amount currency txRef flwRef createdAt');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    logger.error('Error getting admin order', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to get order',
      error: error.message,
    });
  }
};

/**
 * Admin: Mark order as paid (for bank transfer / manual payment confirmation)
 * POST /api/v1/admin/orders/:id/mark-paid
 */
exports.markOrderAsPaid = async (req, res) => {
  try {
    const { id } = req.params;
    const orderFilter = getStoreFilter(req.storeId);

    const order = await Order.findOne({ _id: id, ...orderFilter });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    if (order.paymentStatus === 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Order is already marked as paid',
      });
    }

    order.paymentStatus = 'paid';
    order.status = 'processing';
    await order.save();

    logger.info('Order marked as paid (admin)', { orderId: order._id, orderNumber: order.orderNumber });

    res.status(200).json({
      success: true,
      message: 'Order marked as paid',
      data: order,
    });
  } catch (error) {
    logger.error('Error marking order as paid', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to mark order as paid',
      error: error.message,
    });
  }
};



