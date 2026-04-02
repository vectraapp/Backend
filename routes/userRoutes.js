/**
 * Vectra - User Routes
 */

const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate, requireAdmin, requireSuperAdmin } = require('../middleware/auth');

// All user routes require authentication
router.use(authenticate);

// Profile routes
router.get('/profile', userController.getProfile);
router.put('/profile', userController.updateProfile);
router.post('/onboarding', userController.completeOnboarding);
router.delete('/account', userController.deleteAccount);

// User data routes
router.get('/subscriptions', userController.getSubscriptions);
router.get('/notes', userController.getNotes);
router.post('/notes', userController.saveNote);
router.delete('/notes/:id', userController.deleteNote);
router.get('/search-history', userController.getSearchHistory);
router.delete('/search-history', userController.clearSearchHistory);

// Admin routes
router.get('/all', requireAdmin, userController.getAllUsers);
router.put('/:id/role', requireSuperAdmin, userController.updateUserRole);
router.post('/:id/suspend', requireAdmin, userController.suspendUser);
router.post('/:id/unsuspend', requireAdmin, userController.unsuspendUser);

module.exports = router;
