/**
 * Vectra - Exam Countdown Routes
 */

const express = require('express');
const router = express.Router();
const examController = require('../controllers/examController');
const { authenticate } = require('../middleware/auth');

// All exam countdown routes require authentication
router.get('/', authenticate, examController.getCountdowns);
router.post('/', authenticate, examController.addCountdown);
router.delete('/:id', authenticate, examController.deleteCountdown);

module.exports = router;
