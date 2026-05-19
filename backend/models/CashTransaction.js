const mongoose = require("mongoose");

const CASH_TRANSACTION_TYPES = [
  "opening_balance",
  "money_in",
  "expense",
  "worker_advance",
  "worker_recovery",
  "sale_income",
];

const cashTransactionSchema = new mongoose.Schema(
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
    type: {
      type: String,
      enum: CASH_TRANSACTION_TYPES,
      required: true,
      index: true,
    },
    direction: {
      type: String,
      enum: ["in", "out"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    note: {
      type: String,
      default: "",
      trim: true,
    },
    workerName: {
      type: String,
      default: "",
      trim: true,
    },
    transactionDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    sourceKind: {
      type: String,
      enum: ["manual", "sale", "expense", "worker", "system"],
      default: "manual",
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    isSystemGenerated: {
      type: Boolean,
      default: false,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

cashTransactionSchema.index(
  { user: 1, clientId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      clientId: { $type: "string" },
    },
  }
);

cashTransactionSchema.index(
  { user: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: "opening_balance",
    },
  }
);

cashTransactionSchema.index({ user: 1, transactionDate: -1, createdAt: -1 });

module.exports =
  mongoose.models.CashTransaction ||
  mongoose.model("CashTransaction", cashTransactionSchema);