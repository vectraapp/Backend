/**
 * Vectra - Course Routes
 * Mounted at /api/v1/courses
 *
 * Handles:
 *  - University CRUD (admin)
 *  - Faculty CRUD (admin)
 *  - Department CRUD (admin)
 *  - Course CRUD (admin create/update/delete, authenticated list/get)
 *  - Student enrollment (authenticated)
 */

const express = require('express');
const router = express.Router();
const courseController = require('../controllers/courseController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// ─────────────────────────────────────────────────────────────
//  UNIVERSITY ROUTES (admin only)
// ─────────────────────────────────────────────────────────────
router.get('/universities', authenticate, requireAdmin, courseController.listUniversities);
router.post('/universities', authenticate, requireAdmin, courseController.createUniversity);
router.put('/universities/:id', authenticate, requireAdmin, courseController.updateUniversity);
router.post('/universities/:id/publish', authenticate, requireAdmin, courseController.publishUniversity);
router.post('/universities/:id/unpublish', authenticate, requireAdmin, courseController.unpublishUniversity);

// ─────────────────────────────────────────────────────────────
//  FACULTY ROUTES (admin only)
// ─────────────────────────────────────────────────────────────
router.post('/faculties', authenticate, requireAdmin, courseController.createFaculty);
router.put('/faculties/:id', authenticate, requireAdmin, courseController.updateFaculty);

// ─────────────────────────────────────────────────────────────
//  DEPARTMENT ROUTES (admin only)
// ─────────────────────────────────────────────────────────────
router.post('/departments', authenticate, requireAdmin, courseController.createDepartment);
router.put('/departments/:id', authenticate, requireAdmin, courseController.updateDepartment);

// ─────────────────────────────────────────────────────────────
//  ENROLLMENT ROUTES (authenticated)
//  IMPORTANT: These must be BEFORE /:id to avoid route conflicts
// ─────────────────────────────────────────────────────────────
router.post('/enroll', authenticate, courseController.enrollCourses);
router.get('/my-courses', authenticate, courseController.getMyCourses);

// ─────────────────────────────────────────────────────────────
//  COURSE ROUTES
// ─────────────────────────────────────────────────────────────
router.get('/', authenticate, courseController.listCourses);
router.get('/:id', authenticate, courseController.getCourse);
router.post('/', authenticate, requireAdmin, courseController.createCourse);
router.put('/:id', authenticate, requireAdmin, courseController.updateCourse);
router.delete('/:id', authenticate, requireAdmin, courseController.deleteCourse);

module.exports = router;
