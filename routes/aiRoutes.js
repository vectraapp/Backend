/**
 * Vectra/Vectra - AI Routes
 */

const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const { authenticate } = require('../middleware/auth');

// All AI routes require authentication
router.use(authenticate);

router.post('/chat', aiController.chat);
router.post('/generate-recap', aiController.generateRecap);
router.get('/chat-history/:lectureId', aiController.getChatHistory);
router.delete('/chat-history/:lectureId', aiController.clearChatHistory);

module.exports = router;
