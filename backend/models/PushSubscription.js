const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  subscription: { type: Object, required: true },
  createdAt: { type: Date, default: Date.now },
});

schema.index({ user: 1, "subscription.endpoint": 1 }, { unique: true });
module.exports = mongoose.model("PushSubscription", schema);
