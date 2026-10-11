const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  text: { type: String, default: "" },
  voiceFile: { type: String, default: "" },
  originalFileName: { type: String, default: "" },
  mimeType: { type: String, default: "" },
  read: { type: Boolean, default: false },
  editedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model("Message", messageSchema);
