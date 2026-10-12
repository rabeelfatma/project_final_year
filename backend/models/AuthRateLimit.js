const mongoose = require("mongoose");

/**
 * Mongo-backed rate limit counters (multi-instance safe vs in-memory only).
 * Used for password-reset abuse prevention by email and IP.
 */
const authRateLimitSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    count: { type: Number, required: true, default: 0 },
    windowExpiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

authRateLimitSchema.index({ windowExpiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("AuthRateLimit", authRateLimitSchema);
