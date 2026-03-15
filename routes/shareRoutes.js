/**
 * Vectra - Share Routes
 * Handles content sharing with share codes
 */

const express = require('express');
const router = express.Router();
const shareController = require('../controllers/shareController');
const { authenticate } = require('../middleware/auth');

// All share routes require authentication
router.use(authenticate);

// Create a share code
router.post('/', shareController.createShareCode);

// Redeem a share code
router.post('/redeem', shareController.redeemShareCode);

// Get my created share codes
router.get('/my-shares', shareController.getMyShareCodes);

// Get content shared with me
router.get('/shared-with-me', shareController.getSharedWithMe);

// Preview a share code before redeeming
router.get('/preview/:code', shareController.previewShareCode);

// Deactivate a share code
router.delete('/:code', shareController.deactivateShareCode);

// Get redemptions for a share code
router.get('/:code/redemptions', shareController.getShareCodeRedemptions);

module.exports = router;
