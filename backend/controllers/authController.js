const User = require("../models/User");
const generateToken = require("../utils/tokenUtils");
const {
  ALLOWED_ROLES,
  normalizeRole,
  validatePasswordInput,
  validateLoginPasswordInput,
  hashPassword,
  passwordsMatch,
  toPublicUser,
  isPublicAdminBootstrapAllowed,
  getLoginDenialReason,
} = require("../utils/authPassword");
const { validateEmailInput } = require("../utils/emailValidation");
const AuthRateLimit = require("../models/AuthRateLimit");
const { assertWithinRateLimit, DEFAULT_WINDOW_MS } = require("../services/authRateLimit");

function clientIp(req) {
  const resolved = req.ip || req.socket?.remoteAddress || "unknown";
  return String(resolved).replace(/^::ffff:/i, "");
}

// ==========================================
// REGISTER USER (Admin, Teacher, or Student)
// ==========================================
exports.registerUser = async (req, res) => {
  try {
    const { name, email, password, role, department, program, subject } = req.body;

    if (!name) {
      return res.status(400).json({
        message: "Name and email are required"
      });
    }

    const emailCheck = validateEmailInput(email);
    if (!emailCheck.ok) {
      return res.status(400).json({ message: emailCheck.message });
    }

    const userRole = normalizeRole(role);

    if (!ALLOWED_ROLES.includes(userRole)) {
      return res.status(400).json({ message: "Invalid role selected" });
    }

    // Student/teacher/admin creation via this endpoint requires an authenticated admin.
    // Public first-admin bootstrap is disabled (see isPublicAdminBootstrapAllowed).
    if (userRole === "student" || userRole === "teacher") {
      if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({
          message: "Only an authenticated admin can create student or teacher accounts"
        });
      }
    }

    if (userRole === "admin") {
      const isAuthedAdmin = req.user && req.user.role === "admin";
      if (!isAuthedAdmin && !isPublicAdminBootstrapAllowed()) {
        return res.status(403).json({
          message:
            "Public administrator registration is disabled. An authenticated administrator must create admin accounts, or use an approved setup process for the first admin."
        });
      }
    }

    const passwordCheck = validatePasswordInput(password);
    if (!passwordCheck.ok) {
      return res.status(400).json({ message: passwordCheck.message });
    }

    const normalizedEmail = emailCheck.email;

    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const hashedPassword = await hashPassword(passwordCheck.password);

    const newUserPayload = {
      name: name.trim().slice(0, 120),
      email: normalizedEmail,
      password: hashedPassword,
      role: userRole,
      department: department || "CS",
      program: program || null,
      subject: subject || null,
      // Admin-created accounts are immediately eligible to log in.
      approvalStatus: "approved",
      isAllowedLogin: true,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      approvedAt: new Date(),
      approvedBy: req.user?._id || null,
    };

    if (userRole === "student") {
      const date = new Date();
      const month = date.getMonth();
      const year = date.getFullYear().toString().slice(-2);
      const season = month < 6 ? "SP" : "FA";
      const deptCode = (department || "CS") === "SE" ? "BSE" : "BCS";

      const count = await User.countDocuments({
        role: "student",
        department: department || "CS"
      });

      const sequence = (count + 1).toString().padStart(3, "0");
      newUserPayload.registrationNumber = `${season}${year}-${deptCode}-${sequence}`;
    }

    const user = await User.create(newUserPayload);
    const publicUser = toPublicUser(user);

    return res.status(201).json({
      message:
        userRole === "student"
          ? "Student Registered Successfully ✅"
          : userRole === "teacher"
          ? "Teacher Added Successfully ✅"
          : "User Registered Successfully",
      regNo: user.registrationNumber || "N/A",
      token: generateToken(user._id, user.role, user.tokenVersion || 0),
      role: user.role,
      user: publicUser
    });

  } catch (error) {
    console.error("SERVER ERROR DURING SIGNUP:", error.message);

    if (error.code === 11000) {
      return res.status(400).json({
        message: "Conflict: This email or registration number is already in use. ❌"
      });
    }

    return res.status(500).json({
      message: "Database or server error",
      error: error.message
    });
  }
};

