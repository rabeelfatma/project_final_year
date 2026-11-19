const AIChat = require("../models/AIChat");
const { sanitizeArtifacts } = require("../utils/artifactDownloadUrl");

const validRole = (role) => ["admin", "teacher", "student"].includes(role);
const normalizeMessages = (messages) => (Array.isArray(messages) ? messages : []).slice(-500).map((m) => ({
  id: String(m?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
  from: ["user", "ai", "system"].includes(m?.from) ? m.from : "ai",
  text: String(m?.text || "").slice(0, 100000),
  attachments: Array.isArray(m?.attachments) ? m.attachments.slice(0, 40).map((x) => String(x).slice(0, 255)) : [],
  // Strip crafted external downloadUrl values so persisted history cannot reintroduce token leaks.
  artifacts: sanitizeArtifacts(m?.artifacts),
  createdAt: m?.createdAt ? new Date(m.createdAt) : new Date()
}));

const sanitizeStoredMessages = (messages) => (Array.isArray(messages) ? messages : []).map((m) => ({
  ...m,
  artifacts: sanitizeArtifacts(m?.artifacts),
}));

exports.normalizeMessages = normalizeMessages;

exports.list = async (req, res) => {
  try {
    const role = String(req.query.role || req.user.role);
    if (!validRole(role) || role !== req.user.role) return res.status(403).json({ message: "You can only access your own role's chat history." });
    const chats = await AIChat.find({ owner: req.user._id, role })
      .sort({ pinned: -1, updatedAt: -1 })
      .limit(200)
      .lean();
    res.json(chats.map((chat) => ({
      id: chat.clientId,
      title: chat.title,
      pinned: Boolean(chat.pinned),
      messages: sanitizeStoredMessages(chat.messages || []),
      updatedAt: chat.updatedAt,
    })));
  } catch (error) {
    console.error("AI chat history load failed:", error);
    res.status(500).json({ message: "Unable to load chat history." });
  }
};

exports.upsert = async (req, res) => {
  try {
    const role = String(req.body.role || req.user.role);
    const clientId = String(req.params.clientId || "").trim();
    if (!validRole(role) || role !== req.user.role) return res.status(403).json({ message: "You can only save chats for your own role." });
    if (!clientId || clientId.length > 100) return res.status(400).json({ message: "Invalid chat ID." });
    const title = String(req.body.title || "New chat").trim().slice(0, 120) || "New chat";
    const messages = normalizeMessages(req.body.messages);
    const setFields = { title, messages, updatedAt: new Date() };
    // Preserve pinned unless the client explicitly sends a boolean.
    if (typeof req.body.pinned === "boolean") {
      setFields.pinned = req.body.pinned;
    }
    const chat = await AIChat.findOneAndUpdate(
      { owner: req.user._id, role, clientId },
      { $set: setFields, $setOnInsert: { owner: req.user._id, role, clientId, pinned: false } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();
    res.json({
      success: true,
      chat: {
        id: chat.clientId,
        title: chat.title,
        pinned: Boolean(chat.pinned),
        messages: chat.messages,
        updatedAt: chat.updatedAt,
      },
    });
  } catch (error) {
    console.error("AI chat save failed:", error);
    res.status(500).json({ message: "Unable to save chat history." });
  }
};

/** Rename and/or pin without rewriting the full message payload. */
exports.patchMeta = async (req, res) => {
  try {
    const clientId = String(req.params.clientId || "").trim();
    if (!clientId || clientId.length > 100) {
      return res.status(400).json({ message: "Invalid chat ID." });
    }
    const updates = { updatedAt: new Date() };
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "title")) {
      updates.title = String(req.body.title || "New chat").trim().slice(0, 120) || "New chat";
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "pinned")) {
      updates.pinned = Boolean(req.body.pinned);
    }
    if (!Object.prototype.hasOwnProperty.call(updates, "title") && !Object.prototype.hasOwnProperty.call(updates, "pinned")) {
      return res.status(400).json({ message: "Provide title and/or pinned." });
    }
    const chat = await AIChat.findOneAndUpdate(
      { owner: req.user._id, role: req.user.role, clientId },
      { $set: updates },
      { new: true }
    ).lean();
    if (!chat) return res.status(404).json({ message: "Chat not found." });
    res.json({
      success: true,
      chat: {
        id: chat.clientId,
        title: chat.title,
        pinned: Boolean(chat.pinned),
        updatedAt: chat.updatedAt,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Unable to update chat." });
  }
};

exports.remove = async (req, res) => {
  try {
    const result = await AIChat.findOneAndDelete({ owner: req.user._id, role: req.user.role, clientId: String(req.params.clientId) });
    if (!result) return res.status(404).json({ message: "Chat not found." });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: "Unable to delete chat." });
  }
};

exports.removeMany = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? [...new Set(req.body.ids.map(String))].slice(0, 200) : [];
    if (!ids.length) return res.status(400).json({ message: "Select at least one chat." });
    const result = await AIChat.deleteMany({ owner: req.user._id, role: req.user.role, clientId: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ message: "Unable to delete selected chats." });
  }
};
