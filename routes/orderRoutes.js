const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const disputeController = require('../controllers/disputeController');
const { authenticate } = require('../middleware/auth');
const { resolveStore } = require('../middleware/resolveStore');

// Resolve store from host (storefront) or X-Store-Id (admin)
router.use(resolveStore);

// All order routes require authentication
router.use(authenticate);

router.post('/', orderController.createOrder);
router.get('/', orderController.getOrders);
router.get('/:id', orderController.getOrder);
router.get('/:id/disputes', disputeController.getOrderDisputes);
router.post('/:id/disputes', disputeController.createOrderDispute);
router.post('/:id/create-cj-order', orderController.createCjOrder);
router.post('/:id/sync-status', orderController.syncOrderStatus);
router.post('/:id/cancel', orderController.cancelOrder);

module.exports = router;




