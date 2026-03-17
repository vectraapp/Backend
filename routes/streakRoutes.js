/**
 * Vectra - Study Streak Routes
 */

const express = require('express');
const router = express.Router();
const streakController = require('../controllers/streakController');
const { authenticate } = require('../middleware/auth');

// All streak routes require authentication
router.get('/', authenticate, streakController.getStreak);
router.post('/record', authenticate, streakController.recordActivity);

module.exports = router;
