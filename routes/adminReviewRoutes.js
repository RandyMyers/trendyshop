const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { authenticate, isAdmin } = require('../middleware/auth');
const { resolveStore } = require('../middleware/resolveStore');

router.use(authenticate);
router.use(isAdmin);
router.use(resolveStore);

router.get('/', reviewController.getAdminReviews);
router.put('/:id/status', reviewController.updateReviewStatus);

module.exports = router;
