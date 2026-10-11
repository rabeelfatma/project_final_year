const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/authMiddleware");
const { check } = require("../controllers/plagiarismController");

router.post("/check", protect, authorize("teacher", "admin"), check);
module.exports = router;
