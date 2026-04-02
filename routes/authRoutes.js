/**
 * Vectra - Authentication Routes
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

// Public routes
router.post('/signup', authController.signUp);
router.post('/verify-otp', authController.verifyOtp);             // Verify 6-digit OTP after signup
router.post('/signin', authController.signIn);
router.post('/google', authController.exchangeGoogleToken);       // Mobile: exchange Google ID token
router.post('/google/web', authController.signInWithGoogle);      // Web: get OAuth redirect URL
router.post('/verify/resend', authController.resendVerification); // Resend OTP code
router.post('/password/reset', authController.requestPasswordReset);

// Protected routes
router.post('/signout', authenticate, authController.signOut);
router.get('/me', authenticate, authController.getCurrentUser);
router.post('/refresh', authController.refreshSession);
router.put('/password', authenticate, authController.updatePassword);

module.exports = router;
