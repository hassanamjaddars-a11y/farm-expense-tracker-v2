const router = require("express").Router();
const Sale = require("../models/Sale");
const UserSetting = require("../models/UserSetting");
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

const nearlyEqual = (a, b, tolerance = 1) => {
  return Math.abs(Number(a || 0) - Number(b || 0)) <= tolerance;
};

async function getOrCreateUserSetting(userId) {
  let setting = await UserSetting.findOne({ user: userId });

  if (!setting) {
    setting = await UserSetting.create({
      user: userId,
      murhWeightKg: 20,
      defaultOwnerSharePercentage: 70,
      defaultWorkerSharePercentage: 30,
      currencyLabel: "Rs",
    });
  }

  return setting;
}

function normalizeWorkers(rawWorkers) {
  if (!Array.isArray(rawWorkers)) return [];

  return rawWorkers
    .map((item) => ({
      workerProfileId: cleanString(
        item?.workerProfileId || item?.profileId || item?.id || ""
      ),
      workerName: cleanString(
        item?.workerName || item?.name || item?.fullName || ""
      ),
      percentage: cleanNumber(item?.percentage),
      amount: cleanNumber(item?.amount),
    }))
    .filter((item) => item.workerName);
}

function buildWorkerSplits({
  workers,
  distributionMode,
  workerSharePercentage,
  workersTotalAmount,
  totalAmount,
}) {
  const normalizedWorkers = normalizeWorkers(workers);

  if (workerSharePercentage <= 0 || workersTotalAmount <= 0) {
    return [];
  }

  if (!normalizedWorkers.length) {
    throw new Error("Select at least one worker when worker share is greater than zero");
  }

  if (distributionMode === "equal") {
    const count = normalizedWorkers.length;
    const eachBase = round2(workersTotalAmount / count);
    let used = 0;

    return normalizedWorkers.map((item, index) => {
      const amount =
        index === count - 1 ? round2(workersTotalAmount - used) : eachBase;

      used = round2(used + amount);

      const percentageOfWorkerPool = round2(100 / count);
      const percentageOfTotalSale = totalAmount
        ? round2((amount / totalAmount) * 100)
        : 0;

      return {
        workerProfileId: item.workerProfileId || "",
        workerName: item.workerName,
        percentageOfWorkerPool,
        percentageOfTotalSale,
        amount,
      };
    });
  }

  if (distributionMode === "custom_percentage") {
    const totalPercentage = round2(
      normalizedWorkers.reduce(
        (sum, item) => sum + cleanNumber(item.percentage),
        0
      )
    );

    if (!nearlyEqual(totalPercentage, 100, 0.5)) {
      throw new Error("Custom worker percentages must total 100");
    }

    let used = 0;

    return normalizedWorkers.map((item, index) => {
      const amount =
        index === normalizedWorkers.length - 1
          ? round2(workersTotalAmount - used)
          : round2((workersTotalAmount * cleanNumber(item.percentage)) / 100);

      used = round2(used + amount);

      return {
        workerProfileId: item.workerProfileId || "",
        workerName: item.workerName,
        percentageOfWorkerPool: round2(item.percentage),
        percentageOfTotalSale: totalAmount
          ? round2((amount / totalAmount) * 100)
          : 0,
        amount,
      };
    });
  }

  if (distributionMode === "custom_amount") {
    const totalCustomAmount = round2(
      normalizedWorkers.reduce((sum, item) => sum + cleanNumber(item.amount), 0)
    );

    if (!nearlyEqual(totalCustomAmount, workersTotalAmount, 1)) {
      throw new Error("Custom worker amounts must match the worker share total");
    }

    return normalizedWorkers.map((item) => {
      const amount = round2(item.amount);
      const percentageOfWorkerPool = workersTotalAmount
        ? round2((amount / workersTotalAmount) * 100)
        : 0;

      return {
        workerProfileId: item.workerProfileId || "",
        workerName: item.workerName,
        percentageOfWorkerPool,
        percentageOfTotalSale: totalAmount
          ? round2((amount / totalAmount) * 100)
          : 0,
        amount,
      };
    });
  }

  throw new Error("Invalid distribution mode");
}

