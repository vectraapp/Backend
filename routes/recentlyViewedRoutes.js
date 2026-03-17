/**
 * Vectra - Recently Viewed Routes
 */

const express = require('express');
const router = express.Router();
const recentlyViewedController = require('../controllers/recentlyViewedController');
const { authenticate } = require('../middleware/auth');

// All recently viewed routes require authentication
router.get('/', authenticate, recentlyViewedController.getRecentlyViewed);
router.post('/', authenticate, recentlyViewedController.addRecentlyViewed);

module.exports = router;
