const router = require("express").Router();
const Expense = require("../models/Expense");
const Worker = require("../models/WorkerPayment");
const Sale = require("../models/Sale");
const CashTransaction = require("../models/CashTransaction");
const auth = require("../middleware/auth");

const round2 = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const buildCategoryTotals = (items, nameGetter, amountGetter) => {
  const map = {};

  for (const item of items) {
    const name = nameGetter(item) || "Uncategorized";
    const amount = Number(amountGetter(item) || 0);
    map[name] = round2((map[name] || 0) + amount);
  }

  return Object.entries(map)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);
};

const buildCashSummary = (items) => {
  const summary = {
    openingBalance: 0,
    totalMoneyIn: 0,
    totalMoneyOut: 0,
    totalSalesIn: 0,
    totalManualMoneyIn: 0,
    totalExpensesOut: 0,
    totalWorkerAdvances: 0,
    totalWorkerRecoveries: 0,
    currentBalance: 0,
    transactionCount: Array.isArray(items) ? items.length : 0,
  };

  for (const item of items || []) {
    const amount = Number(item?.amount || 0);
    const type = String(item?.type || "").trim();

    if (type === "opening_balance") {
      summary.openingBalance = round2(summary.openingBalance + amount);
      continue;
    }

    if (type === "money_in") {
      summary.totalManualMoneyIn = round2(summary.totalManualMoneyIn + amount);
      summary.totalMoneyIn = round2(summary.totalMoneyIn + amount);
      continue;
    }

    if (type === "sale_income") {
      summary.totalSalesIn = round2(summary.totalSalesIn + amount);
      summary.totalMoneyIn = round2(summary.totalMoneyIn + amount);
      continue;
    }

    if (type === "worker_recovery") {
      summary.totalWorkerRecoveries = round2(
        summary.totalWorkerRecoveries + amount
      );
      summary.totalMoneyIn = round2(summary.totalMoneyIn + amount);
      continue;
    }

    if (type === "expense") {
      summary.totalExpensesOut = round2(summary.totalExpensesOut + amount);
      summary.totalMoneyOut = round2(summary.totalMoneyOut + amount);
      continue;
    }

    if (type === "worker_advance") {
      summary.totalWorkerAdvances = round2(
        summary.totalWorkerAdvances + amount
      );
      summary.totalMoneyOut = round2(summary.totalMoneyOut + amount);
    }
  }

  summary.currentBalance = round2(
    summary.openingBalance + summary.totalMoneyIn - summary.totalMoneyOut
  );

  return summary;
};

const buildSalesSummary = (items) => {
  const summary = {
    totalSales: 0,
    totalQuantity: 0,
    grossSalesAmount: 0,
    ownerIncomeAmount: 0,
    workersAllocationAmount: 0,
  };

  for (const item of items || []) {
    summary.totalSales += 1;
    summary.totalQuantity = round2(
      summary.totalQuantity + Number(item?.quantity || 0)
    );
    summary.grossSalesAmount = round2(
      summary.grossSalesAmount + Number(item?.totalAmount || 0)
    );
    summary.ownerIncomeAmount = round2(
      summary.ownerIncomeAmount + Number(item?.ownerAmount || 0)
    );
    summary.workersAllocationAmount = round2(
      summary.workersAllocationAmount + Number(item?.workersTotalAmount || 0)
    );
  }

  return summary;
};

const buildWorkerLedgerSummary = (items) => {
  const map = new Map();

  for (const item of items || []) {
    const type = String(item?.type || "").trim();
    const workerName = String(item?.workerName || "").trim();

    if (!workerName) continue;
    if (type !== "worker_advance" && type !== "worker_recovery") continue;

    const current = map.get(workerName) || {
      workerName,
      totalAdvance: 0,
      totalRecovery: 0,
      outstanding: 0,
      transactionCount: 0,
    };

    const amount = Number(item?.amount || 0);

    if (type === "worker_advance") {
      current.totalAdvance = round2(current.totalAdvance + amount);
    }

    if (type === "worker_recovery") {
      current.totalRecovery = round2(current.totalRecovery + amount);
    }

    current.transactionCount += 1;
    current.outstanding = round2(
      current.totalAdvance - current.totalRecovery
    );

    map.set(workerName, current);
  }

  return [...map.values()].sort((a, b) => b.outstanding - a.outstanding);
};

router.get("/", auth, async (req, res) => {
  try {
    const [expenses, workers, sales, cashTransactions] = await Promise.all([
      Expense.find({ user: req.user._id })
        .populate("category", "name")
        .sort({ createdAt: -1 }),
      Worker.find({ user: req.user._id })
        .populate("category", "name")
        .sort({ createdAt: -1 }),
      Sale.find({ user: req.user._id }).sort({ saleDate: -1, createdAt: -1 }),
      CashTransaction.find({ user: req.user._id }).sort({
        transactionDate: -1,
        createdAt: -1,
      }),
    ]);

    const totalExpenses = round2(
      expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    );

    const totalWorkers = round2(
      workers.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    );

    const expenseByCategory = buildCategoryTotals(
      expenses,
      (item) => item.category?.name,
      (item) => item.amount
    );

    const workerByCategory = buildCategoryTotals(
      workers,
      (item) => item.category?.name,
      (item) => item.amount
    );

    const salesByProduct = buildCategoryTotals(
      sales,
      (item) => item.productName,
      (item) => item.totalAmount
    );

    const cashSummary = buildCashSummary(cashTransactions);
    const salesSummary = buildSalesSummary(sales);
    const workerLedgerSummary = buildWorkerLedgerSummary(cashTransactions);

    res.json({
      // existing fields kept intact for current frontend
      totalExpenses,
      totalWorkers,
      grandTotal: round2(totalExpenses + totalWorkers),
      totalExpenseEntries: expenses.length,
      totalWorkerEntries: workers.length,
      expenseByCategory,
      workerByCategory,
      recentExpenses: expenses.slice(0, 5),
      recentWorkers: workers.slice(0, 5),

      // new fields for next frontend update
      cashSummary,
      salesSummary,
      totalSalesEntries: sales.length,
      salesByProduct,
      recentSales: sales.slice(0, 5),
      recentCashTransactions: cashTransactions.slice(0, 10),
      workerLedgerSummary,
    });
  } catch (err) {
    console.error("GET reports error:", err);
    res.status(500).json({ error: "Failed to fetch reports" });
  }
});

router.delete("/clear-all", auth, async (req, res) => {
  try {
    await Promise.all([
      Expense.deleteMany({ user: req.user._id }),
      Worker.deleteMany({ user: req.user._id }),
      Sale.deleteMany({ user: req.user._id }),
      CashTransaction.deleteMany({ user: req.user._id }),
    ]);

    res.json({ message: "All data deleted successfully" });
  } catch (err) {
    console.error("DELETE clear-all error:", err);
    res.status(500).json({ error: "Failed to delete data" });
  }
});

module.exports = router;