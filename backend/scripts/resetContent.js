require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const readline = require("readline");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const Assignment = require("../models/Assignment");
const Submission = require("../models/Submission");
const Message = require("../models/Message");
const Notification = require("../models/Notification");
const PushSubscription = require("../models/PushSubscription");

const uploadsDir = path.join(__dirname, "..", "uploads");

function clearUploadFiles() {
  const folders = ["assignments", "submissions", "profilePictures", "messages", "others"];
  for (const folder of folders) {
    const dir = path.join(uploadsDir, folder);
    fs.mkdirSync(dir, { recursive: true });
    for (const name of fs.readdirSync(dir)) {
      const target = path.join(dir, name);
      if (fs.statSync(target).isFile()) fs.unlinkSync(target);
    }
  }
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question("Type RESET to remove all assignments, submissions, messages and notifications (users/profiles stay): ", resolve));
  rl.close();
  if (answer.trim() !== "RESET") {
    console.log("Reset cancelled. Nothing was deleted from MongoDB.");
    return;
  }

  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is missing in backend/.env");
  await mongoose.connect(process.env.MONGO_URI);

  const [assignments, submissions, messages, notifications, pushes] = await Promise.all([
    Assignment.deleteMany({}),
    Submission.deleteMany({}),
    Message.deleteMany({}),
    Notification.deleteMany({}),
    PushSubscription.deleteMany({}),
  ]);

  clearUploadFiles();
  console.log(JSON.stringify({
    deleted: {
      assignments: assignments.deletedCount || 0,
      submissions: submissions.deletedCount || 0,
      messages: messages.deletedCount || 0,
      notifications: notifications.deletedCount || 0,
      pushSubscriptions: pushes.deletedCount || 0,
    },
    users: "kept",
    profilePictures: "cleared from uploads; user profile records kept",
  }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Reset failed:", error.message);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exitCode = 1;
});
