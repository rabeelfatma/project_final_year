const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/authMiddleware");
const upload = require("../middleware/multerMiddleware");

const { 
  getAssignments,
  // evaluateAssignment, // Isse ab submissionController se lenge
  teacherCreateAssignment,
  getTeacherStats,
  evaluateWithGemini 
} = require("../controllers/assignmentController");

// Importing submission controller for grading logic
const submissionController = require("../controllers/submissionController");

const { submitAssignment, getSubmissionsByAssignment } = require("../controllers/submissionController");

// TEACHER: Create Assignment (Fixed: added upload middleware)
router.post("/create", protect, authorize("teacher"), upload.single("file"), teacherCreateAssignment);

// TEACHER: Dashboard Stats
router.get("/teacher-stats", protect, authorize("teacher"), getTeacherStats);

// 🔥 NEW: AI Bulk Evaluation Route
router.post("/evaluate-ai-bulk", protect, authorize("teacher"), evaluateWithGemini);

// Student Submit Assignment
router.post(
  "/student/assignments/:id/submit",
  protect,
  authorize("student"),
  upload.single("file"),
  submitAssignment
);

// GET ASSIGNMENTS (ALL ROLES)
router.get(
  "/",
  protect,
  authorize("teacher", "admin", "student"),
  getAssignments
);

// 🔥 FIX: Manual Evaluate Submission 
// Changed from assignmentController to submissionController.evaluateAssignment
router.put(
  "/evaluate/:id",
  protect,
  authorize("teacher", "admin"),
  submissionController.evaluateAssignment
);

// TEACHER: Get all submissions of an assignment
router.get(
  "/assignments/:id/submissions",
  protect,
  authorize("teacher"),
  getSubmissionsByAssignment
);

module.exports = router;