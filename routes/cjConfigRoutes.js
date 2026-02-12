const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const cjConfigController = require('../controllers/cjConfigController');
const { authenticate, isAdmin } = require('../middleware/auth');
const { validate } = require('../middleware/validation');

// All routes require admin authentication
router.use(authenticate);
router.use(isAdmin);

// CJ Configuration Routes
router.get('/token-status', cjConfigController.getTokenStatus);
router.get('/', cjConfigController.getConfig);
router.get('/webhook', cjConfigController.getWebhookConfig);
router.get('/warehouses', cjConfigController.getWarehouses);
router.post(
  '/webhook',
  [
    body('callbackUrl')
      .notEmpty()
      .withMessage('callbackUrl is required')
      .isString()
      .withMessage('callbackUrl must be a string')
      .trim(),
    body('product').optional().isBoolean().withMessage('product must be boolean'),
    body('stock').optional().isBoolean().withMessage('stock must be boolean'),
    body('order').optional().isBoolean().withMessage('order must be boolean'),
    body('logistics').optional().isBoolean().withMessage('logistics must be boolean'),
    validate,
  ],
  cjConfigController.setWebhookConfig
);
router.get('/warehouses', cjConfigController.getWarehouses);
router.get('/warehouses/:id', cjConfigController.getWarehouseDetail);
router.put(
  '/api-key',
  [
    body('apiKey')
      .notEmpty()
      .withMessage('API key is required')
      .isString()
      .withMessage('API key must be a string')
      .trim()
      .isLength({ min: 1 })
      .withMessage('API key cannot be empty'),
    validate,
  ],
  cjConfigController.updateApiKey
);
router.post('/refresh-token', cjConfigController.refreshToken);
router.post('/test-connection', cjConfigController.testConnection);
router.delete('/token', cjConfigController.deleteToken);

module.exports = router;

