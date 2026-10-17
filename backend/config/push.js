const fs = require("fs");
const path = require("path");
const webpush = require("web-push");

const keyFile = path.join(__dirname, "..", ".vapid.json");

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

const keys = loadVapidKeys();

if (keys.publicKey && keys.privateKey) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@quickcheckhub.local",
    keys.publicKey,
    keys.privateKey
  );
}

module.exports = {
  publicKey: keys.publicKey,
  webpush,
  vapidConfigured: Boolean(keys.publicKey && keys.privateKey),
};
