/**
 * PastQuest - Withdrawal Routes
 */

const express = require('express');
const router = express.Router();
const withdrawalController = require('../controllers/withdrawalController');
const { authenticate, requireContributor, requireAdmin } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Public bank info
router.get('/banks', withdrawalController.getBanks);
router.post('/verify-account', withdrawalController.verifyAccount);

// Contributor routes
router.post('/request', requireContributor, withdrawalController.requestWithdrawal);
router.get('/my-withdrawals', requireContributor, withdrawalController.getMyWithdrawals);

// Admin routes
router.get('/pending', requireAdmin, withdrawalController.getPendingWithdrawals);
router.get('/all', requireAdmin, withdrawalController.getAllWithdrawals);
router.post('/:id/process', requireAdmin, withdrawalController.processWithdrawal);
router.post('/:id/reject', requireAdmin, withdrawalController.rejectWithdrawal);

module.exports = router;
