const Message = require("../models/Message");
const User = require("../models/User");
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

exports.users = async (req,res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user._id } })
      .select("name email role registrationNumber")
      .sort({ name: 1 });
    res.json(users);
  } catch (e) { res.status(500).json({message:"Unable to load users"}); }
};

exports.list = async (req,res) => {
  try {
    const rows = await Message.find({ $or: [{sender:req.user._id},{recipient:req.user._id}] })
      .populate("sender","name email role profilePicture")
      .populate("recipient","name email role profilePicture")
      .sort({createdAt:1}).limit(300);
    await Message.updateMany({recipient:req.user._id,read:false},{$set:{read:true}});
    res.json(rows.map((row) => ({
      ...row.toObject(),
      isMine: String(row.sender?._id || row.sender) === String(req.user._id),
    })));
  } catch(e) { res.status(500).json({message:"Unable to load messages"}); }
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
    const message = await Message.create({
      sender:req.user._id, recipient:recipient._id, voiceFile,
      originalFileName:req.file.originalname || "voice-message.webm",
      mimeType:req.file.mimetype || "audio/webm"
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
