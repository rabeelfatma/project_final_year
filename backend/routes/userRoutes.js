const express = require("express");
const router = express.Router();
const upload = require("../middleware/multerMiddleware");
const { protect, authorize } = require("../middleware/authMiddleware");
const { getProfile, updateProfile } = require("../controllers/profileController");

router.get("/profile", protect, getProfile);
router.put("/profile", protect, upload.single("profilePicture"), updateProfile);

router.get("/admin", protect, authorize("admin"), (req,res)=>res.json({message:"Welcome Admin"}));
router.get("/student", protect, authorize("student"), (req,res)=>res.json({message:"Welcome Student"}));
router.get("/teacher", protect, authorize("teacher"), (req,res)=>res.json({message:"Welcome Teacher"}));

module.exports = router;
