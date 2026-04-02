/**
 * Vectra - Payment Routes
 */

const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticate } = require('../middleware/auth');

// Webhook (no auth - verified by signature)
router.post('/webhook', express.raw({ type: 'application/json' }), paymentController.paystackWebhook);

// Protected routes
router.post('/initialize', authenticate, paymentController.initializePayment);
router.get('/verify/:reference', authenticate, paymentController.verifyPayment);
router.get('/transactions', authenticate, paymentController.getTransactions);

module.exports = router;
