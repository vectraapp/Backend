/**
 * Vectra - Promo Code Routes
 */

const express = require('express');
const router = express.Router();
const promoController = require('../controllers/promoController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Public route - validate promo code (used by frontend during checkout)
router.post('/validate', authenticate, promoController.validatePromoCode);

// Admin routes
router.get('/', authenticate, requireAdmin, promoController.getPromoCodes);
router.post('/', authenticate, requireAdmin, promoController.createPromoCode);
router.put('/:id', authenticate, requireAdmin, promoController.updatePromoCode);
router.delete('/:id', authenticate, requireAdmin, promoController.deletePromoCode);

module.exports = router;
