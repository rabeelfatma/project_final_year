const express = require("express");
const router = express.Router();
const { 
  evaluateAssignment, 
  publishResults, 
  updateTeacherGrading 
} = require("../controllers/evaluationController");
const { protect, authorize } = require("../middleware/authMiddleware");

// Legacy evaluation API — teachers only; ownership enforced in controller.
router.post("/evaluate", protect, authorize("teacher"), evaluateAssignment);
router.post("/update-grading", protect, authorize("teacher"), updateTeacherGrading);
router.post("/publish", protect, authorize("teacher"), publishResults);

module.exports = router;