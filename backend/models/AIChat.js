const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema({
  id: { type: String, required: true },
  from: { type: String, enum: ["user", "ai", "system"], required: true },
  text: { type: String, default: "" },
  attachments: { type: [String], default: [] },
  artifacts: { type: [mongoose.Schema.Types.Mixed], default: [] },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const aiChatSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  role: { type: String, enum: ["admin", "teacher", "student"], required: true },
  clientId: { type: String, required: true },
  title: { type: String, default: "New chat", maxlength: 120 },
  pinned: { type: Boolean, default: false },
  messages: { type: [chatMessageSchema], default: [] },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

aiChatSchema.index({ owner: 1, role: 1, clientId: 1 }, { unique: true });
aiChatSchema.index({ owner: 1, role: 1, updatedAt: -1 });
aiChatSchema.index({ owner: 1, role: 1, pinned: -1, updatedAt: -1 });

module.exports = mongoose.model("AIChat", aiChatSchema);
