const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  createGroup,
  getMyGroups,
  joinGroup,
  getGroup,
  getMessages,
  sendMessage,
  leaveGroup,
  deleteGroup,
} = require('../controllers/groupController');

// All routes require authentication
router.use(authenticate);

router.post('/', createGroup);
router.get('/my', getMyGroups);
router.post('/join', joinGroup);
router.get('/:id', getGroup);
router.get('/:id/messages', getMessages);
router.post('/:id/messages', sendMessage);
router.delete('/:id/leave', leaveGroup);
router.delete('/:id', deleteGroup);

module.exports = router;
