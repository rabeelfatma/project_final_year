const jwt = require("jsonwebtoken");

/**
 * @param {string|object} id user id
 * @param {string} role
 * @param {number} [tokenVersion=0] must match User.tokenVersion for protect()
 */
const generateToken = (id, role, tokenVersion = 0) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }
  if (!id) {
    throw new Error("Cannot sign JWT without a user id");
  }
  const tv = Number.isFinite(Number(tokenVersion)) ? Number(tokenVersion) : 0;
  return jwt.sign(
    { id: String(id), role: String(role || ""), tv },
    process.env.JWT_SECRET,
    { expiresIn: "7d", algorithm: "HS256" }
  );
};

module.exports = generateToken;
