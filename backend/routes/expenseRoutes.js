const router = require("express").Router();
const mongoose = require("mongoose");

const Expense = require("../models/Expense");
const ExpenseCategory = require("../models/ExpenseCategory");
const CashTransaction = require("../models/CashTransaction");
const auth = require("../middleware/auth");

const cleanString = (value) => String(value || "").trim();

const cleanNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const normalizeDate = (value) => {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const getIncomingDate = (body) => {
  return body.expenseDate || body.transactionDate || body.date || null;
};

async function resolveExpenseCategory({
  userId,
  categoryId,
  categoryName,
  categoryClientId,
}) {
  const cleanName = cleanString(categoryName);
  const cleanClientId = cleanString(categoryClientId);

  if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) {
    const byId = await ExpenseCategory.findOne({
      _id: categoryId,
      user: userId,
    });

    if (byId) return byId;
  }

  if (cleanClientId) {
    const byClientId = await ExpenseCategory.findOne({
      user: userId,
      clientId: cleanClientId,
    });

    if (byClientId) return byClientId;
  }

  if (cleanName) {
    const byName = await ExpenseCategory.findOne({
      user: userId,
      name: cleanName,
    });

    if (byName) return byName;

    const created = await ExpenseCategory.create({
      user: userId,
      ...(cleanClientId ? { clientId: cleanClientId } : {}),
      name: cleanName,
    });

    return created;
  }

  return null;
}

async function ensureExpenseCashTransaction(expense) {
  if (!expense) return null;

  const category = await ExpenseCategory.findOne({
    _id: expense.category,
    user: expense.user,
  });

  const amount = round2(cleanNumber(expense.amount));

  if (amount <= 0) {
    return null;
  }

  const categoryName = category?.name || "Expense";
  const description = cleanString(expense.description) || "Expense";
  const transactionDate = normalizeDate(expense.expenseDate || expense.createdAt);

  let cashTransaction = null;

  if (
    expense.cashTransactionId &&
    mongoose.Types.ObjectId.isValid(expense.cashTransactionId)
  ) {
    cashTransaction = await CashTransaction.findOne({
      _id: expense.cashTransactionId,
      user: expense.user,
    });
  }

  if (!cashTransaction) {
    cashTransaction = await CashTransaction.findOne({
      user: expense.user,
      sourceKind: "expense",
      sourceId: expense._id,
    });
  }

  const payload = {
    user: expense.user,
    type: "expense",
    direction: "out",
    amount,
    description: `${categoryName} - ${description}`,
    note: cleanString(expense.personName),
    workerName: "",
    transactionDate,
    sourceKind: "expense",
    sourceId: expense._id,
    isSystemGenerated: true,
    meta: {
      expenseId: expense._id,
      categoryId: expense.category,
      categoryName,
      personName: cleanString(expense.personName),
    },
  };

  if (!cashTransaction) {
    cashTransaction = await CashTransaction.create(payload);
  } else {
    cashTransaction.type = payload.type;
    cashTransaction.direction = payload.direction;
    cashTransaction.amount = payload.amount;
    cashTransaction.description = payload.description;
    cashTransaction.note = payload.note;
    cashTransaction.workerName = payload.workerName;
    cashTransaction.transactionDate = payload.transactionDate;
    cashTransaction.sourceKind = payload.sourceKind;
    cashTransaction.sourceId = payload.sourceId;
    cashTransaction.isSystemGenerated = payload.isSystemGenerated;
    cashTransaction.meta = payload.meta;

    await cashTransaction.save();
  }

  if (
    !expense.cashTransactionId ||
    String(expense.cashTransactionId) !== String(cashTransaction._id)
  ) {
    expense.cashTransactionId = cashTransaction._id;
    await expense.save();
  }

  return cashTransaction;
}

async function getPopulatedExpense(id) {
  return Expense.findById(id).populate("category", "name clientId");
}

router.get("/", auth, async (req, res) => {
  try {
    const data = await Expense.find({ user: req.user._id })
      .populate("category", "name clientId")
      .sort({ expenseDate: -1, createdAt: -1 });

    res.json(data);
  } catch (err) {
    console.error("GET expenses error:", err);
    res.status(500).json({ error: "Failed to fetch expenses" });
  }
});

