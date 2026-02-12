const express = require('express');
const router = express.Router();
const faqController = require('../controllers/faqController');
const { authenticate, isAdmin } = require('../middleware/auth');
const { resolveStore } = require('../middleware/resolveStore');

router.use(authenticate);
router.use(isAdmin);
router.use(resolveStore);

router.get('/', faqController.getAdminFaqs);
router.post('/', faqController.createFaq);
router.put('/:id', faqController.updateFaq);
router.delete('/:id', faqController.deleteFaq);

module.exports = router;
