const mongoose = require("mongoose");

const callLogSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      default: null,
      index: true,
    },

    caller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    callType: {
      type: String,
      enum: ["audio", "video"],
      default: "audio",
    },

    status: {
      type: String,
      enum: ["started", "completed", "missed", "rejected", "cancelled"],
      default: "started",
      index: true,
    },

    startedAt: {
      type: Date,
      default: Date.now,
    },

    endedAt: {
      type: Date,
      default: null,
    },

    durationSeconds: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

callLogSchema.index({ participants: 1, createdAt: -1 });

module.exports =
  mongoose.models.CallLog ||
  mongoose.model("CallLog", callLogSchema);