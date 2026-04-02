/**
 * Vectra/Vectra - Audio & Photo Upload Middleware
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const tempDir = path.join(__dirname, '..', 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Audio upload configuration
const audioStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, tempDir),
  filename: (req, file, cb) => cb(null, `audio_${Date.now()}${path.extname(file.originalname)}`),
});

const audioFilter = (req, file, cb) => {
  const allowed = ['.m4a', '.mp3', '.wav', '.webm', '.ogg'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only audio files are allowed'), false);
  }
};

const audioUpload = multer({
  storage: audioStorage,
  fileFilter: audioFilter,
  limits: { fileSize: 100 * 1024 * 1024 },
}).single('audio');

// Photo upload configuration
const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, tempDir),
  filename: (req, file, cb) => cb(null, `photo_${Date.now()}_${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`),
});

const photoFilter = (req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

const photosUpload = multer({
  storage: photoStorage,
  fileFilter: photoFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
}).array('photos', 20);

module.exports = { audioUpload, photosUpload };
