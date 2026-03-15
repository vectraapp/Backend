/**
 * Vectra - Data Routes
 * Universities, Faculties, Departments, Courses, etc.
 *
 * All data routes are public (no authentication required).
 *
 * FLAT URL patterns to match frontend API constants:
 *   /data/universities           → list published universities
 *   /data/universities/:id       → single university with faculties
 *   /data/faculties/:universityId → list faculties for a university
 *   /data/departments/:facultyId  → list departments for a faculty
 *   /data/courses/:departmentId   → list courses for a department
 *   /data/levels/:universityId    → get level names for a university
 *   /data/courses/:courseId/textbooks → textbooks for a course
 *   /data/sessions               → available academic sessions
 *   /data/search/courses         → course search
 */

const express = require('express');
const router = express.Router();
const dataController = require('../controllers/dataController');

// Universities
router.get('/universities', dataController.getUniversities);
router.get('/universities/:id', dataController.getUniversity);

// Levels for a university
router.get('/levels/:universityId', dataController.getLevels);

// Faculties for a university (FLAT: /data/faculties/:universityId)
router.get('/faculties/:universityId', dataController.getFaculties);

// Departments for a faculty (FLAT: /data/departments/:facultyId)
router.get('/departments/:facultyId', dataController.getDepartments);

// Courses for a department (FLAT: /data/courses/:departmentId)
// NOTE: textbooks route must come BEFORE the generic :departmentId route
router.get('/courses/:courseId/textbooks', dataController.getTextbooks);
router.get('/courses/:departmentId', dataController.getCourses);

// Sessions, settings, search
router.get('/sessions', dataController.getSessions);
router.get('/settings', dataController.getSettings);
router.get('/search/courses', dataController.searchCourses);

module.exports = router;
