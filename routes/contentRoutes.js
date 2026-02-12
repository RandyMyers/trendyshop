const express = require('express');
const router = express.Router();
const storeContentController = require('../controllers/storeContentController');
const { resolveStore } = require('../middleware/resolveStore');

// Public endpoint to get content for current store
// Uses resolveStore middleware to determine store from domain
router.get('/:type', resolveStore, storeContentController.getPublicContent);

module.exports = router;
