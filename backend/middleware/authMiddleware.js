const jwt = require("jsonwebtoken");
const User = require("../models/User");

const protect = async (req, res, next) => {
  try {
    let token = null;

    // ✅ SAFE token extraction
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer ")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    // 🔴 DEBUG LOG: Agar token nahi aa raha toh terminal mein pata chal jayega
    if (!token) {
      console.log("❌ AUTH FAIL: No token found in headers");
      return res.status(401).json({
        message: "No token provided (Access Denied)"
      });
    }

    // ✅ verify token safely
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      console.log("❌ AUTH FAIL: Token verification failed:", err.message);
      return res.status(401).json({
        message: "Invalid or expired token"
      });
    }

    // ✅ user fetch
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      console.log("❌ AUTH FAIL: User ID in token does not exist in DB");
      return res.status(401).json({
        message: "User not found (Access Denied)"
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("AUTH MIDDLEWARE ERROR:", error);
    return res.status(500).json({
      message: "Authentication failed"
    });
  }
};

// ================= ROLE CHECK =================
const authorize = (...roles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!roles.includes(req.user.role)) {
        console.log(`❌ ROLE FAIL: User role ${req.user.role} not in allowed: ${roles}`);
        return res.status(403).json({
          message: `Access denied for role: ${req.user.role}`
        });
      }

      next();
    } catch (err) {
      return res.status(500).json({
        message: "Authorization error"
      });
    }
  };
};

module.exports = { protect, authorize };