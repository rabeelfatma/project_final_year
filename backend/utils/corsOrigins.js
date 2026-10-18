/**
 * CORS origin allowlist helpers.
 * Production: only explicit CLIENT_ORIGIN / FRONTEND_URL entries (fail closed).
 * Non-production: also allow private-LAN browser origins so same-Wi-Fi mobile
 * testing works without hardcoding the laptop IP into production config.
 */

const {
  isLoopbackHostname,
  isPrivateLanHostname,
} = require("./publicAppUrl");

function parseAllowedOrigins(env = process.env) {
  return String(env.CLIENT_ORIGIN || env.FRONTEND_URL || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isDevLanBrowserOrigin(origin) {
  if (!origin) return false;
  try {
    const { hostname } = new URL(String(origin));
    return isLoopbackHostname(hostname) || isPrivateLanHostname(hostname);
  } catch {
    return false;
  }
}

/**
 * @returns {true | false | "reflect"} 
 *   true = allow all (no allowlist configured — Hostinger same-origin / open local)
 *   "reflect" unused — kept simple for Express cors callback
 */
function resolveCorsOriginOption(origin, env = process.env) {
  const allowed = parseAllowedOrigins(env);
  if (!allowed.length) {
    // Unset allowlist: permissive reflection (existing Hostinger / local behavior).
    return true;
  }
  if (!origin || allowed.includes(origin)) {
    return true;
  }
  const isProd = String(env.NODE_ENV || "").toLowerCase() === "production";
  if (!isProd && isDevLanBrowserOrigin(origin)) {
    return true;
  }
  return false;
}

module.exports = {
  parseAllowedOrigins,
  isDevLanBrowserOrigin,
  resolveCorsOriginOption,
};