function buildSalesSummary(items) {
  const safeItems = Array.isArray(items) ? items : [];

  return safeItems.reduce(
    (acc, item) => {
      acc.totalSales += 1;
      acc.totalQuantity = round2(acc.totalQuantity + Number(item.quantity || 0));
      acc.grossSalesAmount = round2(
        acc.grossSalesAmount + Number(item.totalAmount || 0)
      );
      acc.ownerIncomeAmount = round2(
        acc.ownerIncomeAmount + Number(item.ownerAmount || 0)
      );
      acc.workersAllocationAmount = round2(
        acc.workersAllocationAmount + Number(item.workersTotalAmount || 0)
      );
      return acc;
    },
    {
      totalSales: 0,
      totalQuantity: 0,
      grossSalesAmount: 0,
      ownerIncomeAmount: 0,
      workersAllocationAmount: 0,
    }
  );
}

function computeSaleValues({
  quantity,
  unit,
  unitWeightKg,
  rate,
  totalAmount,
  ownerSharePercentage,
  workerSharePercentage,
}) {
  const cleanQuantity = cleanNumber(quantity);
  const cleanRate = cleanNumber(rate);
  const providedTotalAmount = cleanNumber(totalAmount);

  if (cleanQuantity <= 0) {
    throw new Error("Valid quantity is required");
  }

  if (cleanRate < 0) {
    throw new Error("Valid rate is required");
  }

  if (!["murh", "kg", "maund"].includes(unit)) {
    throw new Error("Unit must be murh, kg, or maund");
  }

  const finalTotalAmount = round2(
    providedTotalAmount > 0 ? providedTotalAmount : cleanQuantity * cleanRate
  );

  if (finalTotalAmount <= 0) {
    throw new Error("Valid total amount is required");
  }

  if (ownerSharePercentage < 0 || ownerSharePercentage > 100) {
    throw new Error("Owner share percentage must be between 0 and 100");
  }

  if (workerSharePercentage < 0 || workerSharePercentage > 100) {
    throw new Error("Worker share percentage must be between 0 and 100");
  }

  if (!nearlyEqual(ownerSharePercentage + workerSharePercentage, 100, 0.5)) {
    throw new Error("Owner and worker share percentages must total 100");
  }

  const fixedUnitWeightKg =
    unit === "maund" ? 40 : unit === "murh" ? 20 : 1;

  const finalTotalWeightKg = round2(cleanQuantity * fixedUnitWeightKg);

  const ownerAmount = round2((finalTotalAmount * ownerSharePercentage) / 100);
  const workersTotalAmount = round2(finalTotalAmount - ownerAmount);

  return {
    quantity: cleanQuantity,
    rate: cleanRate,
    unitWeightKg: fixedUnitWeightKg,
    totalWeightKg: finalTotalWeightKg,
    totalAmount: finalTotalAmount,
    ownerAmount,
    workersTotalAmount,
  };
}

