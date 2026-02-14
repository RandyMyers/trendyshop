const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const { authenticate, hasAdminAccess } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { resolveStore } = require('../middleware/resolveStore');

router.use(authenticate);
router.use(hasAdminAccess);
router.use(requirePermission('categories'));
router.use(resolveStore);

// Get all categories (with optional tree structure)
router.get('/', categoryController.getCategories);

// Get single category
router.get('/:id', categoryController.getCategory);

// Create category
router.post('/', categoryController.createCategory);

// Update category
router.put('/:id', categoryController.updateCategory);

// Update category translation
router.put('/:id/translations/:locale', categoryController.updateCategoryTranslation);

// Delete category
router.delete('/:id', categoryController.deleteCategory);

module.exports = router;

