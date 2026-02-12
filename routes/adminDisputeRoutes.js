const express = require('express');
const router = express.Router();
const disputeController = require('../controllers/disputeController');
const { authenticate, isAdmin } = require('../middleware/auth');
const { resolveStore } = require('../middleware/resolveStore');

router.use(authenticate);
router.use(isAdmin);
router.use(resolveStore);

router.get('/', disputeController.getAdminDisputes);
router.post('/', disputeController.createDispute);

module.exports = router;
