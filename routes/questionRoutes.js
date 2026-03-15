/**
 * PastQuest - Question Routes
 */

const express = require('express');
const router = express.Router();
const questionController = require('../controllers/questionController');
const { authenticate, optionalAuth, requireContributor, requireAdmin } = require('../middleware/auth');
const multer = require('multer');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and PDFs are allowed.'));
    }
  }
});

// Public/Optional auth routes
router.get('/', optionalAuth, questionController.getQuestions);
router.get('/:id', optionalAuth, questionController.getQuestion);

// Contributor routes
router.post('/upload', authenticate, requireContributor, upload.array('images', 5), questionController.uploadQuestion);
router.get('/contributor/uploads', authenticate, requireContributor, questionController.getMyUploads);
router.get('/contributor/stats', authenticate, requireContributor, questionController.getContributorStats);

// Admin routes
router.get('/admin/pending', authenticate, requireAdmin, questionController.getPendingQuestions);
router.get('/admin/all', authenticate, requireAdmin, questionController.getAllQuestions);
router.post('/:id/approve', authenticate, requireAdmin, questionController.approveQuestion);
router.post('/:id/reject', authenticate, requireAdmin, questionController.rejectQuestion);
router.delete('/:id', authenticate, requireAdmin, questionController.deleteQuestion);

module.exports = router;
