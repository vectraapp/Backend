/**
 * Vectra - Bookmark Routes
 */

const express = require('express');
const router = express.Router();
const bookmarkController = require('../controllers/bookmarkController');
const { authenticate } = require('../middleware/auth');

// All bookmark routes require authentication
router.get('/', authenticate, bookmarkController.getBookmarks);
router.post('/', authenticate, bookmarkController.addBookmark);
router.delete('/:id', authenticate, bookmarkController.removeBookmark);

module.exports = router;
