const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { authenticate, hasAdminAccess } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { resolveStore } = require('../middleware/resolveStore');

router.use(authenticate);
router.use(hasAdminAccess);
router.use(requirePermission('reviews'));
router.use(resolveStore);

router.get('/', reviewController.getAdminReviews);
router.put('/:id/status', reviewController.updateReviewStatus);

module.exports = router;
