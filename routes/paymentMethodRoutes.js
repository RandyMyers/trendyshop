const express = require('express');
const router = express.Router();
const paymentMethodController = require('../controllers/paymentMethodController');
const { authenticate, hasAdminAccess } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { resolveStore } = require('../middleware/resolveStore');

router.get('/active', resolveStore, paymentMethodController.getActivePaymentMethods);

router.use(authenticate);
router.use(hasAdminAccess);
router.use(requirePermission('payment_methods'));
router.use(resolveStore);
router.get('/', paymentMethodController.getPaymentMethods);
router.get('/:id', paymentMethodController.getPaymentMethod);
router.post('/', paymentMethodController.createOrUpdatePaymentMethod);
router.put('/:id', paymentMethodController.createOrUpdatePaymentMethod);
router.patch('/:id/toggle-active', paymentMethodController.toggleActive);
router.delete('/:id', paymentMethodController.deletePaymentMethod);

module.exports = router;




