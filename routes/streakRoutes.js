/**
 * Vectra — Streak Routes
 *
 * Base: /api/v1/streaks
 */

const express = require('express');
const router = express.Router();
const streakController = require('../controllers/streakController');
const { authenticate } = require('../middleware/auth');

// GET  /api/v1/streaks/me            — full streak profile + heatmap
router.get('/me', authenticate, streakController.getMyStreak);

// POST /api/v1/streaks/log-activity  — log an action, update streak + points
// Body: { action_type, course_code? }
router.post('/log-activity', authenticate, streakController.logActivity);

// GET  /api/v1/streaks/milestones    — milestone list with achieved flags
router.get('/milestones', authenticate, streakController.getMilestones);

// PATCH /api/v1/streaks/leaderboard-visibility — toggle leaderboard opt-out
// Body: { show: boolean }
router.patch('/leaderboard-visibility', authenticate, streakController.setLeaderboardVisibility);

module.exports = router;
