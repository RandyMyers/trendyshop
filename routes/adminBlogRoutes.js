const express = require('express');
const router = express.Router();
const blogController = require('../controllers/blogController');
const { authenticate, hasAdminAccess } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { resolveStore } = require('../middleware/resolveStore');

router.use(authenticate);
router.use(hasAdminAccess);
router.use(requirePermission('blog'));
router.use(resolveStore);

router.get('/', blogController.getAdminPosts);
router.get('/:id', blogController.getAdminPostById);
router.post('/', blogController.createPost);
router.put('/:id', blogController.updatePost);
router.delete('/:id', blogController.deletePost);
router.put('/:id/translations/:locale', blogController.updatePostTranslation);

module.exports = router;
