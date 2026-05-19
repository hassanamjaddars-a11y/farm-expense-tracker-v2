const router = require("express").Router();
const Model = require("../models/ExpenseCategory");
const Expense = require("../models/Expense");
const auth = require("../middleware/auth");

const normalizeName = (value) => String(value || "").trim();

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const findByName = async (userId, name, excludeId = null) => {
  if (!name) return null;

  const query = {
    user: userId,
    name: { $regex: new RegExp(`^${escapeRegex(name)}$`, "i") },
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  return Model.findOne(query);
};

router.get("/", auth, async (req, res) => {
  try {
    const data = await Model.find({ user: req.user._id }).sort({ name: 1 });
    res.json(data);
  } catch (err) {
    console.error("GET expense categories error:", err);
    res.status(500).json({ error: "Failed to fetch expense categories" });
  }
});

router.post("/", auth, async (req, res) => {
  try {
    const name = normalizeName(req.body.name);
    const clientId = normalizeName(req.body.clientId) || undefined;

    if (!name) {
      return res.status(400).json({ error: "Category name is required" });
    }

    if (clientId) {
      const existingByClientId = await Model.findOne({
        user: req.user._id,
        clientId,
      });

      if (existingByClientId) {
        return res.json(existingByClientId);
      }
    }

    const existingByName = await findByName(req.user._id, name);

    if (existingByName) {
      return res.json(existingByName);
    }

    const item = await Model.create({
      user: req.user._id,
      ...(clientId ? { clientId } : {}),
      name,
    });

    res.json(item);
  } catch (err) {
    console.error("POST expense category error:", err);

    const duplicate = err?.code === 11000;

    if (duplicate) {
      const name = normalizeName(req.body.name);
      const clientId = normalizeName(req.body.clientId) || undefined;

      const existing =
        (clientId
          ? await Model.findOne({ user: req.user._id, clientId })
          : null) ||
        (name ? await findByName(req.user._id, name) : null);

      if (existing) {
        return res.json(existing);
      }

      return res.status(409).json({
        error:
          "Category name is blocked by an old MongoDB global index. Delete legacy name_1 index from expensecategories in Atlas, then try again.",
      });
    }

    res.status(400).json({ error: "Category exists or invalid" });
  }
});

router.put("/:id", auth, async (req, res) => {
  try {
    const name = normalizeName(req.body.name);

    if (!name) {
      return res.status(400).json({ error: "Category name is required" });
    }

    const item = await Model.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!item) {
      return res.status(404).json({ error: "Category not found" });
    }

    const existingByName = await findByName(req.user._id, name, item._id);

    if (existingByName) {
      return res.status(409).json({ error: "Category name already exists" });
    }

    item.name = name;
    await item.save();

    res.json(item);
  } catch (err) {
    console.error("PUT expense category error:", err);

    if (err?.code === 11000) {
      return res.status(409).json({
        error:
          "Category name is blocked by an old MongoDB global index. Delete legacy name_1 index from expensecategories in Atlas, then try again.",
      });
    }

    res.status(400).json({ error: "Failed to update expense category" });
  }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    const item = await Model.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!item) {
      return res.status(404).json({ error: "Category not found" });
    }

    const inUseCount = await Expense.countDocuments({
      user: req.user._id,
      category: item._id,
    });

    if (inUseCount > 0) {
      return res.status(409).json({
        error:
          "This category is already used in expense records. Rename it instead, or remove the related expense records first.",
      });
    }

    await item.deleteOne();

    res.json({
      success: true,
      message: "Expense category deleted successfully",
    });
  } catch (err) {
    console.error("DELETE expense category error:", err);
    res.status(400).json({ error: "Failed to delete expense category" });
  }
});

module.exports = router;