const mongoose = require("mongoose");
const Message = require("../models/Message");
const User = require("../models/User");
const ConversationPin = require("../models/ConversationPin");
const { create: createNotification } = require("./notificationController");
const storedFiles = require("../utils/storedFiles");

async function removeMessageFile(stored) {
  if (!stored) return;
  try {
    await storedFiles.remove(stored);
  } catch (_) {
    /* ignore missing/unsafe prior voice path */
  }
}

function previewText(message) {
  if (!message) return "";
  if (message.voiceFile) return "Voice message";
  return String(message.text || "").trim().slice(0, 120);
}

function peerIdFromMessage(message, me) {
  const senderId = String(message.sender?._id || message.sender);
  const recipientId = String(message.recipient?._id || message.recipient);
  const mine = String(me);
  if (senderId === mine) return recipientId;
  if (recipientId === mine) return senderId;
  return "";
}

exports.users = async (req, res) => {
  try {
    const me = req.user._id;
    const [users, pins, recent] = await Promise.all([
      User.find({ _id: { $ne: me } })
        .select("name email role registrationNumber profilePicture")
        .sort({ name: 1 })
        .lean(),
      ConversationPin.find({ owner: me, pinned: true }).select("peer pinnedAt").lean(),
      Message.find({ $or: [{ sender: me }, { recipient: me }] })
        .sort({ createdAt: -1 })
        .limit(500)
        .select("sender recipient text voiceFile read createdAt")
        .lean(),
    ]);

    const pinMap = new Map(
      pins.map((row) => [String(row.peer), row.pinnedAt || row.updatedAt || null])
    );
    const meta = new Map();
    for (const message of recent) {
      const peerId = peerIdFromMessage(message, me);
      if (!peerId) continue;
      const existing = meta.get(peerId) || {
        unreadCount: 0,
        lastMessagePreview: "",
        lastMessageAt: null,
      };
      if (!existing.lastMessageAt) {
        existing.lastMessagePreview = previewText(message);
        existing.lastMessageAt = message.createdAt || null;
      }
      const toMe =
        String(message.recipient?._id || message.recipient) === String(me) &&
        message.read === false;
      if (toMe) existing.unreadCount += 1;
      meta.set(peerId, existing);
    }

    const rows = users.map((user) => {
      const id = String(user._id);
      const info = meta.get(id) || {
        unreadCount: 0,
        lastMessagePreview: "",
        lastMessageAt: null,
      };
      return {
        ...user,
        pinned: pinMap.has(id),
        pinnedAt: pinMap.get(id) || null,
        unreadCount: info.unreadCount,
        lastMessagePreview: info.lastMessagePreview,
        lastMessageAt: info.lastMessageAt,
      };
    });

    rows.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      if (aTime !== bTime) return bTime - aTime;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });

    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: "Unable to load users" });
  }
};

exports.list = async (req, res) => {
  try {
    const rows = await Message.find({
      $or: [{ sender: req.user._id }, { recipient: req.user._id }],
    })
      .populate("sender", "name email role profilePicture")
      .populate("recipient", "name email role profilePicture")
      .sort({ createdAt: 1 })
      .limit(300);
    // Do not mark every conversation read on load — mark per peer when opened.
    res.json(
      rows.map((row) => ({
        ...row.toObject(),
        isMine: String(row.sender?._id || row.sender) === String(req.user._id),
      }))
    );
  } catch (e) {
    res.status(500).json({ message: "Unable to load messages" });
  }
};

exports.markConversationRead = async (req, res) => {
  try {
    const peerId = String(req.body?.peerId || req.params.peerId || "").trim();
    if (!peerId || !mongoose.Types.ObjectId.isValid(peerId)) {
      return res.status(400).json({ message: "A valid conversation peer is required." });
    }
    if (String(peerId) === String(req.user._id)) {
      return res.status(400).json({ message: "Invalid conversation peer." });
    }
    const result = await Message.updateMany(
      { sender: peerId, recipient: req.user._id, read: false },
      { $set: { read: true } }
    );
    res.json({ success: true, updated: result.modifiedCount || 0 });
  } catch (e) {
    res.status(500).json({ message: "Unable to mark conversation as read." });
  }
};

exports.listPins = async (req, res) => {
  try {
    const pins = await ConversationPin.find({ owner: req.user._id, pinned: true })
      .select("peer pinnedAt")
      .lean();
    res.json(
      pins.map((row) => ({
        peerId: String(row.peer),
        pinned: true,
        pinnedAt: row.pinnedAt || null,
      }))
    );
  } catch (e) {
    res.status(500).json({ message: "Unable to load pinned conversations." });
  }
};

