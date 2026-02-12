const express = require('express');
const router = express.Router({ mergeParams: true }); // To access :storeId from parent route
const storeContentController = require('../controllers/storeContentController');
const { authenticate, isAdmin } = require('../middleware/auth');

// All admin routes require authentication
router.use(authenticate);
router.use(isAdmin);

// Admin routes (nested under /admin/stores/:storeId/content)
router.get('/', storeContentController.getAllContent);
router.put('/:type', storeContentController.updateContent);
router.put('/:type/translations/:locale', storeContentController.updateTranslation);

module.exports = router;
