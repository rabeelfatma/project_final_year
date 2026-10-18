const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const webpush = require("web-push");

const keyFile = path.join(__dirname, "..", ".vapid.json");
const DEFAULT_VAPID_SUBJECT = "mailto:admin@quickcheckhub.local";

/**
 * Prefer VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY from the environment (required on Vercel).
 * Fall back to .vapid.json for Hostinger/local. Never write key files on Vercel
 * (read-only FS) or when disk writes fail.
 */
function loadVapidKeys() {
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || "").trim();
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || "").trim();
  if (publicKey && privateKey) {
    return { publicKey, privateKey, source: "env" };
  }

  try {
    const fromFile = JSON.parse(fs.readFileSync(keyFile, "utf8"));
    if (fromFile?.publicKey && fromFile?.privateKey) {
      return {
        publicKey: fromFile.publicKey,
        privateKey: fromFile.privateKey,
        source: "file",
      };
    }
  } catch (_) {
    /* fall through */
  }

  if (process.env.VERCEL === "1") {
    console.warn(
      "VAPID keys missing on Vercel. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY; push is disabled until configured."
    );
    return { publicKey: "", privateKey: "", source: "missing" };
  }

  const generated = webpush.generateVAPIDKeys();
  try {
    fs.writeFileSync(keyFile, JSON.stringify(generated, null, 2));
  } catch (error) {
    console.warn("Could not persist VAPID keys to disk:", error.message);
  }
  return {
    publicKey: generated.publicKey,
    privateKey: generated.privateKey,
    source: "generated",
  };
}

/**
 * web-push accepts only https: or mailto: subjects (see vapid-helper validateSubject).
 * Returns null when the configured value is present but invalid — never invent a replacement.
 */
function resolveVapidSubject() {
  const configured = String(process.env.VAPID_SUBJECT || "").trim();
  if (!configured) {
    return { ok: true, subject: DEFAULT_VAPID_SUBJECT, fromEnv: false };
  }

  let parsed;
  try {
    parsed = new URL(configured);
  } catch (_) {
    return { ok: false, subject: null, fromEnv: true };
  }

  if (!["https:", "mailto:"].includes(parsed.protocol)) {
    return { ok: false, subject: null, fromEnv: true };
  }

  return { ok: true, subject: configured, fromEnv: true };
}

const keys = loadVapidKeys();
let vapidConfigured = false;

if (keys.publicKey && keys.privateKey) {
  const resolved = resolveVapidSubject();
  if (!resolved.ok) {
    console.warn(
      "VAPID_SUBJECT must be a valid mailto: or https: URL. Web push is disabled until VAPID_SUBJECT is corrected."
    );
  } else {
    try {
      webpush.setVapidDetails(resolved.subject, keys.publicKey, keys.privateKey);
      vapidConfigured = true;
    } catch (_) {
      // Do not echo subject/keys from library errors (may include configured values).
      console.warn(
        "Web push VAPID setup failed. Web push is disabled until VAPID configuration is corrected."
      );
    }
  }
}

module.exports = {
  publicKey: keys.publicKey,
  webpush,
  vapidConfigured,
};