async function ensureSaleCashTransaction(sale) {
  if (!sale) return null;

  const amount = round2(cleanNumber(sale.ownerAmount));

  if (amount <= 0) {
    return null;
  }

  let cashTransaction = null;

  if (sale.cashTransactionId) {
    cashTransaction = await CashTransaction.findOne({
      _id: sale.cashTransactionId,
      user: sale.user,
    });
  }

  if (!cashTransaction) {
    cashTransaction = await CashTransaction.findOne({
      user: sale.user,
      sourceKind: "sale",
      sourceId: sale._id,
    });
  }

  const payload = {
    user: sale.user,
    type: "sale_income",
    direction: "in",
    amount,
    description: `Sale income - ${sale.productName}`,
    note: cleanString(sale.note),
    workerName: "",
    transactionDate: normalizeDate(sale.saleDate || sale.createdAt),
    sourceKind: "sale",
    sourceId: sale._id,
    isSystemGenerated: true,
    meta: {
      saleId: sale._id,
      productName: sale.productName,
      totalAmount: sale.totalAmount,
      ownerSharePercentage: sale.ownerSharePercentage,
      workerSharePercentage: sale.workerSharePercentage,
      workerSplits: sale.workerSplits || [],
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
    !sale.cashTransactionId ||
    String(sale.cashTransactionId) !== String(cashTransaction._id)
  ) {
    sale.cashTransactionId = cashTransaction._id;
    await sale.save();
  }

  return cashTransaction;
}

router.get("/", auth, async (req, res) => {
  try {
    const items = await Sale.find({ user: req.user._id }).sort({
      saleDate: -1,
      createdAt: -1,
    });

    res.json({
      items,
      summary: buildSalesSummary(items),
    });
  } catch (err) {
    console.error("GET sales error:", err);
    res.status(500).json({ error: "Failed to fetch sales" });
  }
});

router.get("/summary", auth, async (req, res) => {
  try {
    const items = await Sale.find({ user: req.user._id }).lean();
    res.json(buildSalesSummary(items));
  } catch (err) {
    console.error("GET sales summary error:", err);
    res.status(500).json({ error: "Failed to fetch sales summary" });
  }
});

router.post("/", auth, async (req, res) => {
  try {
    const setting = await getOrCreateUserSetting(req.user._id);

    const productName = cleanString(req.body.productName);
    const note = cleanString(req.body.note);
    const saleDate = normalizeDate(req.body.saleDate);
    const unit = cleanString(req.body.unit || "murh").toLowerCase();
    const distributionMode = cleanString(req.body.distributionMode || "equal");
    const clientId = cleanString(req.body.clientId) || undefined;

    const ownerSharePercentage =
      req.body.ownerSharePercentage === undefined ||
      req.body.ownerSharePercentage === null
        ? cleanNumber(setting.defaultOwnerSharePercentage)
        : cleanNumber(req.body.ownerSharePercentage);

    const workerSharePercentage =
      req.body.workerSharePercentage === undefined ||
      req.body.workerSharePercentage === null
        ? round2(100 - ownerSharePercentage)
        : cleanNumber(req.body.workerSharePercentage);

    const unitWeightKg =
      unit === "maund" ? 40 : unit === "murh" ? 20 : 1;

    if (!productName) {
      return res.status(400).json({ error: "Product name is required" });
    }

    if (clientId) {
      const existingByClientId = await Sale.findOne({
        user: req.user._id,
        clientId,
      });

      if (existingByClientId) {
        await ensureSaleCashTransaction(existingByClientId);
        return res.json(existingByClientId);
      }
    }

    const computed = computeSaleValues({
      quantity: req.body.quantity,
      unit,
      unitWeightKg,
      rate: req.body.rate,
      totalAmount: req.body.totalAmount,
      ownerSharePercentage,
      workerSharePercentage,
    });

    const workerSplits = buildWorkerSplits({
      workers: req.body.workers,
      distributionMode,
      workerSharePercentage,
      workersTotalAmount: computed.workersTotalAmount,
      totalAmount: computed.totalAmount,
    });

    const sale = await Sale.create({
      user: req.user._id,
      ...(clientId ? { clientId } : {}),
      productName,
      quantity: computed.quantity,
      unit,
      unitWeightKg: computed.unitWeightKg,
      totalWeightKg: computed.totalWeightKg,
      rate: computed.rate,
      totalAmount: computed.totalAmount,
      ownerSharePercentage: round2(ownerSharePercentage),
      workerSharePercentage: round2(workerSharePercentage),
      ownerAmount: computed.ownerAmount,
      workersTotalAmount: computed.workersTotalAmount,
      distributionMode,
      workerSplits,
      saleDate,
      note,
      billImageUrls: Array.isArray(req.body.billImageUrls)
        ? req.body.billImageUrls.filter(Boolean)
        : [],
    });

    await ensureSaleCashTransaction(sale);

    const saved = await Sale.findById(sale._id);
    res.status(201).json(saved);
  } catch (err) {
    console.error("POST sale error:", err);

    if (err?.code === 11000) {
      return res.status(409).json({
        error: "This sale was already saved.",
      });
    }

    res.status(500).json({ error: err?.message || "Failed to add sale" });
  }
});

router.put("/:id", auth, async (req, res) => {
  try {
    const sale = await Sale.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!sale) {
      return res.status(404).json({ error: "Sale not found" });
    }

    const setting = await getOrCreateUserSetting(req.user._id);

    const productName = cleanString(req.body.productName || sale.productName);
    const note =
      req.body.note === undefined ? sale.note : cleanString(req.body.note);

    const saleDate =
      req.body.saleDate === undefined
        ? sale.saleDate
        : normalizeDate(req.body.saleDate);

    const unit = cleanString(req.body.unit || sale.unit).toLowerCase();

    const distributionMode = cleanString(
      req.body.distributionMode || sale.distributionMode || "equal"
    );

    const ownerSharePercentage =
      req.body.ownerSharePercentage === undefined ||
      req.body.ownerSharePercentage === null
        ? cleanNumber(sale.ownerSharePercentage)
        : cleanNumber(req.body.ownerSharePercentage);

    const workerSharePercentage =
      req.body.workerSharePercentage === undefined ||
      req.body.workerSharePercentage === null
        ? round2(100 - ownerSharePercentage)
        : cleanNumber(req.body.workerSharePercentage);

    const unitWeightKg =
      unit === "maund" ? 40 : unit === "murh" ? 20 : 1;

    if (!productName) {
      return res.status(400).json({ error: "Product name is required" });
    }

    const computed = computeSaleValues({
      quantity:
        req.body.quantity === undefined ? sale.quantity : req.body.quantity,
      unit,
      unitWeightKg,
      rate: req.body.rate === undefined ? sale.rate : req.body.rate,
      totalAmount:
        req.body.totalAmount === undefined
          ? sale.totalAmount
          : req.body.totalAmount,
      ownerSharePercentage,
      workerSharePercentage,
    });

    const workerSplits = buildWorkerSplits({
      workers: req.body.workers === undefined ? sale.workerSplits : req.body.workers,
      distributionMode,
      workerSharePercentage,
      workersTotalAmount: computed.workersTotalAmount,
      totalAmount: computed.totalAmount,
    });

    sale.productName = productName;
    sale.quantity = computed.quantity;
    sale.unit = unit;
    sale.unitWeightKg = computed.unitWeightKg;
    sale.totalWeightKg = computed.totalWeightKg;
    sale.rate = computed.rate;
    sale.totalAmount = computed.totalAmount;
    sale.ownerSharePercentage = round2(ownerSharePercentage);
    sale.workerSharePercentage = round2(workerSharePercentage);
    sale.ownerAmount = computed.ownerAmount;
    sale.workersTotalAmount = computed.workersTotalAmount;
    sale.distributionMode = distributionMode;
    sale.workerSplits = workerSplits;
    sale.saleDate = saleDate;
    sale.note = note;

    if (Array.isArray(req.body.billImageUrls)) {
      sale.billImageUrls = req.body.billImageUrls.filter(Boolean);
    }

    await sale.save();
    await ensureSaleCashTransaction(sale);

    const updated = await Sale.findById(sale._id);
    res.json(updated);
  } catch (err) {
    console.error("PUT sale error:", err);
    res.status(500).json({ error: err?.message || "Failed to update sale" });
  }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    const deleted = await Sale.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!deleted) {
      return res.status(404).json({ error: "Sale not found" });
    }

    const cashDeleteConditions = [
      {
        sourceKind: "sale",
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
      message: "Sale deleted successfully",
    });
  } catch (err) {
    console.error("DELETE sale error:", err);
    res.status(500).json({ error: "Failed to delete sale" });
  }
});

module.exports = router;