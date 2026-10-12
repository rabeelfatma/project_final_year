const Notification = require("../models/Notification");
const PushSubscription = require("../models/PushSubscription");
const { webpush, publicKey } = require("../config/push");

exports.list = async (req, res) => {
  try {
    const rows = await Notification.find({ recipient: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Unable to load notifications", error: error.message });
  }
};

exports.markAllRead = async (req, res) => {
  try {
    await Notification.updateMany({ recipient: req.user._id, read: false }, { $set: { read: true } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: "Unable to update notifications", error: error.message });
  }
};

exports.markOneRead = async (req, res) => {
  try {
    const updated = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { $set: { read: true } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: "Notification not found." });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: "Unable to update notification", error: error.message });
  }
};


exports.remove = async (req, res) => {
  try {
    const deleted = await Notification.findOneAndDelete({ _id: req.params.id, recipient: req.user._id });
    if (!deleted) return res.status(404).json({ message: "Notification not found." });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: "Unable to delete notification", error: error.message });
  }
};

exports.clearAll = async (req, res) => {
  try {
    const result = await Notification.deleteMany({ recipient: req.user._id });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ message: "Unable to clear notifications", error: error.message });
  }
};

exports.publicKey = (_req, res) => res.json({ publicKey });

exports.subscribe = async (req, res) => {
  try {
    const subscription = req.body;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ message: "Invalid push subscription" });
    }

    await PushSubscription.findOneAndUpdate(
      { user: req.user._id, "subscription.endpoint": subscription.endpoint },
      { user: req.user._id, subscription },
      { upsert: true, new: true }
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: "Unable to save push subscription", error: error.message });
  }
};

exports.create = async ({ recipient, title, message, type = "system", meta = {}, url = "/" }) => {
  if (!recipient) return null;

  const notification = await Notification.create({ recipient, title, message, type, meta });
  const subscriptions = await PushSubscription.find({ user: recipient });
  const payload = JSON.stringify({
    title,
    body: message,
    icon: "/notification-icon.png",
    badge: "/notification-icon.png",
    tag: `quickcheck-${type}`,
    url,
  });

  await Promise.all(subscriptions.map(async (item) => {
    try {
      await webpush.sendNotification(item.subscription, payload);
    } catch (error) {
      if ([404, 410].includes(error.statusCode)) {
        await PushSubscription.deleteOne({ _id: item._id });
      }
    }
  }));

  return notification;
};


exports.unsubscribe = async (req, res) => {
  try {
    const endpoint = String(req.body?.endpoint || "");
    if (endpoint) await PushSubscription.deleteOne({ user: req.user._id, "subscription.endpoint": endpoint });
    else await PushSubscription.deleteMany({ user: req.user._id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: "Unable to disable browser notifications." });
  }
};
