const express = require('express');
const router = express.Router();
const storeSettingsController = require('../controllers/storeSettingsController');
const { resolveStore } = require('../middleware/resolveStore');

router.get('/settings', resolveStore, storeSettingsController.getPublicSettings);

module.exports = router;
