const mongoose = require("mongoose");

const workerCategorySchema = new mongoose.Schema(
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
    name: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

workerCategorySchema.index(
  { user: 1, clientId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      clientId: { $type: "string" },
    },
  }
);

workerCategorySchema.index({ user: 1, name: 1 }, { unique: true });

module.exports =
  mongoose.models.WorkerCategory ||
  mongoose.model("WorkerCategory", workerCategorySchema);