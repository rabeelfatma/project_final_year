const mongoose = require("mongoose");

/**
 * Per-user pin preference for a 1:1 messaging peer.
 * There is no Conversation collection — messages remain flat; pins are owner-scoped.
 */
const conversationPinSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    peer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    pinned: {
      type: Boolean,
      default: true,
    },
    pinnedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

conversationPinSchema.index({ owner: 1, peer: 1 }, { unique: true });

module.exports = mongoose.model("ConversationPin", conversationPinSchema);
