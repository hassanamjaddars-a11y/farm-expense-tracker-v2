const mongoose = require("mongoose");

const voicemailSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      default: null,
      index: true,
    },

    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    audioUrl: {
      type: String,
      default: "",
    },

    audioDataUrl: {
      type: String,
      default: "",
    },

    durationSeconds: {
      type: Number,
      default: 0,
    },

    text: {
      type: String,
      default: "",
      trim: true,
    },

    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },

    readAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

voicemailSchema.index({ to: 1, createdAt: -1 });
voicemailSchema.index({ from: 1, createdAt: -1 });

module.exports =
  mongoose.models.Voicemail ||
  mongoose.model("Voicemail", voicemailSchema);