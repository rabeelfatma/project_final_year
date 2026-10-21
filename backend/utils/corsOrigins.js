/**
 * CORS origin allowlist helpers.
 *
 * The production frontend origin is always allowed (exact match):
 *   https://quick-check-hub-frontend.vercel.app
 * CLIENT_ORIGIN / FRONTEND_URL may add more exact origins.
 * Non-production also allows loopback and private-LAN browser origins so
 * laptop and same-Wi-Fi mobile testing work without listing the laptop IP.
 * Every other origin is rejected. Missing Origin (non-browser clients) is allowed.
 * Decisions use the Origin header only — never Host or X-Forwarded-Host.
 */

const {
  isLoopbackHostname,
  isPrivateLanHostname,
} = require("./publicAppUrl");

const PRODUCTION_FRONTEND_ORIGIN = "https://quick-check-hub-frontend.vercel.app";

function canonicalOrigin(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

function parseAllowedOrigins(env = process.env) {
  const list = String(env.CLIENT_ORIGIN || env.FRONTEND_URL || "")
    .split(",")
    .map((s) => canonicalOrigin(s))
    .filter(Boolean);
  if (!list.includes(PRODUCTION_FRONTEND_ORIGIN)) {
    list.push(PRODUCTION_FRONTEND_ORIGIN);
  }
  return list;
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
 * @returns {true | false}
 *   true  = reflect this Origin (or allow a missing Origin)
 *   false = do not grant CORS to this Origin
 */
function resolveCorsOriginOption(origin, env = process.env) {
  if (!origin) return true;
  const normalized = canonicalOrigin(origin);
  if (parseAllowedOrigins(env).includes(normalized)) return true;
  const isProd = String(env.NODE_ENV || "").toLowerCase() === "production";
  if (!isProd && isDevLanBrowserOrigin(normalized)) return true;
  return false;
}

function buildCorsOptions(env = process.env) {
  return {
    origin(origin, callback) {
      callback(null, resolveCorsOriginOption(origin, env));
    },
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "Accept", "X-Requested-With"],
    exposedHeaders: ["Content-Disposition"],
    optionsSuccessStatus: 204,
    maxAge: 600,
  };
}

module.exports = {
  PRODUCTION_FRONTEND_ORIGIN,
  parseAllowedOrigins,
  isDevLanBrowserOrigin,
  resolveCorsOriginOption,
  buildCorsOptions,
};