// ==========================================
// LOGIN USER
// ==========================================
exports.loginUser = async (req, res) => {
  try {
    const { email, password, role } = req.body;

    const emailCheck = validateEmailInput(email);
    if (!emailCheck.ok) {
      // Avoid leaking whether a malformed address could exist; still reject clearly.
      return res.status(400).json({
        message:
          emailCheck.message === "Email is required"
            ? "Email is required"
            : "Invalid email or password",
      });
    }

    const passwordCheck = validateLoginPasswordInput(password);
    if (!passwordCheck.ok) {
      return res.status(400).json({ message: passwordCheck.message });
    }

    const normalizedEmail = emailCheck.email;
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Authorization role always comes from the stored user record.
    // A client-supplied role is only a portal hint and must match the account.
    if (role) {
      const requestedRole = normalizeRole(role);
      if (requestedRole !== user.role) {
        return res.status(400).json({
          message: `Invalid credentials for ${requestedRole} login`
        });
      }
    }

    // Login is email + password only. Profile names stay on the user record
    // and are returned after successful authentication (never used as a factor).

    const denial = getLoginDenialReason(user);
    if (denial) {
      const status = user.approvalStatus === "pending" || user.approvalStatus === "rejected" ? 403 : 403;
      return res.status(status).json({ message: denial });
    }

    if (!user.password) {
      return res.status(400).json({
        message: "This account has no password set. Contact an administrator to reset access."
      });
    }

    const isMatch = await passwordsMatch(passwordCheck.password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    return res.json({
      message: "Login Successful",
      token: generateToken(user._id, user.role, user.tokenVersion || 0),
      role: user.role,
      name: user.name,
      regNo: user.registrationNumber || "N/A",
      user: toPublicUser(user)
    });

  } catch (error) {
    console.error("SERVER ERROR DURING LOGIN:", error.message);
    return res.status(500).json({
      message: "Server internal error",
      error: error.message
    });
  }
};

// ==========================================
// PUBLIC TEACHER/STUDENT REGISTRATION REQUEST
// Creates pending accounts only — never issues a session/JWT.
// QC-18A: sends email verification; Admin approval is a separate gate.
// ==========================================
exports.requestPublicSignup = async (req, res) => {
  try {
    const { name, email, password, role } = req.body || {};
    const {
      getEmailConfig,
    } = require("../services/transactionalEmail");
    const {
      issueEmailVerificationToken,
      sendSignupVerificationEmail,
    } = require("../services/emailVerificationService");

    const emailConfig = getEmailConfig();
    if (!emailConfig.configured) {
      // Fail closed before creating an account when delivery cannot run.
      // Operator must set RESEND_API_KEY, PASSWORD_RESET_FROM_EMAIL, and PUBLIC_APP_URL
      // (FRONTEND_URL / CLIENT_ORIGIN accepted as public URL fallback). Never log secrets.
      console.error("PUBLIC SIGNUP BLOCKED: EMAIL_NOT_CONFIGURED");
      return res.status(503).json({
        message:
          "Registration email verification is temporarily unavailable. Please try again later.",
        code: "EMAIL_NOT_CONFIGURED",
      });
    }

    const trimmedName = typeof name === "string" ? name.trim().slice(0, 120) : "";
    if (!trimmedName || trimmedName.length < 2) {
      return res.status(400).json({ message: "Full name is required" });
    }

    const emailCheck = validateEmailInput(email);
    if (!emailCheck.ok) {
      return res.status(400).json({ message: emailCheck.message });
    }

    const userRole = normalizeRole(role);
    if (userRole !== "teacher" && userRole !== "student") {
      return res.status(400).json({
        message: "Only Teacher or Student registration requests are accepted",
      });
    }

    const passwordCheck = validatePasswordInput(password);
    if (!passwordCheck.ok) {
      return res.status(400).json({ message: passwordCheck.message });
    }

    const ip = clientIp(req);
    const ipLimit = await assertWithinRateLimit(
      AuthRateLimit,
      `signup:ip:${ip}`,
      8,
      DEFAULT_WINDOW_MS
    );
    if (!ipLimit.ok) {
      return res.status(429).json({
        message: "Too many registration attempts. Please try again later.",
      });
    }

    const normalizedEmail = emailCheck.email;

    const emailLimit = await assertWithinRateLimit(
      AuthRateLimit,
      `signup:email:${normalizedEmail}`,
      3,
      DEFAULT_WINDOW_MS
    );
    if (!emailLimit.ok) {
      return res.status(429).json({
        message: "Too many registration attempts for this email. Please try again later.",
      });
    }

    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists) {
      // Never overwrite password/role/identity. Guide by state without enabling
      // silent reactivation. Admin emails stay opaque.
      if (userExists.role === "admin") {
        return res.status(400).json({
          message: "Unable to create registration request for this email.",
          code: "EMAIL_UNAVAILABLE",
        });
      }

      const approval = userExists.approvalStatus || "approved";
      if (approval === "rejected") {
        return res.status(409).json({
          message:
            "This registration request was previously declined. Contact an administrator if you need help.",
          code: "REGISTRATION_REJECTED",
        });
      }
      if (approval === "pending" && userExists.emailVerified !== true) {
        return res.status(409).json({
          message:
            "A registration with this email is awaiting email verification. Use Resend Verification Email if you did not receive the link.",
          code: "PENDING_VERIFICATION",
        });
      }
      if (approval === "pending" && userExists.emailVerified === true) {
        return res.status(409).json({
          message:
            "A registration with this email is awaiting administrator approval. You will be notified when a decision is made.",
          code: "PENDING_APPROVAL",
        });
      }
      return res.status(409).json({
        message:
          "An account with this email already exists. Sign in or use Forgot Password if you need access.",
        code: "ALREADY_REGISTERED",
      });
    }

    const hashedPassword = await hashPassword(passwordCheck.password);

    const newUserPayload = {
      name: trimmedName,
      email: normalizedEmail,
      password: hashedPassword,
      role: userRole,
      department: "CS",
      approvalStatus: "pending",
      isAllowedLogin: false,
      emailVerified: false,
      emailVerifiedAt: null,
      adminNotifiedAt: null,
      approvedAt: null,
      approvedBy: null,
      rejectedAt: null,
      rejectedBy: null,
    };

    if (userRole === "student") {
      const date = new Date();
      const month = date.getMonth();
      const year = date.getFullYear().toString().slice(-2);
      const season = month < 6 ? "SP" : "FA";
      const count = await User.countDocuments({ role: "student", department: "CS" });
      const sequence = (count + 1).toString().padStart(3, "0");
      newUserPayload.registrationNumber = `${season}${year}-BCS-${sequence}`;
    }

    const created = await User.create(newUserPayload);

    const issued = await issueEmailVerificationToken(created);
    const sent = await sendSignupVerificationEmail(created, issued.rawToken);
    if (!sent.ok) {
      // Account stays pending/unverified; applicant can use resend later when email recovers.
      console.error(
        "PUBLIC SIGNUP EMAIL DELIVERY FAILED:",
        sent.code || "EMAIL_PROVIDER_ERROR"
      );
      return res.status(201).json({
        message:
          "Your registration was saved, but the verification email could not be sent. Use Resend verification later or contact an administrator.",
        status: "pending_verification",
        verificationEmailSent: false,
        code: "VERIFICATION_EMAIL_FAILED",
      });
    }

    return res.status(201).json({
      message:
        "Your registration request has been submitted. Please verify your email, then wait for Admin approval before logging in.",
      status: "pending_verification",
      verificationEmailSent: true,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        message: "Unable to create registration request for this email.",
      });
    }
    console.error("SERVER ERROR DURING PUBLIC SIGNUP:", error.message);
    return res.status(500).json({ message: "Database or server error" });
  }
};

