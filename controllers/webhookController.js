const cjWebhookService = require('../services/cjWebhookService');
const { logger } = require('../utils/logger');

/**
 * Handle CJ order status webhook
 * POST /api/v1/webhooks/cj/order-status
 */
exports.handleCjOrderStatus = async (req, res) => {
  try {
    const webhookData = req.body;

    logger.info('Received CJ order status webhook', { webhookData });

    const result = await cjWebhookService.handleOrderStatusWebhook(webhookData);

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error handling CJ order status webhook', {
      error: error.message,
      webhookData: req.body,
    });

    // Return 200 to acknowledge webhook (prevent retries)
    res.status(200).json({
      success: false,
      message: 'Webhook received but processing failed',
      error: error.message,
    });
  }
};

/**
 * Handle CJ inventory webhook
 * POST /api/v1/webhooks/cj/inventory
 */
exports.handleCjInventory = async (req, res) => {
  try {
    const webhookData = req.body;

    logger.info('Received CJ inventory webhook', { webhookData });

    const result = await cjWebhookService.handleInventoryWebhook(webhookData);

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error handling CJ inventory webhook', {
      error: error.message,
      webhookData: req.body,
    });

    // Return 200 to acknowledge webhook
    res.status(200).json({
      success: false,
      message: 'Webhook received but processing failed',
      error: error.message,
    });
  }
};

/**
 * Handle CJ product webhook (PRODUCT / VARIANT)
 * POST /api/v1/webhooks/cj/product
 */
exports.handleCjProduct = async (req, res) => {
  try {
    const webhookData = req.body;

    logger.info('Received CJ product webhook', { webhookData });

    const result = await cjWebhookService.handleProductWebhook(webhookData);

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error handling CJ product webhook', {
      error: error.message,
      webhookData: req.body,
    });

    res.status(200).json({
      success: false,
      message: 'Webhook received but processing failed',
      error: error.message,
    });
  }
};

/**
 * Handle CJ logistics webhook
 * POST /api/v1/webhooks/cj/logistics
 */
exports.handleCjLogistics = async (req, res) => {
  try {
    const webhookData = req.body;

    logger.info('Received CJ logistics webhook', { webhookData });

    const result = await cjWebhookService.handleLogisticsWebhook(webhookData);

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error handling CJ logistics webhook', {
      error: error.message,
      webhookData: req.body,
    });

    res.status(200).json({
      success: false,
      message: 'Webhook received but processing failed',
      error: error.message,
    });
  }
};

/**
 * Handle Flutterwave webhook
 * POST /api/v1/webhooks/flutterwave
 */
exports.handleFlutterwave = async (req, res) => {
  try {
    const webhookData = req.body;

    logger.info('Received Flutterwave webhook', { webhookData });

    // Flutterwave webhook handling can be added here
    // For now, just acknowledge
    res.status(200).json({
      success: true,
      message: 'Webhook received',
    });
  } catch (error) {
    logger.error('Error handling Flutterwave webhook', {
      error: error.message,
      webhookData: req.body,
    });

    res.status(200).json({
      success: false,
      message: 'Webhook received but processing failed',
    });
  }
};




