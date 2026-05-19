const router = require("express").Router();
const CashTransaction = require("../models/CashTransaction");
const auth = require("../middleware/auth");

const SUPPORTED_TYPES = [
  "opening_balance",
  "money_in",
  "expense",
  "worker_advance",
  "worker_recovery",
  "sale_income",
];

const IN_TYPES = new Set([
  "opening_balance",
  "money_in",
  "worker_recovery",
  "sale_income",
]);

const OUT_TYPES = new Set([
  "expense",
  "worker_advance",
]);

const WORKER_TYPES = new Set([
  "worker_advance",
  "worker_recovery",
]);

const cleanString = (value) => String(value || "").trim();

const cleanNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const normalizeDate = (value) => {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const getDirectionForType = (type) => {
  if (IN_TYPES.has(type)) return "in";
  if (OUT_TYPES.has(type)) return "out";
  return "in";
};

const buildSummary = (items) => {
  const safeItems = Array.isArray(items) ? items : [];

  const totals = safeItems.reduce(
    (acc, item) => {
      const amount = round2(item?.amount || 0);
      const type = item?.type || "";

      if (type === "opening_balance") {
        acc.openingBalance += amount;
      } else if (type === "money_in") {
        acc.totalMoneyIn += amount;
      } else if (type === "sale_income") {
        acc.totalSalesIn += amount;
        acc.totalMoneyIn += amount;
      } else if (type === "worker_recovery") {
        acc.totalWorkerRecoveries += amount;
        acc.totalMoneyIn += amount;
      } else if (type === "expense") {
        acc.totalExpensesOut += amount;
        acc.totalMoneyOut += amount;
      } else if (type === "worker_advance") {
        acc.totalWorkerAdvances += amount;
        acc.totalMoneyOut += amount;
      }

      return acc;
    },
    {
      openingBalance: 0,
      totalMoneyIn: 0,
      totalMoneyOut: 0,
      totalSalesIn: 0,
      totalExpensesOut: 0,
      totalWorkerAdvances: 0,
      totalWorkerRecoveries: 0,
    }
  );

  return {
    ...totals,
    currentBalance: round2(
      totals.openingBalance + totals.totalMoneyIn - totals.totalMoneyOut
    ),
    transactionCount: safeItems.length,
  };
};

router.get("/", auth, async (req, res) => {
  try {
    const items = await CashTransaction.find({ user: req.user._id })
      .sort({ transactionDate: -1, createdAt: -1 });

    res.json({
      items,
      summary: buildSummary(items),
    });
  } catch (err) {
    console.error("GET cash book error:", err);
    res.status(500).json({ error: "Failed to fetch cash book" });
  }
});

router.get("/summary", auth, async (req, res) => {
  try {
    const items = await CashTransaction.find({ user: req.user._id }).lean();
    res.json(buildSummary(items));
  } catch (err) {
    console.error("GET cash summary error:", err);
    res.status(500).json({ error: "Failed to fetch cash summary" });
  }
});

router.post("/", auth, async (req, res) => {
  try {
    const type = cleanString(req.body.type);
    const amount = round2(cleanNumber(req.body.amount));
    const description =
      cleanString(req.body.description) ||
      (type === "opening_balance" ? "Opening Balance" : "");
    const note = cleanString(req.body.note);
    const workerName = cleanString(req.body.workerName);
    const transactionDate = normalizeDate(req.body.transactionDate);
    const clientId = cleanString(req.body.clientId) || undefined;

    if (!SUPPORTED_TYPES.includes(type)) {
      return res.status(400).json({ error: "Invalid transaction type" });
    }

    if (amount <= 0) {
      return res.status(400).json({ error: "Valid amount is required" });
    }

    if (!description) {
      return res.status(400).json({ error: "Description is required" });
    }

    if (WORKER_TYPES.has(type) && !workerName) {
      return res.status(400).json({ error: "Worker name is required for this transaction type" });
    }

    if (clientId) {
      const existingByClientId = await CashTransaction.findOne({
        user: req.user._id,
        clientId,
      });

      if (existingByClientId) {
        return res.json(existingByClientId);
      }
    }

    if (type === "opening_balance") {
      const existingOpening = await CashTransaction.findOne({
        user: req.user._id,
        type: "opening_balance",
      });

      if (existingOpening) {
        existingOpening.amount = amount;
        existingOpening.description = description;
        existingOpening.note = note;
        existingOpening.workerName = "";
        existingOpening.transactionDate = transactionDate;
        existingOpening.direction = "in";
        existingOpening.sourceKind = "manual";
        existingOpening.isSystemGenerated = false;
        existingOpening.meta = {};

        await existingOpening.save();
        return res.json(existingOpening);
      }
    }

    const created = await CashTransaction.create({
      user: req.user._id,
      ...(clientId ? { clientId } : {}),
      type,
      direction: getDirectionForType(type),
      amount,
      description,
      note,
      workerName: WORKER_TYPES.has(type) ? workerName : "",
      transactionDate,
      sourceKind: "manual",
      isSystemGenerated: false,
      meta: {},
    });

    res.status(201).json(created);
  } catch (err) {
    console.error("POST cash transaction error:", err);

    if (err?.code === 11000) {
      return res.status(409).json({
        error: "Opening balance already exists. Edit it instead of adding another one.",
      });
    }

    res.status(500).json({ error: err?.message || "Failed to save cash transaction" });
  }
});

router.put("/:id", auth, async (req, res) => {
  try {
    const item = await CashTransaction.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!item) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    if (item.isSystemGenerated) {
      return res.status(409).json({
        error: "This transaction is system-generated and cannot be edited here.",
      });
    }

    const type = cleanString(req.body.type || item.type);
    const amount = round2(
      req.body.amount === undefined ? item.amount : cleanNumber(req.body.amount)
    );
    const description = cleanString(req.body.description || item.description);
    const note =
      req.body.note === undefined ? item.note : cleanString(req.body.note);
    const workerName =
      req.body.workerName === undefined
        ? item.workerName
        : cleanString(req.body.workerName);
    const transactionDate =
      req.body.transactionDate === undefined
        ? item.transactionDate
        : normalizeDate(req.body.transactionDate);

    if (!SUPPORTED_TYPES.includes(type)) {
      return res.status(400).json({ error: "Invalid transaction type" });
    }

    if (amount <= 0) {
      return res.status(400).json({ error: "Valid amount is required" });
    }

    if (!description) {
      return res.status(400).json({ error: "Description is required" });
    }

    if (WORKER_TYPES.has(type) && !workerName) {
      return res.status(400).json({ error: "Worker name is required for this transaction type" });
    }

    if (type === "opening_balance") {
      const existingOpening = await CashTransaction.findOne({
        user: req.user._id,
        type: "opening_balance",
        _id: { $ne: item._id },
      });

      if (existingOpening) {
        return res.status(409).json({
          error: "Only one opening balance is allowed per account.",
        });
      }
    }

    item.type = type;
    item.direction = getDirectionForType(type);
    item.amount = amount;
    item.description = description;
    item.note = note;
    item.workerName = WORKER_TYPES.has(type) ? workerName : "";
    item.transactionDate = transactionDate;

    await item.save();

    res.json(item);
  } catch (err) {
    console.error("PUT cash transaction error:", err);
    res.status(500).json({ error: err?.message || "Failed to update transaction" });
  }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    const item = await CashTransaction.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!item) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    if (item.isSystemGenerated) {
      return res.status(409).json({
        error: "This transaction is linked to another module and cannot be deleted here.",
      });
    }

    await item.deleteOne();

    res.json({ message: "Transaction deleted successfully" });
  } catch (err) {
    console.error("DELETE cash transaction error:", err);
    res.status(500).json({ error: "Failed to delete transaction" });
  }
});

module.exports = router;