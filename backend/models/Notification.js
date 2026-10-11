const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, default: "system" },
  read: { type: Boolean, default: false },
  meta: { type: Object, default: {} },
}, { timestamps: true });

module.exports = mongoose.model("Notification", notificationSchema);
