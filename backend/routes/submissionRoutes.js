const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/authMiddleware"); // Auth added for security
const upload = require("../middleware/multerMiddleware");
const submissionController = require("../controllers/submissionController");

// API: POST /api/submissions/upload
router.post("/upload", upload.single("file"), submissionController.submitAssignment);

// API: GET /api/submissions/teacher/:teacherId
router.get("/teacher/:teacherId", submissionController.getTeacherSubmissions);

// 🔥 NEW: Teacher Dashboard (Using Protect for better data fetching)
router.get("/teacher-dashboard", protect, authorize("teacher"), submissionController.getTeacherSubmissions);

module.exports = router;