const router = require("express").Router();
const mongoose = require("mongoose");

const Worker = require("../models/WorkerPayment");
const WorkerCategory = require("../models/WorkerCategory");
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
  return body.paymentDate || body.transactionDate || body.date || null;
};

async function resolveWorkerCategory({
  userId,
  categoryId,
  categoryName,
  categoryClientId,
}) {
  const cleanName = cleanString(categoryName);
  const cleanClientId = cleanString(categoryClientId);

  if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) {
    const byId = await WorkerCategory.findOne({
      _id: categoryId,
      user: userId,
    });

    if (byId) return byId;
  }

  if (cleanClientId) {
    const byClientId = await WorkerCategory.findOne({
      user: userId,
      clientId: cleanClientId,
    });

    if (byClientId) return byClientId;
  }

  if (cleanName) {
    const byName = await WorkerCategory.findOne({
      user: userId,
      name: cleanName,
    });

    if (byName) return byName;

    const created = await WorkerCategory.create({
      user: userId,
      ...(cleanClientId ? { clientId: cleanClientId } : {}),
      name: cleanName,
    });

    return created;
  }

  return null;
}

async function ensureWorkerCashTransaction(workerPayment) {
  if (!workerPayment) return null;

  const category = await WorkerCategory.findOne({
    _id: workerPayment.category,
    user: workerPayment.user,
  });

  const amount = round2(cleanNumber(workerPayment.amount));

  if (amount <= 0) {
    return null;
  }

  const categoryName = category?.name || "Worker Payment";
  const workerName = cleanString(workerPayment.workerName);
  const description =
    cleanString(workerPayment.description) || `Payment to ${workerName}`;

  const transactionDate = normalizeDate(
    workerPayment.paymentDate || workerPayment.createdAt
  );

  let cashTransaction = null;

  if (
    workerPayment.cashTransactionId &&
    mongoose.Types.ObjectId.isValid(workerPayment.cashTransactionId)
  ) {
    cashTransaction = await CashTransaction.findOne({
      _id: workerPayment.cashTransactionId,
      user: workerPayment.user,
    });
  }

  if (!cashTransaction) {
    cashTransaction = await CashTransaction.findOne({
      user: workerPayment.user,
      sourceKind: "worker",
      sourceId: workerPayment._id,
    });
  }

  const payload = {
    user: workerPayment.user,
    type: "worker_advance",
    direction: "out",
    amount,
    description: `Worker payment - ${workerName}`,
    note: `${categoryName}${description ? ` - ${description}` : ""}`,
    workerName,
    transactionDate,
    sourceKind: "worker",
    sourceId: workerPayment._id,
    isSystemGenerated: true,
    meta: {
      workerPaymentId: workerPayment._id,
      categoryId: workerPayment.category,
      categoryName,
      workerProfileId: workerPayment.workerProfileId || "",
      workerName,
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
    !workerPayment.cashTransactionId ||
    String(workerPayment.cashTransactionId) !== String(cashTransaction._id)
  ) {
    workerPayment.cashTransactionId = cashTransaction._id;
    await workerPayment.save();
  }

  return cashTransaction;
}

async function getPopulatedWorkerPayment(id) {
  return Worker.findById(id).populate("category", "name clientId");
}

router.get("/", auth, async (req, res) => {
  try {
    const data = await Worker.find({ user: req.user._id })
      .populate("category", "name clientId")
      .sort({ paymentDate: -1, createdAt: -1 });

    res.json(data);
  } catch (err) {
    console.error("GET workers error:", err);
    res.status(500).json({ error: "Failed to fetch workers" });
  }
});

router.post("/", auth, async (req, res) => {
  try {
    const {
      clientId,
      category,
      categoryName,
      categoryClientId,
      workerProfileId,
      workerName,
      amount,
      description,
    } = req.body;

    const cleanWorkerName = cleanString(workerName);
    const cleanWorkerProfileId = cleanString(workerProfileId);
    const cleanAmount = round2(cleanNumber(amount));
    const cleanClientId = cleanString(clientId);
    const cleanDescription = cleanString(description);
    const paymentDate = normalizeDate(getIncomingDate(req.body));

    if (!cleanWorkerName) {
      return res.status(400).json({ error: "Worker name is required" });
    }

    if (cleanAmount <= 0) {
      return res.status(400).json({ error: "Valid amount is required" });
    }

    const resolvedCategory = await resolveWorkerCategory({
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
      const existingByClientId = await Worker.findOne({
        user: req.user._id,
        clientId: cleanClientId,
      });

      if (existingByClientId) {
        await ensureWorkerCashTransaction(existingByClientId);

        const populatedExisting = await getPopulatedWorkerPayment(
          existingByClientId._id
        );

        return res.json(populatedExisting);
      }
    }

    // Prevent duplicate records from fast repeated clicking.
    // Same worker + same category + same amount + same description within 20 seconds
    // will return the existing payment instead of creating another one.
    const duplicateSince = new Date(Date.now() - 20 * 1000);

    const duplicateQuery = {
      user: req.user._id,
      category: resolvedCategory._id,
      workerName: cleanWorkerName,
      amount: cleanAmount,
      description: cleanDescription,
      createdAt: { $gte: duplicateSince },
    };

    if (cleanWorkerProfileId) {
      duplicateQuery.workerProfileId = cleanWorkerProfileId;
    }

    const recentDuplicate = await Worker.findOne(duplicateQuery);

    if (recentDuplicate) {
      await ensureWorkerCashTransaction(recentDuplicate);

      const populatedDuplicate = await getPopulatedWorkerPayment(
        recentDuplicate._id
      );

      return res.json(populatedDuplicate);
    }

    const workerPayment = await Worker.create({
      user: req.user._id,
      ...(cleanClientId ? { clientId: cleanClientId } : {}),
      category: resolvedCategory._id,
      workerProfileId: cleanWorkerProfileId,
      workerName: cleanWorkerName,
      amount: cleanAmount,
      description: cleanDescription,
      paymentDate,
    });

    await ensureWorkerCashTransaction(workerPayment);

    const saved = await getPopulatedWorkerPayment(workerPayment._id);

    res.status(201).json(saved);
  } catch (err) {
    console.error("POST worker error:", err);

    if (err?.code === 11000) {
      const cleanClientId = cleanString(req.body.clientId);

      if (cleanClientId) {
        const existing = await Worker.findOne({
          user: req.user._id,
          clientId: cleanClientId,
        });

        if (existing) {
          await ensureWorkerCashTransaction(existing);

          const populatedExisting = await getPopulatedWorkerPayment(
            existing._id
          );

          return res.json(populatedExisting);
        }
      }
    }

    res.status(500).json({ error: err?.message || "Failed to add worker" });
  }
});

router.put("/:id", auth, async (req, res) => {
  try {
    const {
      category,
      categoryName,
      categoryClientId,
      workerProfileId,
      workerName,
      amount,
      description,
    } = req.body;

    const cleanWorkerName = cleanString(workerName);
    const cleanWorkerProfileId = cleanString(workerProfileId);
    const cleanAmount = round2(cleanNumber(amount));

    if (!cleanWorkerName) {
      return res.status(400).json({ error: "Worker name is required" });
    }

    if (cleanAmount <= 0) {
      return res.status(400).json({ error: "Valid amount is required" });
    }

    const workerPayment = await Worker.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!workerPayment) {
      return res.status(404).json({ error: "Worker record not found" });
    }

    const resolvedCategory = await resolveWorkerCategory({
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

    workerPayment.category = resolvedCategory._id;
    workerPayment.workerProfileId = cleanWorkerProfileId;
    workerPayment.workerName = cleanWorkerName;
    workerPayment.amount = cleanAmount;
    workerPayment.description = cleanString(description);

    if (incomingDate !== null) {
      workerPayment.paymentDate = normalizeDate(incomingDate);
    } else if (!workerPayment.paymentDate) {
      workerPayment.paymentDate = workerPayment.createdAt || new Date();
    }

    await workerPayment.save();
    await ensureWorkerCashTransaction(workerPayment);

    const updated = await getPopulatedWorkerPayment(workerPayment._id);

    res.json(updated);
  } catch (err) {
    console.error("PUT worker error:", err);
    res.status(500).json({ error: err?.message || "Failed to update worker" });
  }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    const deleted = await Worker.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!deleted) {
      return res.status(404).json({ error: "Worker record not found" });
    }

    const cashDeleteConditions = [
      {
        sourceKind: "worker",
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
      message: "Worker payment deleted successfully",
    });
  } catch (err) {
    console.error("DELETE worker error:", err);
    res.status(500).json({ error: "Failed to delete worker" });
  }
});

module.exports = router;