const express = require("express");
const router = express.Router();

const authController = require("../controllers/authController");
const passwordResetController = require("../controllers/passwordResetController");
const { protect, authorize } = require("../middleware/authMiddleware");
const {
  normalizeRole,
  isPublicAdminBootstrapAllowed,
} = require("../utils/authPassword");

/**
 * Student/teacher signup: admin JWT required.
 * Admin signup: always requires an authenticated admin.
 * Public first-admin bootstrap is disabled pending an approved setup decision.
 */
async function gateSignup(req, res, next) {
  const role = normalizeRole(req.body?.role);

  if (role === "student" || role === "teacher") {
    return protect(req, res, () => authorize("admin")(req, res, next));
  }

  if (role === "admin") {
    if (!isPublicAdminBootstrapAllowed()) {
      // Existing admins may create additional admins with a valid admin JWT.
      return protect(req, res, () => authorize("admin")(req, res, next));
    }
    return next();
  }

  return res.status(400).json({ message: "Invalid role selected" });
}

router.post("/signup", gateSignup, (req, res) => authController.registerUser(req, res));
router.post("/login", (req, res) => authController.loginUser(req, res));

/**
 * Legacy insecure reset (email + newPassword) remains permanently disabled.
 * Use the tokenized email recovery endpoints below instead.
 */
router.post("/reset-password", (_req, res) => {
  return res.status(503).json({
    message:
      "Password recovery is temporarily unavailable. Contact an administrator for assistance.",
    code: "PASSWORD_RESET_DISABLED",
  });
});

/** Secure email-based recovery (Admin / Teacher / Student). */
router.post("/password-reset/request", (req, res) =>
  passwordResetController.requestReset(req, res)
);
router.post("/password-reset/confirm", (req, res) =>
  passwordResetController.confirmReset(req, res)
);

module.exports = router;
