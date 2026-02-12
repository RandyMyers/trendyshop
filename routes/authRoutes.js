const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);

// Protected routes
router.use(authenticate);
router.get('/me', authController.getMe);
router.put('/profile', authController.updateProfile);
router.put('/change-password', authController.changePassword);

module.exports = router;




