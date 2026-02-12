const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticate } = require('../middleware/auth');

// All payment routes require authentication
router.use(authenticate);

// Flutterwave payment routes
router.post('/flutterwave/initialize', paymentController.initializeFlutterwavePayment);
router.post('/flutterwave/verify', paymentController.verifyFlutterwavePayment);
router.post('/flutterwave/callback', paymentController.flutterwaveCallback);

// Squad payment routes
router.post('/squad/initialize', paymentController.initializeSquadPayment);
router.post('/squad/verify', paymentController.verifySquadPayment);

// Bank transfer routes
router.post('/bank-transfer/details', paymentController.getBankTransferDetails);
router.post('/bank-transfer/upload-receipt', paymentController.uploadBankTransferReceipt);

// General payment routes
router.get('/', paymentController.getPayments);
router.get('/:id', paymentController.getPayment);

module.exports = router;




