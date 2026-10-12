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

    // QC-18A email ownership verification (public signup dual-gate).
    // Missing/undefined is treated as verified for legacy / Admin-created accounts.
    // Public signup sets emailVerified=false until the applicant confirms.
    emailVerified: { type: Boolean },
    emailVerifiedAt: { type: Date, default: null },
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