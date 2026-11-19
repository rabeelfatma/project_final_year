const jwt = require("jsonwebtoken");
const User = require("../models/User");

/** Soft rate-limit for auth fail console noise (same message flooding). */
const recentAuthFailLogs = new Map();
function logAuthFail(kind, detail = "") {
  const key = `${kind}:${detail}`;
  const now = Date.now();
  const last = recentAuthFailLogs.get(key) || 0;
  if (now - last < 15_000) return;
  recentAuthFailLogs.set(key, now);
  // Never log the raw token. Detail is a safe error class only.
  if (detail) {
    console.warn(`AUTH FAIL [${kind}]: ${detail}`);
  } else {
    console.warn(`AUTH FAIL [${kind}]`);
  }
}

function extractBearerToken(authorizationHeader) {
  if (!authorizationHeader || typeof authorizationHeader !== "string") {
    return null;
  }
  const trimmed = authorizationHeader.trim();
  if (!trimmed) return null;

  // Accept "Bearer <jwt>" only — reject empty Bearer or non-Bearer schemes here.
  const match = /^Bearer\s+(.+)$/i.exec(trimmed);
  if (!match) return null;

  let token = match[1].trim();
  // Strip accidental nested "Bearer " prefixes from buggy clients.
  while (/^Bearer\s+/i.test(token)) {
    token = token.replace(/^Bearer\s+/i, "").trim();
  }
  if (!token || /^(null|undefined)$/i.test(token)) return null;

  // JWT must be three non-empty segments before verify (avoids "jwt malformed" spam).
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((p) => !p)) return null;

  return token;
}

const protect = async (req, res, next) => {
  try {
    if (!process.env.JWT_SECRET) {
      console.error("AUTH CONFIG: JWT_SECRET is not configured");
      return res.status(500).json({ message: "Authentication is not configured" });
    }

    const token = extractBearerToken(req.headers.authorization);

    if (!token) {
      logAuthFail("missing_or_malformed_header");
      return res.status(401).json({
        message: "No token provided (Access Denied)",
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      const code = err?.name === "TokenExpiredError" ? "expired" : "invalid";
      logAuthFail("verify", code);
      return res.status(401).json({
        message: "Invalid or expired token",
      });
    }

    if (!decoded?.id) {
      logAuthFail("verify", "missing_subject");
      return res.status(401).json({
        message: "Invalid or expired token",
      });
    }

    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      logAuthFail("user_missing");
      return res.status(401).json({
        message: "User not found (Access Denied)",
      });
    }

    // Authoritative session invalidation: DB tokenVersion must match JWT `tv`.
    const tokenTv = Number.isFinite(Number(decoded.tv)) ? Number(decoded.tv) : 0;
    const userTv = Number.isFinite(Number(user.tokenVersion))
      ? Number(user.tokenVersion)
      : 0;
    if (tokenTv !== userTv) {
      return res.status(401).json({
        message: "Session expired. Please sign in again.",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("AUTH MIDDLEWARE ERROR:", error?.message || error);
    return res.status(500).json({
      message: "Authentication failed",
    });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          message: `Access denied for role: ${req.user.role}`,
        });
      }

      next();
    } catch (err) {
      return res.status(500).json({
        message: "Authorization error",
      });
    }
  };
};

module.exports = { protect, authorize, extractBearerToken };
