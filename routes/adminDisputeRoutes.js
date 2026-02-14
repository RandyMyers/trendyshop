const express = require('express');
const router = express.Router();
const disputeController = require('../controllers/disputeController');
const { authenticate, hasAdminAccess } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { resolveStore } = require('../middleware/resolveStore');

router.use(authenticate);
router.use(hasAdminAccess);
router.use(requirePermission('disputes'));
router.use(resolveStore);

router.get('/', disputeController.getAdminDisputes);
router.post('/', disputeController.createDispute);

module.exports = router;
