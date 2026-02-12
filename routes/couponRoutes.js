const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');
const { resolveStore } = require('../middleware/resolveStore');

// Public: validate coupon (store from host for multi-store)
router.post('/validate', resolveStore, couponController.validateCoupon);

module.exports = router;
