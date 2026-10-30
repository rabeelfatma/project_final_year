const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    password: {
      type: String,
      required: false 
    },

    // Used to invalidate JWTs issued before a password change/reset.
    passwordChangedAt: {
      type: Date,
      default: null,
    },

    // Server-validated session generation. Incremented on password reset.
    // Existing JWTs without `tv` are treated as version 0 (compatible).
    tokenVersion: {
      type: Number,
      default: 0,
    },

    role: {
      type: String,
      enum: ["student", "teacher", "admin"],
      default: "student"
    },

    department: {
      type: String,
      enum: ["CS", "SE"],
      default: "CS"
    },

    program: { type: String },

    registrationNumber: {
      type: String,
      unique: true,
      sparse: true // ✅ Yeh zaroori hai conflict se bachne ke liye
    },

    isAllowedLogin: { type: Boolean, default: true },

    // Public Teacher/Student signup approval (QC-17A).
    // Legacy users without this field are treated as approved when login is allowed.
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "approved",
    },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    rejectedAt: { type: Date, default: null },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    // QC-23 — public-safe rejection reason for the current decision (not Admin-only notes).
    rejectionReason: {
      type: String,
      default: null,
      maxlength: 500,
    },
    // When true, applicant cannot resubmit. Existing rejected users without this field may reapply.
    reapplicationDisabled: {
      type: Boolean,
      default: false,
    },
    // Current application attempt (1 = first signup). Legacy rows without this field are treated as 1.
    applicationAttempt: {
      type: Number,
      default: 1,
      min: 1,
    },
    // Timestamp of the latest registration / reapplication submission.
    lastSubmittedAt: {
      type: Date,
      default: null,
    },
    // Completed decisions only. Empty/missing for legacy users — reapply still works.
    // Snapshots never include password or password hashes.
    applicationHistory: [
      {
        attempt: { type: Number, min: 1 },
        submittedAt: { type: Date, default: null },
        decidedAt: { type: Date, default: null },
        decision: {
          type: String,
          enum: ["approved", "rejected"],
        },
        rejectionReason: { type: String, default: null, maxlength: 500 },
        decidedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },
        name: { type: String, default: null },
        email: { type: String, default: null },
        role: { type: String, default: null },
        previousName: { type: String, default: null },
        previousEmail: { type: String, default: null },
        previousRole: { type: String, default: null },
      },
    ],

    // Snapshot of profile immediately before the latest reapplication (Admin review).
    previousName: { type: String, default: null },
    previousEmail: { type: String, default: null },
    previousRole: { type: String, default: null },

    // QC-18A email ownership verification (public signup dual-gate).
    // Login: missing/undefined treated as verified for legacy/Admin-created accounts.
    // Admin Registration UI: only emailVerified===true is shown as Verified.
    // Public signup sets emailVerified=false until the applicant confirms.
    emailVerified: { type: Boolean },
    emailVerifiedAt: { type: Date, default: null },
    // Requested email change during reapplication — applied only after verification succeeds.
    // Until then the unique `email` field remains the prior address (not treated as verified).
    pendingEmail: {
      type: String,
      default: null,
      lowercase: true,
      trim: true,
    },
    // Idempotent Admin notify-after-verify marker (email + dashboard notification).
    adminNotifiedAt: { type: Date, default: null },

    subject: { type: String },
    profilePicture: { type: String, default: "" },
    notificationPreferences: {
      browser: { type: Boolean, default: false },
      sound: { type: Boolean, default: true }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);