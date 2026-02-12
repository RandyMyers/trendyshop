const express = require('express');
const router = express.Router();
const blogController = require('../controllers/blogController');
const { authenticate, isAdmin } = require('../middleware/auth');
const { resolveStore } = require('../middleware/resolveStore');

router.use(authenticate);
router.use(isAdmin);
router.use(resolveStore);

router.get('/', blogController.getAdminPosts);
router.get('/:id', blogController.getAdminPostById);
router.post('/', blogController.createPost);
router.put('/:id', blogController.updatePost);
router.delete('/:id', blogController.deletePost);
router.put('/:id/translations/:locale', blogController.updatePostTranslation);

module.exports = router;
