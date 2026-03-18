/**
 * Vectra — Leaderboard Routes
 *
 * Base: /api/v1/leaderboard
 */

const express = require('express');
const router = express.Router();
const leaderboardController = require('../controllers/leaderboardController');
const { authenticate } = require('../middleware/auth');

// GET /api/v1/leaderboard/course/:courseCode?period=weekly|alltime
// Top 50 students for a specific course + viewer's pinned entry
router.get('/course/:courseCode', authenticate, leaderboardController.getCourseLeaderboard);

// GET /api/v1/leaderboard/my-courses?period=weekly|alltime
// Aggregated leaderboard for the viewer's entire dept + level cohort
router.get('/my-courses', authenticate, leaderboardController.getMyCoursesLeaderboard);

// GET /api/v1/leaderboard/my-rank/:courseCode?period=weekly|alltime
// Lightweight: just the viewer's rank + points for a course (for header badge)
router.get('/my-rank/:courseCode', authenticate, leaderboardController.getMyRank);

module.exports = router;
