const mongoose = require("mongoose");

const attachmentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["image", "file", "audio", "video"],
      default: "file",
    },

    name: {
      type: String,
      default: "",
    },

    url: {
      type: String,
      default: "",
    },

    dataUrl: {
      type: String,
      default: "",
    },

    size: {
      type: Number,
      default: 0,
    },

    mimeType: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const readBySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    readAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },

    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    text: {
      type: String,
      default: "",
      trim: true,
    },

    messageType: {
      type: String,
      enum: ["text", "image", "file", "voice", "system"],
      default: "text",
    },

    attachments: {
      type: [attachmentSchema],
      default: [],
    },

    readBy: {
      type: [readBySchema],
      default: [],
    },

    clientId: {
      type: String,
      default: "",
      trim: true,
    },

    editedAt: {
      type: Date,
      default: null,
    },

    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });

module.exports =
  mongoose.models.Message ||
  mongoose.model("Message", messageSchema);