const cjAuthService = require('./cjAuthService');
const Order = require('../models/Order');
const CjOrderMapping = require('../models/CjOrderMapping');
const { logger } = require('../utils/logger');

class CjOrderService {
  /**
   * Create order in CJ Dropshipping
   */
  async createOrder(orderData) {
    try {
      const {
        shippingInfo,
        products,
        paymentMethod = 'Balance',
        remark = '',
      } = orderData;

      // Map products to CJ format
      const cjProducts = products.map((product) => ({
        pid: product.cjProductId || product.productId,
        variantId: product.variantId || '',
        quantity: product.quantity,
        sellingPrice: product.price,
      }));

      // Map shipping info to CJ format
      const cjShippingInfo = {
        countryCode: shippingInfo.countryCode || shippingInfo.country,
        firstName: shippingInfo.firstName,
        lastName: shippingInfo.lastName,
        state: shippingInfo.state || '',
        city: shippingInfo.city,
        address1: shippingInfo.address || shippingInfo.street,
        address2: shippingInfo.address2 || '',
        zipCode: shippingInfo.zipCode || shippingInfo.zip,
        phone: shippingInfo.phone,
        email: shippingInfo.email,
      };

      const requestData = {
        shippingInfo: cjShippingInfo,
        products: cjProducts,
        paymentMethod,
        remark,
      };

      const response = await cjAuthService.makeAuthenticatedRequest(
        'POST',
        '/order/createOrder',
        requestData
      );

      const { code, result, data, message } = response;

      if (code !== 200 || !result) {
        throw new Error(message || 'Failed to create CJ order');
      }

      logger.info('CJ order created', {
        cjOrderId: data.orderId,
        cjOrderNumber: data.orderNumber,
      });

      return data;
    } catch (error) {
      logger.error('Error creating CJ order', {
        error: error.message,
        orderData,
        response: error.response?.data,
      });
      throw error;
    }
  }

  /**
   * Create order and link to our order
   */
  async createAndLinkOrder(orderId, orderData) {
    try {
      // Get our order
      const order = await Order.findById(orderId);
      if (!order) {
        throw new Error('Order not found');
      }

      // Create CJ order
      const cjOrder = await this.createOrder(orderData);

      // Update our order with CJ order info
      order.cjOrderId = cjOrder.orderId;
      order.cjOrderNumber = cjOrder.orderNumber;
      order.cjStatus = cjOrder.status || 'pending';
      await order.save();

      // Create mapping
      await CjOrderMapping.create({
        orderId: order._id,
        cjOrderId: cjOrder.orderId,
        cjOrderNumber: cjOrder.orderNumber,
        cjStatus: cjOrder.status || 'pending',
        cjResponse: cjOrder,
      });

      logger.info('Order linked to CJ order', {
        orderId: order._id,
        cjOrderId: cjOrder.orderId,
      });

      return { order, cjOrder };
    } catch (error) {
      logger.error('Error creating and linking CJ order', {
        error: error.message,
        orderId,
      });
      throw error;
    }
  }

  /**
   * Query order status from CJ
   */
  async queryOrderStatus(cjOrderId) {
    try {
      const response = await cjAuthService.makeAuthenticatedRequest(
        'POST',
        '/order/queryOrderStatus',
        {
          orderId: cjOrderId,
        }
      );

      const { code, result, data, message } = response;

      if (code !== 200 || !result) {
        throw new Error(message || 'Failed to query CJ order status');
      }

      return data;
    } catch (error) {
      logger.error('Error querying CJ order status', {
        error: error.message,
        cjOrderId,
      });
      throw error;
    }
  }

  /**
   * Query order details from CJ
   */
  async queryOrderDetails(cjOrderId) {
    try {
      const response = await cjAuthService.makeAuthenticatedRequest(
        'POST',
        '/order/queryOrderDetail',
        {
          orderId: cjOrderId,
        }
      );

      const { code, result, data, message } = response;

      if (code !== 200 || !result) {
        throw new Error(message || 'Failed to query CJ order details');
      }

      return data;
    } catch (error) {
      logger.error('Error querying CJ order details', {
        error: error.message,
        cjOrderId,
      });
      throw error;
    }
  }

  /**
   * Sync order status from CJ
   */
  async syncOrderStatus(orderId) {
    try {
      const mapping = await CjOrderMapping.findOne({ orderId });
      if (!mapping || !mapping.cjOrderId) {
        throw new Error('Order not linked to CJ order');
      }

      const cjOrderStatus = await this.queryOrderStatus(mapping.cjOrderId);
      const cjOrderDetails = await this.queryOrderDetails(mapping.cjOrderId);

      // Update mapping
      mapping.cjStatus = cjOrderStatus.status || mapping.cjStatus;
      mapping.cjTrackingNumber = cjOrderDetails.trackingNumber || mapping.cjTrackingNumber;
      mapping.cjResponse = cjOrderDetails;
      await mapping.save();

      // Update order
      const order = await Order.findById(orderId);
      if (order) {
        order.cjStatus = mapping.cjStatus;
        order.cjTrackingNumber = mapping.cjTrackingNumber;

        // Map CJ status to our status
        const statusMap = {
          'Pending': 'pending',
          'Processing': 'processing',
          'Shipped': 'shipped',
          'Delivered': 'delivered',
          'Cancelled': 'cancelled',
        };
        if (statusMap[mapping.cjStatus]) {
          order.status = statusMap[mapping.cjStatus];
        }

        await order.save();
      }

      logger.info('Order status synced from CJ', {
        orderId,
        cjOrderId: mapping.cjOrderId,
        status: mapping.cjStatus,
      });

      return { order, mapping, cjOrderStatus, cjOrderDetails };
    } catch (error) {
      logger.error('Error syncing order status', {
        error: error.message,
        orderId,
      });
      throw error;
    }
  }

  /**
   * Cancel order in CJ
   */
  async cancelOrder(cjOrderId, reason = '') {
    try {
      const response = await cjAuthService.makeAuthenticatedRequest(
        'POST',
        '/order/cancelOrder',
        {
          orderId: cjOrderId,
          reason,
        }
      );

      const { code, result, data, message } = response;

      if (code !== 200 || !result) {
        throw new Error(message || 'Failed to cancel CJ order');
      }

      logger.info('CJ order cancelled', { cjOrderId });

      return data;
    } catch (error) {
      logger.error('Error cancelling CJ order', {
        error: error.message,
        cjOrderId,
      });
      throw error;
    }
  }
}

module.exports = new CjOrderService();




