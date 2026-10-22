const {
  requestPasswordReset,
  confirmPasswordReset,
} = require("../services/passwordResetService");

/**
 * Rate-limit identity from the immediate peer / Express-resolved IP only.
 * Do not trust leftmost X-Forwarded-For (client-spoofable).
 * With `trust proxy` enabled in appFull, Express derives req.ip from the
 * configured hop count (Vercel / platform reverse proxy).
 */
function clientIp(req) {
  const resolved = req.ip || req.socket?.remoteAddress || "unknown";
  return String(resolved).replace(/^::ffff:/i, "");
}

exports.requestReset = async (req, res) => {
  try {
    const result = await requestPasswordReset({
      email: req.body?.email,
      ip: clientIp(req),
    });
    return res.status(result.status).json({
      message: result.message,
      ...(result.code ? { code: result.code } : {}),
    });
  } catch (_) {
    return res.status(503).json({
      message:
        "Password recovery is temporarily unavailable. Please try again later.",
      code: "PASSWORD_RESET_UNAVAILABLE",
    });
  }
};

exports.confirmReset = async (req, res) => {
  try {
    const result = await confirmPasswordReset({
      token: req.body?.token,
      newPassword: req.body?.newPassword,
      ip: clientIp(req),
    });
    return res.status(result.status).json({
      message: result.message,
    });
  } catch (_) {
    return res.status(503).json({
      message:
        "Password recovery is temporarily unavailable. Please try again later.",
      code: "PASSWORD_RESET_UNAVAILABLE",
    });
  }
};

exports.clientIp = clientIp;
