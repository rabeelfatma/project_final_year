const express = require("express");
const router = express.Router();
const { 
  evaluateAssignment, 
  publishResults, 
  updateTeacherGrading 
} = require("../controllers/evaluationController");
const { protect } = require("../middleware/authMiddleware");

// Purana route (same functionality)
router.post("/evaluate", protect, evaluateAssignment);

// Naya route teacher ke marks update karne ke liye
router.post("/update-grading", protect, updateTeacherGrading);

// Results publish karne ka route
router.post("/publish", protect, publishResults);

module.exports = router;