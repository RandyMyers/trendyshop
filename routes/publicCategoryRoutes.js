const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const { optionalAuth } = require('../middleware/auth');
const { optionalResolveStore } = require('../middleware/resolveStore');

// Public category routes - categories are global; store used only for product counts
router.get('/', optionalAuth, optionalResolveStore, categoryController.getPublicCategories);
router.get('/:id', optionalAuth, optionalResolveStore, categoryController.getPublicCategory);

module.exports = router;

