const express = require('express');
const router = express.Router();
const blogController = require('../controllers/blogController');
const { resolveStore } = require('../middleware/resolveStore');

router.get('/', resolveStore, blogController.getPublicPosts);
router.get('/:slug', resolveStore, blogController.getPublicPostBySlug);

module.exports = router;
