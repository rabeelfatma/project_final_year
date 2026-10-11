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