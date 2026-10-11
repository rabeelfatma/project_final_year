const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/authMiddleware");

const {
  getStudentDashboardStats,
  getTeacherDashboardStats,
  getAdminStats
} = require("../controllers/analyticsController");

/* --- ANALYTICS ROUTES --- */
router.get("/student-stats", protect, authorize("student"), getStudentDashboardStats);

// Teacher Stats
router.get("/teacher-stats", protect, authorize("teacher"), getTeacherDashboardStats);

// Admin Stats
router.get("/admin-stats", protect, authorize("admin"), getAdminStats);

module.exports = router;