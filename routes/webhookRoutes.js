const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// Webhook routes don't require authentication (they use signatures/secrets)
// But you can add IP whitelisting or signature verification if needed

router.post('/cj/order-status', webhookController.handleCjOrderStatus);
router.post('/cj/inventory', webhookController.handleCjInventory);
router.post('/cj/product', webhookController.handleCjProduct);
router.post('/cj/logistics', webhookController.handleCjLogistics);
router.post('/flutterwave', webhookController.handleFlutterwave);

module.exports = router;




