/**
 * Vectra - Authentication Routes
 * Email/password authentication only (Google OAuth disabled for MVP)
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

// Public routes
router.post('/signup', authController.signUp);
router.post('/signin', authController.signIn);
router.post('/password/reset', authController.requestPasswordReset);

// Protected routes
router.post('/signout', authenticate, authController.signOut);
router.get('/me', authenticate, authController.getCurrentUser);
router.post('/refresh', authController.refreshSession);
router.put('/password', authenticate, authController.updatePassword);

module.exports = router;
