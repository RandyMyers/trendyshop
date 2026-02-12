const cron = require('node-cron');
const cjAuthService = require('../services/cjAuthService');
const cjProductService = require('../services/cjProductService');
const cjOrderService = require('../services/cjOrderService');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { logger } = require('../utils/logger');
const cjConfig = require('../config/cj-dropshipping');

/**
 * Check if CJ API key is configured
 */
function hasCjApiKey() {
  return !!(cjConfig.apiKey || process.env.CJ_API_KEY);
}

/**
 * Initialize all background jobs
 */
function initializeJobs() {
  logger.info('Initializing background jobs...');

  // Check if CJ API key is configured
  if (!hasCjApiKey()) {
    logger.warn('CJ API key not configured. CJ-related background jobs will be skipped.');
    logger.info('To enable CJ jobs, configure CJ_API_KEY in environment or via admin panel.');
    return;
  }

  // Job 1: Refresh CJ Token (runs every 6 hours)
  cron.schedule('0 */6 * * *', async () => {
    try {
      // Double-check API key before running
      if (!hasCjApiKey()) {
        logger.warn('Skipping CJ token refresh: API key not configured');
        return;
      }

      logger.info('Running scheduled job: Refresh CJ Token');
      await cjAuthService.getAccessToken(); // This will refresh if needed
      logger.info('CJ Token refresh job completed successfully');
    } catch (error) {
      // Only log error if it's not about missing API key
      if (!error.message.includes('API key is not configured')) {
        logger.error('CJ Token refresh job failed', { error: error.message });
      } else {
        logger.warn('CJ Token refresh job skipped: API key not configured');
      }
    }
  });

  // Job 2: Sync Product Inventory (runs every 6 hours)
  cron.schedule('30 */6 * * *', async () => {
    try {
      // Check API key before running
      if (!hasCjApiKey()) {
        logger.warn('Skipping product inventory sync: API key not configured');
        return;
      }

      logger.info('Running scheduled job: Sync Product Inventory');
      
      // Get all products that are in store and need sync
      const products = await Product.find({ isInStore: true })
        .limit(100) // Sync 100 products at a time to avoid overload
        .select('cjProductId');

      let synced = 0;
      let failed = 0;

      for (const product of products) {
        try {
          await cjProductService.syncProduct(product.cjProductId);
          synced++;
        } catch (error) {
          logger.warn(`Failed to sync product ${product.cjProductId}`, {
            error: error.message,
          });
          failed++;
        }
      }

      logger.info('Product inventory sync job completed', {
        synced,
        failed,
        total: products.length,
      });
    } catch (error) {
      logger.error('Product inventory sync job failed', { error: error.message });
    }
  });

  // Job 3: Sync Order Status (runs every hour)
  cron.schedule('0 * * * *', async () => {
    try {
      // Check API key before running
      if (!hasCjApiKey()) {
        logger.warn('Skipping order status sync: API key not configured');
        return;
      }

      logger.info('Running scheduled job: Sync Order Status');
      
      // Get orders that are pending or processing
      const orders = await Order.find({
        status: { $in: ['pending', 'processing', 'confirmed'] },
      })
        .limit(50) // Sync 50 orders at a time
        .populate('cjOrderMapping');

      let synced = 0;
      let failed = 0;

      for (const order of orders) {
        try {
          if (order.cjOrderMapping && order.cjOrderMapping.cjOrderId) {
            const cjOrder = await cjOrderService.getOrderDetails(
              order.cjOrderMapping.cjOrderId
            );

            if (cjOrder) {
              // Update order status based on CJ order status
              const statusMap = {
                'PENDING': 'pending',
                'PROCESSING': 'processing',
                'SHIPPED': 'shipped',
                'DELIVERED': 'delivered',
                'CANCELLED': 'cancelled',
              };

              const newStatus = statusMap[cjOrder.status] || order.status;

              if (newStatus !== order.status) {
                order.status = newStatus;
                await order.save();
                logger.info(`Order ${order._id} status updated to ${newStatus}`);
              }
            }
          }
          synced++;
        } catch (error) {
          logger.warn(`Failed to sync order ${order._id}`, {
            error: error.message,
          });
          failed++;
        }
      }

      logger.info('Order status sync job completed', {
        synced,
        failed,
        total: orders.length,
      });
    } catch (error) {
      logger.error('Order status sync job failed', { error: error.message });
    }
  });

  // Job 4: Check Token Status (runs daily at midnight)
  cron.schedule('0 0 * * *', async () => {
    try {
      // Check API key before running
      if (!hasCjApiKey()) {
        logger.warn('Skipping token status check: API key not configured');
        return;
      }

      logger.info('Running scheduled job: Check Token Status');
      const token = await cjAuthService.getAccessToken();
      logger.info('Token status check completed', {
        tokenValid: !!token,
      });
    } catch (error) {
      // Only log error if it's not about missing API key
      if (!error.message.includes('API key is not configured')) {
        logger.error('Token status check failed', { error: error.message });
      } else {
        logger.warn('Token status check skipped: API key not configured');
      }
    }
  });

  logger.info('All background jobs initialized successfully');
}

/**
 * Stop all jobs (useful for testing or graceful shutdown)
 */
function stopJobs() {
  logger.info('Stopping all background jobs...');
  // Note: node-cron doesn't provide a direct way to stop all jobs
  // In production, you might want to track job IDs and cancel them
}

module.exports = {
  initializeJobs,
  stopJobs,
};

