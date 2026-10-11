const express = require('express');
const router = express.Router();
const teacherController = require('../controllers/teacherController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/multerMiddleware');

// ==========================================
// MIDDLEWARE
// ==========================================
// Sabhi routes ko protect karne ke liye authentication middleware
router.use(protect);

// ==========================================
// 1. DASHBOARD & LISTING ROUTES
// ==========================================

// Dashboard ke stats fetch karne ke liye
router.get('/overview-stats', teacherController.getOverviewStats);

// Teacher ki apni banayi hui assignments ki list
router.get('/my-assignments', teacherController.getMyAssignments);

// Tamam students ki submissions fetch karne ke liye (Dashboard table)
router.get('/recent-submissions', teacherController.getRecentSubmissions);

// Students ki list dekhne ke liye
router.get('/students', teacherController.getStudents);

// Teachers ki list dekhne ke liye
router.get('/list', teacherController.getTeachers);


// ==========================================
// 2. ASSIGNMENT CRUD (Create, Read, Update, Delete)
// ==========================================

// Nayi assignment create karna (File upload support ke saath)
router.post('/assignments', upload.single('file'), teacherController.createAssignment);

// Existing assignment ko edit/update karna
router.put('/assignments/:id', upload.single('file'), teacherController.updateAssignment);

// Assignment delete karna
router.delete('/assignments/:id', teacherController.deleteAssignment);
router.post('/assignments/bulk-delete', teacherController.deleteAssignmentsBulk);

// Assignment ka status change karna (e.g., active se deactive)
router.patch('/assignments/:id/status', teacherController.updateAssignmentStatus);


// ==========================================
// 3. EVALUATION & AI GRADING ROUTES
// ==========================================

// Bulk AI Evaluation (Gemini AI ke zariye grading)
// Frontend call: api.post('/teacher/evaluate-ai', data)
router.post('/evaluate-ai', upload.array('references', 20), teacherController.evaluateWithGemini);

// Manual Evaluation (Teacher khud marks aur feedback deta hai)
// Frontend call: api.put(`/teacher/evaluate/${id}`, data)
router.put('/evaluate/:id', teacherController.evaluateAssignment);

// Results ko publish karna taake students dekh sakein
// Frontend call: api.post('/teacher/publish-results', data)
router.post('/publish-results', teacherController.publishResults);

// Submission deletion: individual + selected bulk
router.patch('/submissions/:id/reset-grade', teacherController.resetSubmissionGrade);
router.post('/submissions/bulk-reset-grades', teacherController.resetSubmissionGradesBulk);
router.delete('/submissions/:id', teacherController.deleteSubmission);
router.post('/submissions/bulk-delete', teacherController.deleteSubmissionsBulk);


module.exports = router;