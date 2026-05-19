const mongoose = require("mongoose");

const workerSplitSchema = new mongoose.Schema(
  {
    workerProfileId: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    workerName: {
      type: String,
      required: true,
      trim: true,
    },

    percentageOfWorkerPool: {
      type: Number,
      default: 0,
    },

    percentageOfTotalSale: {
      type: Number,
      default: 0,
    },

    amount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

const saleSchema = new mongoose.Schema(
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

    productName: {
      type: String,
      required: true,
      trim: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 0,
    },

    unit: {
      type: String,
      enum: ["murh", "kg", "maund"],
      default: "murh",
    },

    unitWeightKg: {
      type: Number,
      default: 20,
      min: 0,
    },

    totalWeightKg: {
      type: Number,
      default: 0,
      min: 0,
    },

    rate: {
      type: Number,
      required: true,
      min: 0,
    },

    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    ownerSharePercentage: {
      type: Number,
      default: 70,
      min: 0,
      max: 100,
    },

    workerSharePercentage: {
      type: Number,
      default: 30,
      min: 0,
      max: 100,
    },

    ownerAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    workersTotalAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    distributionMode: {
      type: String,
      enum: ["equal", "custom_percentage", "custom_amount"],
      default: "equal",
    },

    workerSplits: {
      type: [workerSplitSchema],
      default: [],
    },

    saleDate: {
      type: Date,
      default: Date.now,
      index: true,
    },

    note: {
      type: String,
      default: "",
      trim: true,
    },

    billImageUrls: {
      type: [String],
      default: [],
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

saleSchema.index(
  { user: 1, clientId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      clientId: { $type: "string" },
    },
  }
);

saleSchema.index({ user: 1, saleDate: -1, createdAt: -1 });

module.exports = mongoose.models.Sale || mongoose.model("Sale", saleSchema);