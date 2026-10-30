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
const {
  toPublicReapplicationInfo,
} = require("../utils/registrationApplication");

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
        if (userExists.reapplicationDisabled === true) {
          return res.status(409).json({
            message:
              "Reapplication is unavailable for this registration. Contact an administrator if you need help.",
            code: "REGISTRATION_PERMANENTLY_REJECTED",
          });
        }
        // Do not create a duplicate account and do not silently reactivate.
        // Applicant may correct permitted fields via POST /auth/reapply.
        return res.status(409).json({
          message:
            "Your previous application was declined. You can review your information, make the necessary corrections, and submit a new request for approval.",
          code: "REAPPLICATION_AVAILABLE",
          reapplication: toPublicReapplicationInfo(userExists),
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

    const submittedAt = new Date();
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
      rejectionReason: null,
      reapplicationDisabled: false,
      applicationAttempt: 1,
      lastSubmittedAt: submittedAt,
      applicationHistory: [],
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
        JSON.stringify({
          code: sent.code || "EMAIL_PROVIDER_ERROR",
          category: sent.category || "unknown",
          providerStatus:
            Number.isFinite(Number(sent.providerStatus)) &&
            Number(sent.providerStatus) > 0
              ? Number(sent.providerStatus)
              : null,
        })
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

// ==========================================
// REAPPLY AFTER REJECTION (same User document)
// Name, email, password, and Teacher/Student role may be corrected.
// Never auto-approves; email changes stay pending until verified.
// ==========================================
exports.reapplyPublicSignup = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      confirmPassword,
      role,
      accountEmail,
      accountId,
    } = req.body || {};
    const {
      getEmailConfig,
    } = require("../services/transactionalEmail");
    const {
      issueEmailVerificationToken,
      sendSignupVerificationEmail,
    } = require("../services/emailVerificationService");

    const emailConfig = getEmailConfig();
    if (!emailConfig.configured) {
      console.error("PUBLIC REAPPLY BLOCKED: EMAIL_NOT_CONFIGURED");
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

    const desiredEmailCheck = validateEmailInput(email);
    if (!desiredEmailCheck.ok) {
      return res.status(400).json({ message: desiredEmailCheck.message });
    }

    // Account identity MUST come from the original rejected registration email.
    // Never fall back to the editable "email" field — that breaks email-change reapply.
    if (accountEmail == null || String(accountEmail).trim() === "") {
      return res.status(400).json({
        message:
          "Original registered email is required to resubmit. Start again from your declined registration email.",
        code: "ACCOUNT_EMAIL_REQUIRED",
      });
    }
    const accountEmailCheck = validateEmailInput(accountEmail);
    if (!accountEmailCheck.ok) {
      return res.status(400).json({ message: accountEmailCheck.message });
    }

    const passwordCheck = validatePasswordInput(password);
    if (!passwordCheck.ok) {
      return res.status(400).json({ message: passwordCheck.message });
    }

    if (
      confirmPassword == null ||
      typeof confirmPassword !== "string" ||
      confirmPassword.length === 0
    ) {
      return res.status(400).json({
        message: "Confirm your password.",
        code: "PASSWORD_CONFIRM_REQUIRED",
      });
    }
    if (confirmPassword !== passwordCheck.password) {
      return res.status(400).json({
        message: "Password confirmation does not match.",
        code: "PASSWORD_MISMATCH",
      });
    }

    const requestedRole = normalizeRole(role);
    if (requestedRole === "admin") {
      return res.status(400).json({
        message: "Administrator role cannot be selected for registration.",
        code: "ADMIN_ROLE_FORBIDDEN",
      });
    }
    if (requestedRole !== "teacher" && requestedRole !== "student") {
      return res.status(400).json({
        message: "Only Teacher or Student registration requests are accepted",
        code: "INVALID_ROLE",
      });
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

    const accountEmailNormalized = accountEmailCheck.email;
    const desiredEmail = desiredEmailCheck.email;
    const emailLimit = await assertWithinRateLimit(
      AuthRateLimit,
      `signup:email:${desiredEmail}`,
      3,
      DEFAULT_WINDOW_MS
    );
    if (!emailLimit.ok) {
      return res.status(429).json({
        message: "Too many registration attempts for this email. Please try again later.",
      });
    }

    // Locate the existing rejected account by stable identity (id and/or original email).
    // Do not look up by the editable desired email — that account does not exist yet.
    let user = null;
    const requestedAccountId =
      accountId != null && String(accountId).trim() !== ""
        ? String(accountId).trim()
        : null;

    if (requestedAccountId) {
      user = await User.findById(requestedAccountId);
      if (
        user &&
        String(user.email || "")
          .trim()
          .toLowerCase() !== accountEmailNormalized
      ) {
        // Identity mismatch — refuse before any mutation.
        return res.status(404).json({
          message: "No declined registration was found for this email.",
          code: "NOT_FOUND",
        });
      }
    }
    if (!user) {
      user = await User.findOne({ email: accountEmailNormalized });
    }
    if (!user) {
      return res.status(404).json({
        message: "No declined registration was found for this email.",
        code: "NOT_FOUND",
      });
    }

    if (user.role === "admin") {
      return res.status(400).json({
        message: "Unable to resubmit registration for this email.",
        code: "EMAIL_UNAVAILABLE",
      });
    }

    if (!["teacher", "student"].includes(user.role)) {
      return res.status(400).json({
        message: "Unable to resubmit registration for this email.",
        code: "EMAIL_UNAVAILABLE",
      });
    }

    const approval = user.approvalStatus || "approved";
    if (approval === "approved") {
      return res.status(409).json({
        message:
          "An account with this email already exists. Sign in or use Forgot Password if you need access.",
        code: "ALREADY_REGISTERED",
      });
    }
    if (approval === "pending") {
      if (user.emailVerified !== true) {
        return res.status(409).json({
          message:
            "A registration with this email is awaiting email verification. Use Resend Verification Email if you did not receive the link.",
          code: "PENDING_VERIFICATION",
        });
      }
      return res.status(409).json({
        message:
          "A registration with this email is awaiting administrator approval. You will be notified when a decision is made.",
        code: "PENDING_APPROVAL",
      });
    }
    if (approval !== "rejected") {
      return res.status(409).json({
        message: "This registration cannot be resubmitted.",
        code: "REAPPLICATION_UNAVAILABLE",
      });
    }

    if (user.reapplicationDisabled === true) {
      return res.status(409).json({
        message:
          "Reapplication is unavailable for this registration. Contact an administrator if you need help.",
        code: "REGISTRATION_PERMANENTLY_REJECTED",
      });
    }

    // Desired email must not belong to another account (email or pendingEmail).
    if (desiredEmail !== user.email) {
      const emailConflict = await User.findOne({
        $or: [{ email: desiredEmail }, { pendingEmail: desiredEmail }],
        _id: { $ne: user._id },
      });
      if (emailConflict) {
        return res.status(409).json({
          message:
            "That email address is already associated with another account.",
          code: "EMAIL_IN_USE",
        });
      }
    }

    // Ownership of the (possibly new) inbox is proven by verification email.
    // Never accept client-supplied approval, verification, or permanent-reject flags.
    const previousAttempt = Number(user.applicationAttempt) >= 1
      ? Math.floor(Number(user.applicationAttempt))
      : 1;
    const hashedPassword = await hashPassword(passwordCheck.password);
    const submittedAt = new Date();
    const userId = user._id;

    const previousName = user.name;
    const previousEmail = user.email;
    const previousRole = user.role;

    user.previousName = previousName;
    user.previousEmail = previousEmail;
    user.previousRole = previousRole;
    user.name = trimmedName;
    user.role = requestedRole;
    user.password = hashedPassword;
    user.approvalStatus = "pending";
    user.isAllowedLogin = false;
    user.emailVerified = false;
    user.emailVerifiedAt = null;
    user.adminNotifiedAt = null;
    user.approvedAt = null;
    user.approvedBy = null;
    user.rejectedAt = null;
    user.rejectedBy = null;
    user.rejectionReason = null;
    user.applicationAttempt = previousAttempt + 1;
    user.lastSubmittedAt = submittedAt;

    if (desiredEmail !== user.email) {
      // Keep unique `email` until the new address is verified.
      user.pendingEmail = desiredEmail;
    } else {
      user.pendingEmail = null;
    }

    if (requestedRole === "student" && !user.registrationNumber) {
      const date = new Date();
      const month = date.getMonth();
      const year = date.getFullYear().toString().slice(-2);
      const season = month < 6 ? "SP" : "FA";
      const count = await User.countDocuments({ role: "student", department: "CS" });
      const sequence = (count + 1).toString().padStart(3, "0");
      user.registrationNumber = `${season}${year}-BCS-${sequence}`;
    }

    // Preserve reapplicationDisabled (false here) and full applicationHistory.
    try {
      await user.save();
    } catch (err) {
      if (err && err.code === 11000) {
        return res.status(409).json({
          message:
            "That email address is already associated with another account.",
          code: "EMAIL_IN_USE",
        });
      }
      throw err;
    }

    if (String(user._id) !== String(userId)) {
      console.error("PUBLIC REAPPLY SAFETY: user id changed unexpectedly");
      return res.status(500).json({ message: "Database or server error" });
    }

    const verifyTarget = user.pendingEmail || user.email;
    const issued = await issueEmailVerificationToken(user, undefined, verifyTarget);
    const sent = await sendSignupVerificationEmail(
      user,
      issued.rawToken,
      undefined,
      verifyTarget
    );
    if (!sent.ok) {
      console.error(
        "PUBLIC REAPPLY EMAIL DELIVERY FAILED:",
        JSON.stringify({
          code: sent.code || "EMAIL_PROVIDER_ERROR",
          category: sent.category || "unknown",
          providerStatus:
            Number.isFinite(Number(sent.providerStatus)) &&
            Number(sent.providerStatus) > 0
              ? Number(sent.providerStatus)
              : null,
        })
      );
      return res.status(200).json({
        message:
          "Your application has been resubmitted successfully, but the verification email could not be sent. Use Resend verification later or contact an administrator.",
        status: "pending_verification",
        verificationEmailSent: false,
        code: "VERIFICATION_EMAIL_FAILED",
        applicationAttempt: user.applicationAttempt,
      });
    }

    return res.status(200).json({
      message:
        "Your application has been resubmitted successfully. It is now pending administrator review.",
      status: "pending_verification",
      verificationEmailSent: true,
      applicationAttempt: user.applicationAttempt,
      emailChanged: Boolean(user.pendingEmail),
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({
        message:
          "That email address is already associated with another account.",
        code: "EMAIL_IN_USE",
      });
    }
    console.error("SERVER ERROR DURING PUBLIC REAPPLY:", error.message);
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
    const {
      buildVerifyEmailResultRedirect,
    } = require("../utils/verifyEmailRedirect");

    const deps = createDefaultDeps();
    deps.notifyAdminsOfVerifiedRegistration = notifyAdminsOfVerifiedRegistration;

    // Prefer body for POST; query for GET email links. Do not log the raw token.
    const rawToken =
      req.method === "GET" ? req.query?.token : req.body?.token || req.query?.token;
    const result = await verifyEmailWithToken(rawToken, deps);

    // Browser email clicks use GET → allowlisted frontend redirect (no token in Location).
    if (req.method === "GET") {
      const location = buildVerifyEmailResultRedirect(result, process.env);
      if (location) {
        res.setHeader("Cache-Control", "no-store");
        return res.redirect(302, location);
      }
      // Fail closed if PUBLIC_APP_URL is missing/unsafe — never open-redirect.
      return res.status(result.status).json({
        message: result.message,
        ...(result.code ? { code: result.code } : {}),
        ...(result.user ? { user: result.user } : {}),
      });
    }

    return res.status(result.status).json({
      message: result.message,
      ...(result.code ? { code: result.code } : {}),
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
