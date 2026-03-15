/**
 * PastQuest - Admin Routes
 */

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, requireAdmin, requireSuperAdmin } = require('../middleware/auth');

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

// Dashboard
router.get('/dashboard', adminController.getDashboardStats);
router.get('/activity-logs', adminController.getActivityLogs);

// Analytics
router.get('/analytics/revenue', adminController.getRevenueAnalytics);
router.get('/analytics/users', adminController.getUserAnalytics);
router.get('/analytics/content', adminController.getContentAnalytics);

// Super admin only
router.put('/settings', requireSuperAdmin, adminController.updateSettings);

// Maintenance tasks
router.post('/expire-subscriptions', requireSuperAdmin, adminController.expireSubscriptions);

module.exports = router;
