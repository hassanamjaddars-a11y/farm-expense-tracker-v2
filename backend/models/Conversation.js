const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },

    password: {
      type: String,
      required: true,
    },

    phone: {
      type: String,
      default: "",
      trim: true,
    },

    companyName: {
      type: String,
      default: "",
      trim: true,
    },

    profilePhoto: {
      type: String,
      default: "",
    },

    appRole: {
      type: String,
      enum: ["owner", "manager", "viewer", "admin"],
      default: "owner",
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    lastActiveAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

userSchema.index({ name: "text", email: "text" });

module.exports =
  mongoose.models.User ||
  mongoose.model("User", userSchema);