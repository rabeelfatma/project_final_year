const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/authMiddleware");
const plagiarismController = require("../controllers/plagiarismController");

router.use(protect, authorize("teacher", "admin"));

router.get("/provider-status", plagiarismController.getProviderStatus);
router.post("/checks", plagiarismController.createChecks);
router.get("/checks", plagiarismController.listChecks);
// Prefer POST /checks/clear for Vercel/proxy compatibility; DELETE kept as alias.
router.post("/checks/clear", plagiarismController.clearHistory);
router.delete("/checks", plagiarismController.clearHistory);
router.get("/checks/:id", plagiarismController.getCheck);
router.post("/checks/:id/refresh", plagiarismController.refreshCheck);
router.get("/checks/:id/report", plagiarismController.getReport);

// Legacy alias — same provider architecture (no local Jaccard scores).
router.post("/check", plagiarismController.check);

module.exports = router;
