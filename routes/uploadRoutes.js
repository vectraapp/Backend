/**
 * Vectra - Upload Routes
 * Handles user-submitted past questions and textbooks
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const uploadController = require('../controllers/uploadController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../temp'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `upload-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const fileFilter = (req, file, cb) => {
  // Accept PDFs and images
  const allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF and image files are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
});

// All upload routes require authentication
router.use(authenticate);

// User upload routes
router.post('/question', upload.single('file'), uploadController.uploadPastQuestion);
router.post('/textbook', upload.single('file'), uploadController.uploadTextbook);
router.get('/my-uploads', uploadController.getMyUploads);
router.get('/published', uploadController.getPublishedUploads);
router.get('/:id', uploadController.getUpload);

// Admin review routes
router.get('/admin/pending', requireAdmin, uploadController.getPendingUploads);
router.post('/admin/:id/approve', requireAdmin, uploadController.approveUpload);
router.post('/admin/:id/reject', requireAdmin, uploadController.rejectUpload);
router.get('/admin/stats', requireAdmin, uploadController.getUploadStats);

module.exports = router;
