const mongoose = require("mongoose");

const userSettingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    murhWeightKg: {
      type: Number,
      default: 40,
      min: 0.0001,
    },
    defaultOwnerSharePercentage: {
      type: Number,
      default: 70,
      min: 0,
      max: 100,
    },
    defaultWorkerSharePercentage: {
      type: Number,
      default: 30,
      min: 0,
      max: 100,
    },
    currencyLabel: {
      type: String,
      default: "Rs",
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.UserSetting ||
  mongoose.model("UserSetting", userSettingSchema);