exports.verifyEmail = async (req, res) => {
  try {
    const {
      verifyEmailWithToken,
      createDefaultDeps,
    } = require("../services/emailVerificationService");
    const {
      notifyAdminsOfVerifiedRegistration,
    } = require("../services/registrationNotificationService");

    const deps = createDefaultDeps();
    deps.notifyAdminsOfVerifiedRegistration = notifyAdminsOfVerifiedRegistration;

    const result = await verifyEmailWithToken(req.body?.token || req.query?.token, deps);
    return res.status(result.status).json({
      message: result.message,
      ...(result.user ? { user: result.user } : {}),
    });
  } catch (error) {
    console.error("VERIFY EMAIL ERROR:", error.message);
    return res.status(500).json({ message: "Unable to verify email" });
  }
};

exports.resendVerificationEmail = async (req, res) => {
  try {
    const {
      resendVerificationEmail,
    } = require("../services/emailVerificationService");
    const result = await resendVerificationEmail({
      email: req.body?.email,
      ip: clientIp(req),
    });
    return res.status(result.status).json({
      message: result.message,
      ...(result.code ? { code: result.code } : {}),
    });
  } catch (error) {
    console.error("RESEND VERIFICATION ERROR:", error.message);
    return res.status(503).json({
      message:
        "Email verification is temporarily unavailable. Please try again later.",
      code: "EMAIL_UNAVAILABLE",
    });
  }
};