exports.setPin = async (req, res) => {
  try {
    const peerId = String(req.params.peerId || "").trim();
    if (!peerId || !mongoose.Types.ObjectId.isValid(peerId)) {
      return res.status(400).json({ message: "A valid peer id is required." });
    }
    if (String(peerId) === String(req.user._id)) {
      return res.status(400).json({ message: "You cannot pin yourself." });
    }
    const peer = await User.findById(peerId).select("_id");
    if (!peer) return res.status(404).json({ message: "User not found." });

    const pinned = req.body?.pinned !== false && req.body?.pinned !== "false";
    if (!pinned) {
      await ConversationPin.findOneAndDelete({
        owner: req.user._id,
        peer: peerId,
      });
      return res.json({ success: true, peerId, pinned: false });
    }

    const row = await ConversationPin.findOneAndUpdate(
      { owner: req.user._id, peer: peerId },
      {
        $set: { pinned: true, pinnedAt: new Date() },
        $setOnInsert: { owner: req.user._id, peer: peerId },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();

    res.json({
      success: true,
      peerId: String(row.peer),
      pinned: true,
      pinnedAt: row.pinnedAt || null,
    });
  } catch (e) {
    res.status(500).json({ message: "Unable to update pin.", error: e.message });
  }
};

exports.sendText = async (req,res) => {
  try {
    const recipient = await User.findById(req.body.recipient).select("_id name role");
    if (!recipient || String(recipient._id) === String(req.user._id)) return res.status(400).json({message:"Choose a valid recipient."});
    const text = String(req.body.text || "").trim();
    if (!text) return res.status(400).json({message:"Message cannot be empty."});
    const message = await Message.create({sender:req.user._id,recipient:recipient._id,text});
    await createNotification({
      recipient: recipient._id,
      title: `New message from ${req.user.name}`,
      message: text.slice(0,120),
      type:"message",
      meta:{messageId:message._id},
      url:"/dashboard/" + recipient.role
    });
    res.status(201).json(message);
  } catch(e) { res.status(500).json({message:"Message could not be sent",error:e.message}); }
};

exports.sendVoice = async (req,res) => {
  try {
    if (!req.file) return res.status(400).json({message:"Voice recording is missing."});
    const recipient = await User.findById(req.body.recipient).select("_id name role");
    if (!recipient || String(recipient._id) === String(req.user._id)) return res.status(400).json({message:"Choose a valid recipient."});
    const voiceFile = `uploads/messages/${req.file.filename}`;
    // Store a player-safe MIME (strip codecs=…); browsers need a plain audio/* type.
    const rawMime = String(req.file.mimetype || "audio/webm").split(";")[0].trim() || "audio/webm";
    const mimeType = rawMime === "video/webm" ? "audio/webm" : rawMime;
    const message = await Message.create({
      sender:req.user._id, recipient:recipient._id, voiceFile,
      originalFileName:req.file.originalname || "voice-message.webm",
      mimeType
    });
    await createNotification({
      recipient:recipient._id,
      title:`Voice message from ${req.user.name}`,
      message:"You received a new voice message.",
      type:"message",
      meta:{messageId:message._id},
      url:"/dashboard/" + recipient.role
    });
    res.status(201).json(message);
  } catch(e) { res.status(500).json({message:"Voice message could not be sent",error:e.message}); }
};


exports.updateText = async (req,res) => {
  try {
    const text = String(req.body.text || "").trim();
    if (!text) return res.status(400).json({message:"Message cannot be empty."});
    const message = await Message.findOne({ _id:req.params.id, sender:req.user._id });
    if (!message) return res.status(404).json({message:"Message not found or you are not the sender."});
    if (message.voiceFile) return res.status(400).json({message:"Voice messages cannot be edited."});
    message.text = text;
    message.editedAt = new Date();
    await message.save();
    res.json(message);
  } catch(e) { res.status(500).json({message:"Message could not be edited",error:e.message}); }
};


exports.removeMany = async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean).slice(0, 200) : [];
    if (!ids.length) return res.status(400).json({ message: "No messages selected." });

    const rows = await Message.find({
      _id: { $in: ids },
      $or: [{ sender: req.user._id }, { recipient: req.user._id }]
    });

    for (const message of rows) {
      await removeMessageFile(message.voiceFile);
    }

    await Message.deleteMany({ _id: { $in: rows.map((row) => row._id) } });
    res.json({ success: true, deleted: rows.length });
  } catch (e) {
    res.status(500).json({ message: "Messages could not be deleted", error: e.message });
  }
};

exports.clearAll = async (req, res) => {
  try {
    const rows = await Message.find({ $or: [{ sender: req.user._id }, { recipient: req.user._id }] });
    for (const message of rows) {
      await removeMessageFile(message.voiceFile);
    }
    await Message.deleteMany({ $or: [{ sender: req.user._id }, { recipient: req.user._id }] });
    res.json({ success: true, deleted: rows.length });
  } catch (e) {
    res.status(500).json({ message: "Messages could not be cleared", error: e.message });
  }
};

exports.remove = async (req,res) => {
  try {
    const message = await Message.findOne({
      _id:req.params.id,
      $or:[{sender:req.user._id},{recipient:req.user._id}]
    });
    if (!message) return res.status(404).json({message:"Message not found."});
    await removeMessageFile(message.voiceFile);
    await message.deleteOne();
    res.json({success:true,message:"Message deleted."});
  } catch(e) { res.status(500).json({message:"Message could not be deleted",error:e.message}); }
};
