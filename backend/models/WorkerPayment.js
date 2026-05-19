const mongoose = require("mongoose");

const workerPaymentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    clientId: {
      type: String,
      trim: true,
    },

    workerProfileId: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkerCategory",
      required: true,
    },

    workerName: {
      type: String,
      required: true,
      trim: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    paymentDate: {
      type: Date,
      default: Date.now,
      index: true,
    },

    cashTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CashTransaction",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

workerPaymentSchema.index(
  { user: 1, clientId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      clientId: { $type: "string" },
    },
  }
);

workerPaymentSchema.index({ user: 1, workerProfileId: 1, paymentDate: -1 });
workerPaymentSchema.index({ user: 1, paymentDate: -1, createdAt: -1 });

module.exports =
  mongoose.models.WorkerPayment ||
  mongoose.model("WorkerPayment", workerPaymentSchema);