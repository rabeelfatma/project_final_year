const jwt = require("jsonwebtoken");

/**
 * @param {string|object} id user id
 * @param {string} role
 * @param {number} [tokenVersion=0] must match User.tokenVersion for protect()
 */
const generateToken = (id, role, tokenVersion = 0) => {
  const tv = Number.isFinite(Number(tokenVersion)) ? Number(tokenVersion) : 0;
  return jwt.sign(
    { id, role, tv },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

module.exports = generateToken;
