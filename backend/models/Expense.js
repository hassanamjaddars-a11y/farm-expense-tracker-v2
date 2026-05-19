const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema(
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

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExpenseCategory",
      required: true,
    },

    personName: {
      type: String,
      default: "",
      trim: true,
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

    expenseDate: {
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

expenseSchema.index(
  { user: 1, clientId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      clientId: { $type: "string" },
    },
  }
);

expenseSchema.index({ user: 1, expenseDate: -1, createdAt: -1 });

module.exports =
  mongoose.models.Expense || mongoose.model("Expense", expenseSchema);