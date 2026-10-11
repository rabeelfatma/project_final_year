const express = require("express");
const router = express.Router();
const upload = require("../middleware/multerMiddleware");
const { protect } = require("../middleware/authMiddleware");
const { getProfile, updateProfile } = require("../controllers/profileController");

router.get("/", protect, getProfile);
router.put("/", protect, upload.single("profilePicture"), updateProfile);

module.exports = router;
