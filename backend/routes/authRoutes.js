const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");

// Controllers - Object import
const authController = require("../controllers/authController");

// Models
const User = require("../models/User");

// ==========================================
// AUTH ROUTES (Signup & Login)
// ==========================================

/**
 * ✅ INLINE CALLS: Humne yahan functions ko direct pass karne ke bajaye 
 * wrapper function use kiya hai taake runtime par 'undefined' ka issue na aaye.
 */
router.post("/signup", (req, res) => authController.registerUser(req, res));
router.post("/login", (req, res) => authController.loginUser(req, res));

// ==========================================
// RESET PASSWORD ROUTE
// ==========================================
router.post("/reset-password", async (req, res) => {
  try {
    console.log("RESET PASSWORD ATTEMPT FOR:", req.body.email);

    const { email, newPassword } = req.body;

    // 1. Validation
    if (!email || !newPassword) {
      return res.status(400).json({
        message: "Email and new password are required"
      });
    }

    // 2. Find User (Normalized email check)
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    // 3. Hash New Password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 4. Update & Save
    user.password = hashedPassword;
    await user.save();

    return res.status(200).json({
      message: "Password changed successfully ✅"
    });

  } catch (error) {
    console.error("RESET PASSWORD ERROR:", error);
    return res.status(500).json({
      message: "Server error during password reset",
      error: error.message
    });
  }
});

module.exports = router;