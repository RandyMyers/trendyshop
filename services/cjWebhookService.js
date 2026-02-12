const cjOrderService = require('./cjOrderService');
const Order = require('../models/Order');
const CjOrderMapping = require('../models/CjOrderMapping');
const { logger } = require('../utils/logger');

class CjWebhookService {
  /**
   * Handle order status webhook from CJ
   */
  async handleOrderStatusWebhook(webhookData) {
    try {
      const {
        orderId,
        orderNumber,
        status,
        trackingNumber,
        trackingUrl,
        logisticName,
      } = webhookData;

      logger.info('Processing CJ order status webhook', {
        orderId,
        orderNumber,
        status,
      });

      // Find mapping by CJ order ID
      const mapping = await CjOrderMapping.findOne({
        $or: [{ cjOrderId: orderId }, { cjOrderNumber: orderNumber }],
      });

      if (!mapping) {
        logger.warn('CJ order mapping not found for webhook', {
          orderId,
          orderNumber,
        });
        return { success: false, message: 'Order mapping not found' };
      }

      // Update mapping
      mapping.cjStatus = status || mapping.cjStatus;
      if (trackingNumber) mapping.cjTrackingNumber = trackingNumber;
      mapping.cjResponse = webhookData;
      await mapping.save();

      // Update order
      const order = await Order.findById(mapping.orderId);
      if (order) {
        order.cjStatus = status;
        if (trackingNumber) order.cjTrackingNumber = trackingNumber;

        // Map CJ status to our order status
        const statusMap = {
          'Pending': 'pending',
          'Processing': 'processing',
          'Shipped': 'shipped',
          'Delivered': 'delivered',
          'Cancelled': 'cancelled',
        };

        if (statusMap[status]) {
          order.status = statusMap[status];
        }

        await order.save();

        logger.info('Order updated from CJ webhook', {
          orderId: order._id,
          cjOrderId: orderId,
          status: order.status,
        });
      }

      return {
        success: true,
        orderId: order?._id,
        status: order?.status,
      };
    } catch (error) {
      logger.error('Error handling CJ order status webhook', {
        error: error.message,
        webhookData,
      });
      throw error;
    }
  }

  /**
   * Handle inventory/stock update webhook
   * Supports both old format (productId, stock, variantId) and STOCK message format
   */
  async handleInventoryWebhook(webhookData) {
    try {
      const { type, messageType, params, productId, stock, variantId } = webhookData;

      logger.info('Processing CJ inventory webhook', { type, messageType, productId, stock, variantId });

      // Handle STOCK message format
      if (type === 'STOCK' && params) {
        // params is an object where keys are variant IDs and values are arrays of stock info
        const Product = require('../models/Product');
        let updatedCount = 0;

        for (const [vid, stockInfoArray] of Object.entries(params)) {
          if (!Array.isArray(stockInfoArray) || stockInfoArray.length === 0) continue;

          // Sum across warehouses: prefer totalInventoryNum (CJ recommended), fallback to storageNum (deprecated)
          const totalStock = stockInfoArray.reduce(
            (sum, info) => sum + (info.totalInventoryNum ?? info.storageNum ?? 0),
            0
          );

          // Find product by variant vid
          const product = await Product.findOne({ 'variants.variantId': vid });
          if (product) {
            const variant = product.variants.find((v) => v.variantId === vid);
            if (variant) {
              variant.stock = totalStock;
              // Update product-level stock as sum of variant stocks for low-stock checks
              if (product.variants && product.variants.length > 0) {
                product.stock = product.variants.reduce((s, v) => s + (v.stock ?? 0), 0);
              } else {
                product.stock = totalStock;
              }
              product.lastSyncedAt = new Date();
              await product.save();
              updatedCount++;
              logger.info('Product variant stock updated from STOCK webhook', {
                productId: product._id,
                vid,
                totalStock,
              });
            }
          }
        }

        return { success: true, updatedCount };
      }

      // Handle old format (productId, stock, variantId)
      if (productId) {
        const Product = require('../models/Product');
        const product = await Product.findOne({ cjProductId: productId });

        if (product) {
          if (variantId) {
            const variant = product.variants.find((v) => v.variantId === variantId);
            if (variant) {
              variant.stock = stock;
            }
          } else {
            product.stock = stock;
            product.isAvailable = stock > 0;
          }

          product.lastSyncedAt = new Date();
          await product.save();

          logger.info('Product inventory updated from CJ webhook', {
            productId: product._id,
            cjProductId: productId,
            stock,
          });
        }
      }

      return { success: true };
    } catch (error) {
      logger.error('Error handling CJ inventory webhook', {
        error: error.message,
        webhookData,
      });
      throw error;
    }
  }

  /**
   * Verify webhook signature (if CJ provides one)
   */
  verifyWebhookSignature(payload, signature) {
    // CJ API may provide webhook signature verification
    // This needs to be implemented based on CJ's webhook documentation
    // For now, return true (trust webhook)
    return true;
  }

  /**
   * Handle PRODUCT / VARIANT webhook events
   * Currently: acknowledge + log. (Future: update local CJ product cache)
   */
  async handleProductWebhook(webhookData) {
    const { type, messageType, params } = webhookData || {};
    logger.info('Processing CJ product webhook', { type, messageType, pid: params?.pid, vid: params?.vid });
    return { success: true };
  }

  /**
   * Handle LOGISTICS webhook events
   * Currently: try to reuse order status handler if payload matches; else acknowledge + log.
   */
  async handleLogisticsWebhook(webhookData) {
    const { type, messageType } = webhookData || {};
    logger.info('Processing CJ logistics webhook', { type, messageType });
    // Some logistics payloads may include tracking/order fields similar to order-status
    if (webhookData?.orderId || webhookData?.orderNumber) {
      return await this.handleOrderStatusWebhook(webhookData);
    }
    return { success: true };
  }
}

module.exports = new CjWebhookService();




