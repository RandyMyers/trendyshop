const express = require('express');
const router = express.Router();
const paymentMethodController = require('../controllers/paymentMethodController');
const { authenticate, isAdmin } = require('../middleware/auth');
const { resolveStore } = require('../middleware/resolveStore');

// Public: active payment methods for storefront (no auth)
router.get('/active', resolveStore, paymentMethodController.getActivePaymentMethods);

// Admin routes
router.use(authenticate);
router.use(isAdmin);
router.get('/', paymentMethodController.getPaymentMethods);
router.get('/:id', paymentMethodController.getPaymentMethod);
router.post('/', paymentMethodController.createOrUpdatePaymentMethod);
router.put('/:id', paymentMethodController.createOrUpdatePaymentMethod);
router.patch('/:id/toggle-active', paymentMethodController.toggleActive);
router.delete('/:id', paymentMethodController.deletePaymentMethod);

module.exports = router;




