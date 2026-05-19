const router = require("express").Router();
const User = require("../models/User");
const auth = require("../middleware/auth");

const escapeRegex = (value = "") => {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// Search users by name or email
router.get("/search", auth, async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();

    if (!q || q.length < 2) {
      return res.json({ items: [] });
    }

    const safe = escapeRegex(q);
    const regex = new RegExp(safe, "i");

    const users = await User.find({
      _id: { $ne: req.user._id },
      isActive: true,
      $or: [{ name: regex }, { email: regex }],
    })
      .select("name email profilePhoto companyName appRole")
      .limit(15)
      .sort({ name: 1 });

    res.json({
      items: users.map((user) => ({
        id: user._id,
        name: user.name,
        email: user.email,
        profilePhoto: user.profilePhoto || "",
        companyName: user.companyName || "",
        appRole: user.appRole || "owner",
      })),
    });
  } catch (err) {
    console.error("USER SEARCH error:", err);
    res.status(500).json({ error: "Failed to search users" });
  }
});

module.exports = router;