const express = require('express');
const router = express.Router();
const faqController = require('../controllers/faqController');
const { resolveStore } = require('../middleware/resolveStore');

// Public - store from host for multi-store
router.get('/', resolveStore, faqController.getPublicFaqs);

module.exports = router;
