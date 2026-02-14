const express = require('express');
const router = express.Router({ mergeParams: true }); // To access :storeId from parent route
const storeContentController = require('../controllers/storeContentController');
const { authenticate, hasAdminAccess } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

router.use(authenticate);
router.use(hasAdminAccess);
router.use(requirePermission('store_content'));

// Admin routes (nested under /admin/stores/:storeId/content)
router.get('/', storeContentController.getAllContent);
router.put('/:type', storeContentController.updateContent);
router.put('/:type/translations/:locale', storeContentController.updateTranslation);

module.exports = router;
