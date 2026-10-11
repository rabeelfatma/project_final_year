const fs = require("fs");
const path = require("path");
const webpush = require("web-push");

const keyFile = path.join(__dirname, "..", ".vapid.json");
let keys;

try {
  keys = JSON.parse(fs.readFileSync(keyFile, "utf8"));
} catch (_) {
  keys = webpush.generateVAPIDKeys();
  fs.writeFileSync(keyFile, JSON.stringify(keys, null, 2));
}

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || "mailto:admin@quickcheckhub.local",
  keys.publicKey,
  keys.privateKey
);

module.exports = { publicKey: keys.publicKey, webpush };