router.post("/", auth, async (req, res) => {
  try {
    const {
      category,
      categoryName,
      categoryClientId,
      personName,
      amount,
      description,
      clientId,
    } = req.body;

    const cleanDescription = cleanString(description);
    const cleanAmount = round2(cleanNumber(amount));
    const cleanClientId = cleanString(clientId);
    const expenseDate = normalizeDate(getIncomingDate(req.body));

    if (!cleanDescription) {
      return res.status(400).json({ error: "Description is required" });
    }

    if (cleanAmount <= 0) {
      return res.status(400).json({ error: "Valid amount is required" });
    }

    const resolvedCategory = await resolveExpenseCategory({
      userId: req.user._id,
      categoryId: category,
      categoryName,
      categoryClientId,
    });

    if (!resolvedCategory) {
      return res.status(400).json({
        error: "Selected category does not exist for this user",
      });
    }

    if (cleanClientId) {
      const existing = await Expense.findOne({
        user: req.user._id,
        clientId: cleanClientId,
      });

      if (existing) {
        await ensureExpenseCashTransaction(existing);
        const populatedExisting = await getPopulatedExpense(existing._id);
        return res.json(populatedExisting);
      }
    }

    const expense = await Expense.create({
      user: req.user._id,
      ...(cleanClientId ? { clientId: cleanClientId } : {}),
      category: resolvedCategory._id,
      personName: cleanString(personName),
      amount: cleanAmount,
      description: cleanDescription,
      expenseDate,
    });

    await ensureExpenseCashTransaction(expense);

    const saved = await getPopulatedExpense(expense._id);
    res.status(201).json(saved);
  } catch (err) {
    console.error("POST expense error:", err);

    if (err?.code === 11000) {
      const cleanClientId = cleanString(req.body.clientId);

      if (cleanClientId) {
        const existing = await Expense.findOne({
          user: req.user._id,
          clientId: cleanClientId,
        });

        if (existing) {
          await ensureExpenseCashTransaction(existing);
          const populatedExisting = await getPopulatedExpense(existing._id);
          return res.json(populatedExisting);
        }
      }
    }

    res.status(500).json({ error: err?.message || "Failed to add expense" });
  }
});

router.put("/:id", auth, async (req, res) => {
  try {
    const {
      category,
      categoryName,
      categoryClientId,
      personName,
      amount,
      description,
    } = req.body;

    const cleanDescription = cleanString(description);
    const cleanAmount = round2(cleanNumber(amount));

    if (!cleanDescription) {
      return res.status(400).json({ error: "Description is required" });
    }

    if (cleanAmount <= 0) {
      return res.status(400).json({ error: "Valid amount is required" });
    }

    const expense = await Expense.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!expense) {
      return res.status(404).json({ error: "Expense not found" });
    }

    const resolvedCategory = await resolveExpenseCategory({
      userId: req.user._id,
      categoryId: category,
      categoryName,
      categoryClientId,
    });

    if (!resolvedCategory) {
      return res.status(400).json({
        error: "Selected category does not exist for this user",
      });
    }

    const incomingDate = getIncomingDate(req.body);

    expense.category = resolvedCategory._id;
    expense.personName = cleanString(personName);
    expense.amount = cleanAmount;
    expense.description = cleanDescription;

    if (incomingDate !== null) {
      expense.expenseDate = normalizeDate(incomingDate);
    } else if (!expense.expenseDate) {
      expense.expenseDate = expense.createdAt || new Date();
    }

    await expense.save();
    await ensureExpenseCashTransaction(expense);

    const updated = await getPopulatedExpense(expense._id);
    res.json(updated);
  } catch (err) {
    console.error("PUT expense error:", err);
    res.status(500).json({ error: err?.message || "Failed to update expense" });
  }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    const deleted = await Expense.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!deleted) {
      return res.status(404).json({ error: "Expense not found" });
    }

    const cashDeleteConditions = [
      {
        sourceKind: "expense",
        sourceId: deleted._id,
      },
    ];

    if (deleted.cashTransactionId) {
      cashDeleteConditions.push({
        _id: deleted.cashTransactionId,
      });
    }

    await CashTransaction.deleteMany({
      user: req.user._id,
      $or: cashDeleteConditions,
    });

    res.json({
      success: true,
      message: "Expense deleted successfully",
    });
  } catch (err) {
    console.error("DELETE expense error:", err);
    res.status(500).json({ error: "Failed to delete expense" });
  }
});

module.exports = router;