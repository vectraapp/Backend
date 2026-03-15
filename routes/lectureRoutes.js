/**
 * PastQuest/Vectra - Lecture Routes
 */

const express = require('express');
const router = express.Router();
const lectureController = require('../controllers/lectureController');
const { authenticate } = require('../middleware/auth');
const { audioUpload, photosUpload } = require('../middleware/audioUpload');

// All lecture routes require authentication
router.use(authenticate);

// Create lecture - support both POST /lectures and POST /lectures/create
router.post('/', lectureController.createLecture);
router.post('/create', lectureController.createLecture);
router.post('/upload-audio', audioUpload, lectureController.uploadAudio);
router.post('/upload-photos', photosUpload, lectureController.uploadPhotos);
router.post('/upload-images', photosUpload, lectureController.uploadPhotos); // Alias for upload-photos
router.post('/process', lectureController.processLecture);

// Get user's lectures - support both GET /lectures and GET /lectures/user/all
router.get('/', lectureController.getUserLectures);
router.get('/user/all', lectureController.getUserLectures);
router.get('/:id', lectureController.getLecture);
router.put('/:id', lectureController.updateLecture);
router.delete('/:id', lectureController.deleteLecture);
router.post('/:id/favorite', lectureController.toggleFavorite);

module.exports = router;
