/**
 * Resolve the public API origin used in email verification links.
 * Prefer explicit PUBLIC_API_URL (or API_PUBLIC_URL).
 * On Vercel Production, use the stable Production API host — do not prefer
 * VERCEL_URL (deployment-specific host) or email links break after redeploy.
 * On Preview, fall back to VERCEL_URL so branch deployments work without
 * hardcoded aliases. Never taken from request Host.
 */

const PRODUCTION_API_ORIGIN = "https://quickcheck-hub-backend.vercel.app";

function normalizeOrigin(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

/**
 * @returns {string} Absolute API origin without trailing slash (no /api suffix), or "".
 */
function resolvePublicApiUrl(env = process.env) {
  const explicit = normalizeOrigin(env.PUBLIC_API_URL || env.API_PUBLIC_URL);
  if (explicit) {
    try {
      const withScheme = /^https?:\/\//i.test(explicit)
        ? explicit
        : `https://${explicit}`;
      const u = new URL(withScheme);
      return `${u.protocol}//${u.host}`;
    } catch {
      return explicit.replace(/\/api\/?$/i, "");
    }
  }

  const vercelEnv = String(env.VERCEL_ENV || "").toLowerCase();
  // Stable Production alias — VERCEL_URL on prod is the ephemeral deployment host.
  if (vercelEnv === "production") {
    return PRODUCTION_API_ORIGIN;
  }

  const vercelHost = String(env.VERCEL_URL || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  if (vercelHost) {
    return `https://${vercelHost}`;
  }

  const isProd = String(env.NODE_ENV || "").toLowerCase() === "production";
  if (isProd) return PRODUCTION_API_ORIGIN;

  const port = String(env.PORT || "5000").trim() || "5000";
  return `http://127.0.0.1:${port}`;
}

/**
 * API root including a single /api suffix (no trailing slash).
 */
function resolvePublicApiRoot(env = process.env) {
  const origin = resolvePublicApiUrl(env);
  if (!origin) return "";
  if (/\/api$/i.test(origin)) return origin;
  return `${origin}/api`;
}

module.exports = {
  PRODUCTION_API_ORIGIN,
  resolvePublicApiUrl,
  resolvePublicApiRoot,
};
