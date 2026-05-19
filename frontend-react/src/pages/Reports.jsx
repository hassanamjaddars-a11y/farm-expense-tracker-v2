import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../api";
import toast from "react-hot-toast";
import "../styles/reports.css";
import reportsHeaderBackground from "../assets/reports-header-background.png";
import { useAuth } from "../context/AuthContext";
import {
  FaChevronRight,
  FaGasPump,
  FaLeaf,
  FaRegFileAlt,
  FaSeedling,
  FaShip,
  FaTools,
  FaUserAlt,
  FaUserTie,
  FaUsers,
  FaWallet,
} from "react-icons/fa";
import { IoSettingsOutline } from "react-icons/io5";
import {
  attemptSyncPending,
  buildDashboardWithPending,
  cacheReportsSnapshot,
  getDashboardSnapshotWithPending,
  getSalesPageSnapshotWithPending,
  hasDashboardData,
} from "../utils/offlineQueue";

const getInitialReportsData = () => getDashboardSnapshotWithPending();

const money = (value) => `PKR ${Number(value || 0).toLocaleString()}`;

const formatDateTime = (value) => {
  if (!value) return "No date";

  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatShortDate = (value) => {
  if (!value) return "No date";

  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const safePercent = (value, total) => {
  if (!total || total <= 0) return 0;
  return Math.max(6, Math.round((Number(value || 0) / Math.max(total, 1)) * 100));
};

const realPercent = (value, total) => {
  if (!total || total <= 0) return 0;
  return Math.round((Number(value || 0) / Math.max(total, 1)) * 100);
};

const normalizeName = (value = "") =>
  String(value).trim().replace(/\s+/g, " ").toLowerCase();

const dayKey = (value) => {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
};

const dayLabel = (key) => {
  const date = new Date(`${key}T00:00:00`);

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
};

const getAmount = (item) =>
  Number(
    item?.amount ||
      item?.total ||
      item?.value ||
      item?.netAmount ||
      item?.grossAmount ||
      item?.ownerIncomeAmount ||
      0
  );

const readArray = (...values) => {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }

  return [];
};

const readLocalSalesSnapshot = () => {
  try {
    return getSalesPageSnapshotWithPending();
  } catch (error) {
    console.warn("Reports local sales read error:", error);
    return { items: [], summary: {} };
  }
};

const uniqueById = (items = []) => {
  const seen = new Set();

  return items.filter((item, index) => {
    const key =
      item?._id ||
      item?.clientId ||
      `${item?.saleDate || item?.date || item?.createdAt || ""}-${
        item?.totalAmount || item?.ownerIncomeAmount || item?.amount || ""
      }-${index}`;

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
};

const getSaleIncomeAmount = (item) =>
  Number(
    item?.ownerAmount ??
      item?.ownerIncomeAmount ??
      item?.grossSalesAmount ??
      item?.totalAmount ??
      item?.amount ??
      0
  );

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;


function FarmPremiumLogoMark() {
  return (
    <span className="reports-logo-mark" aria-hidden="true">
      <svg viewBox="0 0 28 28" fill="none">
        <path
          d="M14 23.4V6.2"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
        <path
          d="M14 14.2C9.6 14 6.5 11.3 5.5 7.2c4.4 0 7.4 2.5 8.5 7Z"
          fill="currentColor"
        />
        <path
          d="M14.2 11.2c3.7-2.6 7.4-2.7 10.2-.2-3.4 2.4-7.1 2.4-10.2.2Z"
          fill="currentColor"
          opacity="0.92"
        />
        <path
          d="M14 18.8c-4.2-.2-7.8-2.3-9.5-6.1 4.5.2 8 2.4 9.5 6.1Z"
          fill="currentColor"
          opacity="0.84"
        />
      </svg>
    </span>
  );
}

const getExpenseCategoryMeta = (name = "") => {
  const key = normalizeName(name);

  if (key.includes("diesel") || key.includes("fuel")) {
    return { Icon: FaGasPump, className: "diesel" };
  }

  if (key.includes("fertilizer") || key.includes("urea") || key.includes("khad")) {
    return { Icon: FaSeedling, className: "fertilizer" };
  }

  if (key.includes("seed")) {
    return { Icon: FaLeaf, className: "seeds" };
  }

  if (key.includes("repair") || key.includes("maintenance")) {
    return { Icon: FaTools, className: "repair" };
  }

  return { Icon: FaLeaf, className: "other" };
};

const getWorkerCategoryMeta = (name = "") => {
  const key = normalizeName(name);

  if (key.includes("ship")) {
    return { Icon: FaShip, className: "ship" };
  }

  if (key.includes("mechanic") || key.includes("repair")) {
    return { Icon: FaTools, className: "mechanics" };
  }

  if (key.includes("manager") || key.includes("supervisor")) {
    return { Icon: FaUserTie, className: "manager" };
  }

  return { Icon: FaUsers, className: "workers" };
};

function buildPointPath(values, width, height, padX = 14, padY = 12) {
  const max = Math.max(...values.map((item) => item.visualValue), 1);
  const min = Math.min(...values.map((item) => item.visualValue), 0);
  const range = max - min || 1;

  const points = values.map((item, index) => {
    const x = padX + index * 44;
    const y =
      height -
      padY -
      ((item.visualValue - min) * (height - padY * 2)) / range;

    return {
      ...item,
      x,
      y,
    };
  });

  const path = points.map((point) => `${point.x},${point.y}`).join(" ");

  return {
    points,
    path,
    width: Math.max(width, padX * 2 + Math.max(values.length - 1, 1) * 44),
  };
}

export default function Reports() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const settingsMenuRef = useRef(null);

  const [data, setData] = useState(getInitialReportsData);
  const [loading, setLoading] = useState(() => !hasDashboardData(getInitialReportsData()));
  const [searchParams, setSearchParams] = useSearchParams();
  const [showAllExpenseCats, setShowAllExpenseCats] = useState(false);
  const [showAllWorkerCats, setShowAllWorkerCats] = useState(false);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [workerCategories, setWorkerCategories] = useState([]);
  const [openCategoryMenu, setOpenCategoryMenu] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [graphMode, setGraphMode] = useState("summary");
  const [activeGraphPoint, setActiveGraphPoint] = useState(null);

  const expenseId = searchParams.get("expenseId") || "";
  const descriptionFilter = searchParams.get("description") || "";
  const categoryFilter = searchParams.get("category") || "";

  const workerId = searchParams.get("workerId") || "";
  const workerNameFilter = searchParams.get("workerName") || "";
  const workerCategoryFilter = searchParams.get("workerCategory") || "";
  const activePanel = searchParams.get("panel") || "";

  const initials =
    user?.name
      ?.split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "FT";

  const fetchReports = async (showOfflineToast = false) => {
    try {
      await attemptSyncPending(api);

      const [reportsRes, expenseCatsRes, workerCatsRes] = await Promise.all([
        api.get("/reports"),
        api.get("/expense-categories").catch(() => ({ data: [] })),
        api.get("/worker-categories").catch(() => ({ data: [] })),
      ]);

      const finalData = buildDashboardWithPending(reportsRes.data);

      setData(finalData);
      setExpenseCategories(Array.isArray(expenseCatsRes.data) ? expenseCatsRes.data : []);
      setWorkerCategories(Array.isArray(workerCatsRes.data) ? workerCatsRes.data : []);
      cacheReportsSnapshot(reportsRes.data);
    } catch (err) {
      console.error("Reports fetch error:", err);
      setData(getInitialReportsData());

      if (showOfflineToast) {
        toast.error("Offline mode: showing saved report data");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports(true);

    const handleOnline = () => {
      fetchReports();
    };

    const closeMenus = () => setOpenCategoryMenu(null);

    window.addEventListener("online", handleOnline);
    window.addEventListener("scroll", closeMenus);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("scroll", closeMenus);
    };
  }, []);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(event.target)) {
        setSettingsOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setSettingsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const openSettingsPanel = () => {
    const next = new URLSearchParams(searchParams);
    next.set("panel", "settings");
    setSearchParams(next);
    setSettingsOpen(false);
  };

  const closeSettingsPanel = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("panel");
    setSearchParams(next);
  };

  const handleLogout = () => {
    setSettingsOpen(false);
    logout();
    navigate("/login");
  };

  const totalTracked = Number(data.grandTotal || 0);
  const totalExpenses = Number(data.totalExpenses || 0);
  const totalWorkers = Number(data.totalWorkers || 0);
  const totalIncome = Number(
    data.salesSummary?.ownerIncomeAmount ||
      data.salesSummary?.grossSalesAmount ||
      data.totalIncome ||
      0
  );
  const totalOutflow = totalExpenses + totalWorkers;
  const netProfit = totalIncome - totalOutflow;

  const recentExpenses = readArray(data.recentExpenses, data.expenses);
  const recentWorkers = readArray(data.recentWorkers, data.workerPayments, data.workers);
  const localSalesSnapshot = readLocalSalesSnapshot();

  const recentSales = uniqueById([
    ...readArray(data.recentSales, data.sales, data.recentIncome),
    ...(Array.isArray(localSalesSnapshot?.items) ? localSalesSnapshot.items : []),
  ]);
  const recentCashBook = readArray(data.recentCashBook, data.cashBookEntries, data.recentCash);

  const chart = useMemo(() => {
    const toSafeDate = (value) => {
      const date = value ? new Date(value) : new Date();
      return Number.isNaN(date.getTime()) ? new Date() : date;
    };

    const events = [];

    const pushEvent = ({ date, income = 0, expenses = 0, workers = 0, cashOut = 0 }) => {
      const eventDate = toSafeDate(date);
      const total =
        Number(income || 0) +
        Number(expenses || 0) +
        Number(workers || 0) +
        Number(cashOut || 0);

      if (total <= 0) return;

      events.push({
        date: eventDate,
        key: eventDate.toISOString(),
        label: dayLabel(eventDate.toISOString().slice(0, 10)),
        income: Number(income || 0),
        expenses: Number(expenses || 0),
        workers: Number(workers || 0),
        cashOut: Number(cashOut || 0),
      });
    };

    recentSales.forEach((item) => {
      pushEvent({
        date: item.saleDate || item.date || item.createdAt,
        income: getSaleIncomeAmount(item),
      });
    });

    recentExpenses.forEach((item) => {
      pushEvent({
        date: item.date || item.expenseDate || item.createdAt,
        expenses: getAmount(item),
      });
    });

    recentWorkers.forEach((item) => {
      pushEvent({
        date: item.date || item.paymentDate || item.createdAt,
        workers: getAmount(item),
      });
    });

    recentCashBook.forEach((item) => {
      const type = normalizeName(item.type || item.entryType || item.direction || "");
      const amount = getAmount(item);
      const date = item.entryDate || item.transactionDate || item.date || item.createdAt;

      if (type.includes("opening")) return;

      if (type.includes("in") || type.includes("income") || type.includes("deposit")) {
        pushEvent({ date, income: amount });
      }

      if (type.includes("out") || type.includes("withdraw") || type.includes("spent")) {
        pushEvent({ date, cashOut: amount });
      }
    });

    /*
      If reports only has totals and no dated records, do NOT place all money
      on the final point. That caused the ugly straight spike.
    */
    if (!events.length) {
      const today = new Date();

      if (totalIncome > 0) {
        pushEvent({ date: today, income: totalIncome });
      }

      if (totalExpenses > 0) {
        pushEvent({ date: today, expenses: totalExpenses });
      }

      if (totalWorkers > 0) {
        pushEvent({ date: today, workers: totalWorkers });
      }
    }

    events.sort((a, b) => a.date.getTime() - b.date.getTime());

    const hasRealGraphData = events.length > 0;

    let runningIncome = 0;
    let runningExpenses = 0;
    let runningWorkers = 0;
    let runningCashOut = 0;

    let baseRows = events.map((event, index) => {
      runningIncome += event.income;
      runningExpenses += event.expenses;
      runningWorkers += event.workers;
      runningCashOut += event.cashOut;

      const spent = runningExpenses + runningWorkers + runningCashOut;

      return {
        key: `${event.key}-${index}`,
        label: event.label,
        index,
        income: round2(runningIncome),
        expenses: round2(runningExpenses),
        workers: round2(runningWorkers),
        cashOut: round2(runningCashOut),
        spent: round2(spent),
        totalDetail: round2(runningIncome + spent),
      };
    });

    if (!baseRows.length) {
      baseRows = Array.from({ length: 7 }, (_, index) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - index));
        const key = date.toISOString().slice(0, 10);

        return {
          key,
          label: dayLabel(key),
          index,
          income: 0,
          expenses: 0,
          workers: 0,
          cashOut: 0,
          spent: 0,
          totalDetail: 0,
        };
      });
    }

    baseRows = baseRows.slice(-14).map((item, index) => ({
      ...item,
      index,
    }));

    const summaryIncomeRows = baseRows.map((item) => ({
      ...item,
      series: "Income",
      value: item.income,
      visualValue: hasRealGraphData ? item.income : 0,
    }));

    const summarySpentRows = baseRows.map((item) => ({
      ...item,
      series: "Spent",
      value: item.spent,
      visualValue: hasRealGraphData ? item.spent : 0,
    }));

    const expenseRows = baseRows.map((item) => ({
      ...item,
      series: "Expenses",
      value: item.expenses,
      visualValue: hasRealGraphData ? item.expenses : 0,
    }));

    const workerRows = baseRows.map((item) => ({
      ...item,
      series: "Workers",
      value: item.workers,
      visualValue: hasRealGraphData ? item.workers : 0,
    }));

    const cashOutRows = baseRows.map((item) => ({
      ...item,
      series: "Cash Out",
      value: item.cashOut,
      visualValue: hasRealGraphData ? item.cashOut : 0,
    }));

    const chartHeight = 116;
    const pointSpacing = baseRows.length <= 7 ? 58 : 44;
    const svgWidth = Math.max(300, 36 + Math.max(baseRows.length - 1, 1) * pointSpacing);
    const finalWidth = Math.max(610, svgWidth);

    const allValues =
      graphMode === "summary"
        ? [...summaryIncomeRows, ...summarySpentRows]
        : [...summaryIncomeRows, ...expenseRows, ...workerRows, ...cashOutRows];

    const maxVisual = Math.max(
      ...allValues.map((item) => Number(item.visualValue || 0)),
      1
    );

    const paddedMax = maxVisual * 1.28;

    const normalizeRows = (rows) => {
      const points = rows.map((item, index) => {
        const value = Number(item.visualValue || 0);
        const x = 18 + index * pointSpacing;
        const y = 104 - (value / paddedMax) * 82;

        return {
          ...item,
          x,
          y: Math.max(16, Math.min(104, y)),
        };
      });

      return {
        points,
        path: points.map((point) => `${point.x},${point.y}`).join(" "),
        width: finalWidth,
      };
    };

    return {
      days: baseRows.map((item) => item.key),
      rows: baseRows,
      hasRealGraphData,
      income: normalizeRows(summaryIncomeRows),
      spent: normalizeRows(summarySpentRows),
      expenses: normalizeRows(expenseRows),
      workers: normalizeRows(workerRows),
      cashOut: normalizeRows(cashOutRows),
      svgWidth: finalWidth,
      svgHeight: chartHeight,
    };
  }, [
    graphMode,
    recentSales,
    recentExpenses,
    recentWorkers,
    recentCashBook,
    totalIncome,
    totalExpenses,
    totalWorkers,
  ]);

  useEffect(() => {
    if (!chart.hasRealGraphData) {
      setActiveGraphPoint(null);
      return;
    }

    const activeSeries =
      graphMode === "summary" ? chart.income.points : chart.expenses.points;

    if (!activeGraphPoint && activeSeries?.length) {
      const point = activeSeries[Math.max(activeSeries.length - 4, 0)];
      setActiveGraphPoint(point);
    }
  }, [chart, graphMode, activeGraphPoint]);

  useEffect(() => {
    setActiveGraphPoint(null);
  }, [graphMode]);

  const visibleExpenseCategories = showAllExpenseCats
    ? data.expenseByCategory || []
    : (data.expenseByCategory || []).slice(0, 4);

  const visibleWorkerCategories = showAllWorkerCats
    ? data.workerByCategory || []
    : (data.workerByCategory || []).slice(0, 4);

  const highlightedExpenses = useMemo(() => {
    let items = data.recentExpenses || [];

    if (expenseId) {
      const exact = items.filter((item) => item._id === expenseId);
      if (exact.length > 0) return exact;
    }

    if (descriptionFilter || categoryFilter) {
      items = items.filter((item) => {
        const description = item.description?.toLowerCase() || "";
        const category = item.category?.name?.toLowerCase() || "";

        const matchDescription = descriptionFilter
          ? description.includes(descriptionFilter.toLowerCase())
          : true;

        const matchCategory = categoryFilter
          ? category.includes(categoryFilter.toLowerCase())
          : true;

        return matchDescription && matchCategory;
      });
    }

    return items;
  }, [data.recentExpenses, expenseId, descriptionFilter, categoryFilter]);

  const highlightedWorkers = useMemo(() => {
    let items = data.recentWorkers || [];

    if (workerId) {
      const exact = items.filter((item) => item._id === workerId);
      if (exact.length > 0) return exact;
    }

    if (workerNameFilter || workerCategoryFilter) {
      items = items.filter((item) => {
        const workerName = item.workerName?.toLowerCase() || "";
        const category = item.category?.name?.toLowerCase() || "";

        const matchWorkerName = workerNameFilter
          ? workerName.includes(workerNameFilter.toLowerCase())
          : true;

        const matchCategory = workerCategoryFilter
          ? category.includes(workerCategoryFilter.toLowerCase())
          : true;

        return matchWorkerName && matchCategory;
      });
    }

    return items;
  }, [data.recentWorkers, workerId, workerNameFilter, workerCategoryFilter]);

  const resolveExpenseCategory = (item) =>
    expenseCategories.find(
      (cat) =>
        cat._id === item?._id ||
        String(cat.name || "").trim().toLowerCase() ===
          String(item?.name || "").trim().toLowerCase()
    );

  const resolveWorkerCategory = (item) =>
    workerCategories.find(
      (cat) =>
        cat._id === item?._id ||
        String(cat.name || "").trim().toLowerCase() ===
          String(item?.name || "").trim().toLowerCase()
    );

  const renameExpenseCategory = async (categoryId, currentName) => {
    const nextName = window.prompt("Edit expense category name", currentName);
    if (nextName === null) return;

    const cleanName = String(nextName).trim();

    if (!cleanName) {
      toast.error("Category name is required");
      return;
    }

    try {
      await api.put(`/expense-categories/${categoryId}`, { name: cleanName });
      toast.success("Expense category updated");
      setOpenCategoryMenu(null);
      await fetchReports();
    } catch (err) {
      console.error("Reports expense category rename error:", err);
      toast.error(err?.response?.data?.error || "Failed to update category");
    }
  };

  const deleteExpenseCategory = async (categoryId, currentName) => {
    const ok = window.confirm(`Delete expense category "${currentName}"?`);
    if (!ok) return;

    try {
      await api.delete(`/expense-categories/${categoryId}`);
      toast.success("Expense category deleted");
      setOpenCategoryMenu(null);
      await fetchReports();
    } catch (err) {
      console.error("Reports expense category delete error:", err);
      toast.error(err?.response?.data?.error || "Failed to delete category");
    }
  };

  const renameWorkerCategory = async (categoryId, currentName) => {
    const nextName = window.prompt("Edit worker category name", currentName);
    if (nextName === null) return;

    const cleanName = String(nextName).trim();

    if (!cleanName) {
      toast.error("Category name is required");
      return;
    }

    try {
      await api.put(`/worker-categories/${categoryId}`, { name: cleanName });
      toast.success("Worker category updated");
      setOpenCategoryMenu(null);
      await fetchReports();
    } catch (err) {
      console.error("Reports worker category rename error:", err);
      toast.error(err?.response?.data?.error || "Failed to update category");
    }
  };

  const deleteWorkerCategory = async (categoryId, currentName) => {
    const ok = window.confirm(`Delete worker category "${currentName}"?`);
    if (!ok) return;

    try {
      await api.delete(`/worker-categories/${categoryId}`);
      toast.success("Worker category deleted");
      setOpenCategoryMenu(null);
      await fetchReports();
    } catch (err) {
      console.error("Reports worker category delete error:", err);
      toast.error(err?.response?.data?.error || "Failed to delete category");
    }
  };

  const renderCategoryRow = (item, index, type) => {
    const isExpense = type === "expense";
    const totalBase = isExpense ? totalExpenses : totalWorkers;
    const percentWidth = safePercent(item.total, totalBase);
    const percentText = realPercent(item.total, totalBase);
    const meta = isExpense
      ? getExpenseCategoryMeta(item.name)
      : getWorkerCategoryMeta(item.name);
    const Icon = meta.Icon;
    const realCategory = isExpense ? resolveExpenseCategory(item) : resolveWorkerCategory(item);
    const menuKey = realCategory?._id || `${type}-${item.name}-${index}`;

    return (
      <article key={`${type}-cat-${item.name}-${index}`} className="reports-category-row">
        <div className={`reports-category-icon ${isExpense ? "expense" : "worker"} ${meta.className}`}>
          <Icon />
        </div>

        <div className="reports-category-main">
          <div className="reports-category-top">
            <strong>{item.name || "Uncategorized"}</strong>

            <div className="reports-category-actions">
              <span>{money(item.total)}</span>

              {realCategory ? (
                <div className="reports-menu-wrap">
                  <button
                    type="button"
                    className="reports-menu-btn"
                    onClick={() =>
                      setOpenCategoryMenu((prev) => (prev === menuKey ? null : menuKey))
                    }
                    aria-label="Open category menu"
                  >
                    ⋯
                  </button>

                  {openCategoryMenu === menuKey ? (
                    <div className="reports-menu">
                      <button
                        type="button"
                        onClick={() =>
                          isExpense
                            ? renameExpenseCategory(realCategory._id, realCategory.name)
                            : renameWorkerCategory(realCategory._id, realCategory.name)
                        }
                      >
                        Edit category
                      </button>

                      <button
                        type="button"
                        className="danger"
                        onClick={() =>
                          isExpense
                            ? deleteExpenseCategory(realCategory._id, realCategory.name)
                            : deleteWorkerCategory(realCategory._id, realCategory.name)
                        }
                      >
                        Delete category
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="reports-category-meter">
            <div
              className={isExpense ? "expense" : "worker"}
              style={{ width: `${percentWidth}%` }}
            />
          </div>

          <div className="reports-category-bottom">
            <small>
              {item.count || 0} record{item.count === 1 ? "" : "s"}
            </small>
            <small>{percentText}%</small>
          </div>
        </div>
      </article>
    );
  };

  const renderRecentExpense = (item) => {
    const categoryName = item.category?.name || "Uncategorized";
    const meta = getExpenseCategoryMeta(categoryName);
    const Icon = meta.Icon;

    return (
      <article key={item._id} className="reports-record-row">
        <div className={`reports-record-icon expense ${meta.className}`}>
          <Icon />
        </div>

        <div className="reports-record-main">
          <strong>{item.description || "Expense"}</strong>
          <span>{formatShortDate(item.createdAt)}</span>
        </div>

        <b className="negative">-{money(item.amount)}</b>
        <FaChevronRight className="reports-row-arrow" />
      </article>
    );
  };

  const renderRecentWorker = (item) => {
    const categoryName = item.category?.name || "Uncategorized";
    const meta = getWorkerCategoryMeta(categoryName);
    const Icon = meta.Icon;

    return (
      <article key={item._id} className="reports-record-row">
        <div className={`reports-record-icon worker ${meta.className}`}>
          <Icon />
        </div>

        <div className="reports-record-main">
          <strong>{item.workerName || "Worker"}</strong>
          <span>{formatShortDate(item.createdAt)}</span>
        </div>

        <b className="negative">-{money(item.amount)}</b>
        <FaChevronRight className="reports-row-arrow" />
      </article>
    );
  };

  const renderGraphLine = (line, className) => (
    <>
      <polyline points={line.path} className={className} />

      {line.points.map((point) => (
        <button
          key={`${className}-${point.series}-${point.key}`}
          type="button"
          className="reports-graph-dot-button"
          style={{
            left: `${point.x}px`,
            top: `${point.y}px`,
          }}
          onClick={() => setActiveGraphPoint(point)}
          aria-label={`${point.series} ${point.label} ${money(point.value)}`}
        />
      ))}
    </>
  );

  const activePoint = chart.hasRealGraphData
    ? activeGraphPoint || chart.income.points[Math.max(chart.income.points.length - 4, 0)]
    : null;

  return (
    <div className={`reports-page${settingsOpen ? " reports-menu-open" : ""}`}>
      {activePanel === "settings" ? (
        <section className="reports-panel reports-settings-panel">
          <div className="reports-section-head">
            <div>
              <h3>Settings</h3>
              <p>Profile, security, install, and app options.</p>
            </div>

            <button type="button" onClick={closeSettingsPanel}>
              Close
            </button>
          </div>

          <div className="reports-settings-grid">
            <div>
              <span>👤</span>
              <strong>Profile</strong>
              <p>Manage account details later.</p>
            </div>

            <div>
              <span>🔐</span>
              <strong>Login & Security</strong>
              <p>Password and protection controls.</p>
            </div>

            <div>
              <span>📊</span>
              <strong>Reports</strong>
              <p>Filters and report preferences.</p>
            </div>

            <div>
              <span>📱</span>
              <strong>Install App</strong>
              <p>PWA and offline options.</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="reports-hero">
        <img
          src={reportsHeaderBackground}
          alt=""
          className="reports-hero-bg"
          aria-hidden="true"
        />
        <div className="reports-hero-overlay" />

        <div className="reports-top-row">
          <div className="reports-brand">
            <div className="reports-brand-mark">
              <FarmPremiumLogoMark />
            </div>

            <div className="reports-brand-copy">
              <strong>Farm Expense Tracker</strong>
              <span>Expenses, workers, reports</span>
            </div>
          </div>

          <div className="reports-settings-wrap" ref={settingsMenuRef}>
            <button
              type="button"
              className="reports-settings-button"
              aria-label="Settings"
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen((prev) => !prev)}
            >
              <IoSettingsOutline />
            </button>

            {settingsOpen && (
              <div className="premium-profile-dropdown reports-profile-dropdown">
                <div className="premium-profile-head">
                  <div className="premium-profile-avatar">{initials}</div>

                  <div>
                    <strong>{user?.name || "User"}</strong>
                    <span>{user?.email || "No email"}</span>
                  </div>
                </div>

                <div className="premium-profile-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setSettingsOpen(false);
                      navigate("/");
                    }}
                  >
                    <span>🏠</span>
                    <div>
                      <strong>Home</strong>
                      <small>Go to dashboard</small>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSettingsOpen(false);
                      navigate("/reports");
                    }}
                  >
                    <span>📊</span>
                    <div>
                      <strong>Reports</strong>
                      <small>See totals and insights</small>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      openSettingsPanel();
                    }}
                  >
                    <span>⚙️</span>
                    <div>
                      <strong>Settings</strong>
                      <small>App and account options</small>
                    </div>
                  </button>

                  <button type="button" className="danger" onClick={handleLogout}>
                    <span>🚪</span>
                    <div>
                      <strong>Logout</strong>
                      <small>Sign out safely</small>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="reports-title-row">
          <div className="reports-title-icon">
            <FaRegFileAlt />
          </div>

          <div className="reports-title-copy">
            <h2>Reports</h2>
          </div>
        </div>
      </section>

      <section className="reports-summary-card">
        <div className="reports-summary-left">
          <span>Total Tracked</span>
          <h3>{loading ? "—" : money(totalTracked)}</h3>

          <div className="reports-summary-split">
            <div>
              <span className="reports-split-icon">
                <FaWallet />
              </span>

              <span className="reports-split-line" />

              <div>
                <small>Expenses</small>
                <strong>{loading ? "—" : money(totalExpenses)}</strong>
              </div>
            </div>

            <div>
              <span className="reports-split-icon">
                <FaUsers />
              </span>

              <span className="reports-split-line" />

              <div>
                <small>Workers</small>
                <strong>{loading ? "—" : money(totalWorkers)}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="reports-graph-box">
          <div className="reports-graph-top">
            <div className="reports-graph-tabs" role="tablist" aria-label="Graph mode">
              <button
                type="button"
                className={graphMode === "summary" ? "active" : ""}
                onClick={() => setGraphMode("summary")}
              >
                Total
              </button>

              <button
                type="button"
                className={graphMode === "detail" ? "active" : ""}
                onClick={() => setGraphMode("detail")}
              >
                Detail
              </button>
            </div>

            <span>
              Net {netProfit >= 0 ? "+" : "-"} {money(Math.abs(netProfit))}
            </span>
          </div>

          <div className="reports-graph-scroll">
            <div
              className="reports-graph-canvas"
              style={{ width: `${chart.svgWidth}px` }}
            >
              {activePoint && (
                <div
                  className="reports-chart-tooltip"
                  style={{
                    left: `${Math.max(8, Math.min(activePoint.x - 52, chart.svgWidth - 112))}px`,
                    top: `${Math.max(8, activePoint.y - 58)}px`,
                  }}
                >
                  <strong>{activePoint.label}</strong>
                  <span>{activePoint.series}</span>
                  <b>{money(activePoint.value)}</b>
                </div>
              )}

              {activePoint && (
                <span
                  className="reports-chart-guide"
                  style={{ left: `${activePoint.x}px` }}
                />
              )}

              <svg
                className="reports-graph"
                viewBox={`0 0 ${chart.svgWidth} ${chart.svgHeight}`}
                preserveAspectRatio="none"
              >
                <line x1="12" y1="18" x2={chart.svgWidth - 12} y2="18" className="grid" />
                <line x1="12" y1="48" x2={chart.svgWidth - 12} y2="48" className="grid" />
                <line x1="12" y1="78" x2={chart.svgWidth - 12} y2="78" className="grid" />
                <line x1="12" y1="106" x2={chart.svgWidth - 12} y2="106" className="axis" />

                {chart.hasRealGraphData ? (
                  graphMode === "summary" ? (
                    <>
                      <polyline points={chart.income.path} className="income-line" />
                      <polyline points={chart.spent.path} className="spent-line" />
                    </>
                  ) : (
                    <>
                      <polyline points={chart.income.path} className="income-line" />
                      <polyline points={chart.expenses.path} className="expense-line" />
                      <polyline points={chart.workers.path} className="worker-line" />
                      <polyline points={chart.cashOut.path} className="cashout-line" />
                    </>
                  )
                ) : null}
              </svg>

              {chart.hasRealGraphData ? (
                <div className="reports-graph-click-layer">
                  {graphMode === "summary" ? (
                    <>
                      {renderGraphLine(chart.income, "income-hit")}
                      {renderGraphLine(chart.spent, "spent-hit")}
                    </>
                  ) : (
                    <>
                      {renderGraphLine(chart.income, "income-hit")}
                      {renderGraphLine(chart.expenses, "expense-hit")}
                      {renderGraphLine(chart.workers, "worker-hit")}
                      {renderGraphLine(chart.cashOut, "cashout-hit")}
                    </>
                  )}
                </div>
              ) : (
                <div className="reports-graph-empty-state">
                  <strong>No graph data yet</strong>
                  <span>Add expense, worker, sales, or cash entries to build this graph.</span>
                </div>
              )}

              <div className="reports-graph-dates">
                {chart.rows.map((item) => (
                  <span key={item.key} style={{ left: `${18 + item.index * 44}px` }}>
                    {item.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {chart.hasRealGraphData ? (
            <div className="reports-graph-legend">
              {graphMode === "summary" ? (
                <>
                  <span className="income">Income</span>
                  <span className="spent">Spent</span>
                </>
              ) : (
                <>
                  <span className="income">Income</span>
                  <span className="expense">Expenses</span>
                  <span className="worker">Workers</span>
                  <span className="cashout">Cash Out</span>
                </>
              )}
            </div>
          ) : (
            <div className="reports-graph-legend reports-graph-legend-empty">
              <span>Graph is empty</span>
            </div>
          )}
        </div>
      </section>

      <section className="reports-entry-grid">
        <article className="reports-entry-card">
          <div className="reports-entry-icon expense">
            <FaRegFileAlt />
          </div>

          <div>
            <span>Expense Entries</span>
            <strong>{data.totalExpenseEntries || 0}</strong>
            <small>This period</small>
          </div>

          <FaChevronRight />
        </article>

        <article className="reports-entry-card">
          <div className="reports-entry-icon worker">
            <FaUsers />
          </div>

          <div>
            <span>Worker Entries</span>
            <strong>{data.totalWorkerEntries || 0}</strong>
            <small>This period</small>
          </div>

          <FaChevronRight />
        </article>
      </section>

      <section className="reports-two-grid">
        <article className="reports-panel reports-list-panel">
          <div className="reports-card-head">
            <h3>Expense Categories</h3>

            {(data.expenseByCategory || []).length > 4 ? (
              <button
                type="button"
                onClick={() => setShowAllExpenseCats((prev) => !prev)}
              >
                {showAllExpenseCats ? "View less" : "View all"}
                <FaChevronRight />
              </button>
            ) : null}
          </div>

          {loading ? (
            <div className="reports-empty">Loading categories...</div>
          ) : visibleExpenseCategories.length === 0 ? (
            <div className="reports-empty">No expense categories</div>
          ) : (
            <div className="reports-category-list">
              {visibleExpenseCategories.map((item, index) =>
                renderCategoryRow(item, index, "expense")
              )}
            </div>
          )}

          <div className="reports-total-strip expense">
            <span>Total Expenses</span>
            <strong>{money(totalExpenses)}</strong>
          </div>
        </article>

        <article className="reports-panel reports-list-panel">
          <div className="reports-card-head">
            <h3>Worker Categories</h3>

            {(data.workerByCategory || []).length > 4 ? (
              <button
                type="button"
                onClick={() => setShowAllWorkerCats((prev) => !prev)}
              >
                {showAllWorkerCats ? "View less" : "View all"}
                <FaChevronRight />
              </button>
            ) : null}
          </div>

          {loading ? (
            <div className="reports-empty">Loading categories...</div>
          ) : visibleWorkerCategories.length === 0 ? (
            <div className="reports-empty">No worker categories</div>
          ) : (
            <div className="reports-category-list">
              {visibleWorkerCategories.map((item, index) =>
                renderCategoryRow(item, index, "worker")
              )}
            </div>
          )}

          <div className="reports-total-strip worker">
            <span>Total Worker Payments</span>
            <strong>{money(totalWorkers)}</strong>
          </div>
        </article>
      </section>

      {!loading && (descriptionFilter || categoryFilter || expenseId) ? (
        <section className="reports-panel reports-detail-panel">
          <div className="reports-section-head">
            <div>
              <h3>Expense Detail</h3>
              <p>Opened from recent activity.</p>
            </div>
          </div>

          {highlightedExpenses.length === 0 ? (
            <div className="reports-empty">No matching expense found</div>
          ) : (
            <div className="reports-record-list">
              {highlightedExpenses.map((item) => (
                <article key={item._id} className="reports-detail-record">
                  <span className="expense">
                    <FaWallet />
                  </span>

                  <div>
                    <strong>{item.description || "Expense"}</strong>
                    <small>Category: {item.category?.name || "Uncategorized"}</small>
                    <small>Created: {formatDateTime(item.createdAt)}</small>
                  </div>

                  <b className="negative">-{money(item.amount)}</b>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {!loading && (workerNameFilter || workerCategoryFilter || workerId) ? (
        <section className="reports-panel reports-detail-panel">
          <div className="reports-section-head">
            <div>
              <h3>Worker Payment Detail</h3>
              <p>Opened from recent activity.</p>
            </div>
          </div>

          {highlightedWorkers.length === 0 ? (
            <div className="reports-empty">No matching worker payment found</div>
          ) : (
            <div className="reports-record-list">
              {highlightedWorkers.map((item) => (
                <article key={item._id} className="reports-detail-record">
                  <span className="worker">
                    <FaUserAlt />
                  </span>

                  <div>
                    <strong>{item.workerName || "Worker"}</strong>
                    <small>Category: {item.category?.name || "Uncategorized"}</small>
                    <small>{item.description || "No description added"}</small>
                    <small>Created: {formatDateTime(item.createdAt)}</small>
                  </div>

                  <b className="negative">-{money(item.amount)}</b>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section className="reports-two-grid">
        <article className="reports-panel reports-list-panel">
          <div className="reports-card-head">
            <h3>Recent Expenses</h3>

            {(data.recentExpenses || []).length > 4 ? (
              <button type="button">
                View all
                <FaChevronRight />
              </button>
            ) : null}
          </div>

          {loading ? (
            <div className="reports-empty">Loading recent expenses...</div>
          ) : (data.recentExpenses || []).length === 0 ? (
            <div className="reports-empty">No recent expense records</div>
          ) : (
            <div className="reports-record-list">
              {(data.recentExpenses || []).slice(0, 4).map(renderRecentExpense)}
            </div>
          )}
        </article>

        <article className="reports-panel reports-list-panel">
          <div className="reports-card-head">
            <h3>Recent Worker Payments</h3>

            {(data.recentWorkers || []).length > 4 ? (
              <button type="button">
                View all
                <FaChevronRight />
              </button>
            ) : null}
          </div>

          {loading ? (
            <div className="reports-empty">Loading worker payments...</div>
          ) : (data.recentWorkers || []).length === 0 ? (
            <div className="reports-empty">No recent worker records</div>
          ) : (
            <div className="reports-record-list">
              {(data.recentWorkers || []).slice(0, 4).map(renderRecentWorker)}
            </div>
          )}
        </article>
      </section>

      <section className="reports-panel reports-overview-panel">
        <div className="reports-section-head">
          <div>
            <h3>Overview</h3>
            <p>Quick financial read for this account.</p>
          </div>

          <button type="button" onClick={() => fetchReports()}>
            Refresh
          </button>
        </div>

        <div className="reports-overview-grid">
          <div>
            <span>Total Income</span>
            <strong className="positive">{money(totalIncome)}</strong>
          </div>

          <div>
            <span>Total Expenses</span>
            <strong className="negative">{money(totalExpenses)}</strong>
          </div>

          <div>
            <span>Worker Payments</span>
            <strong>{money(totalWorkers)}</strong>
          </div>
 
          <div>
            <span>Net Profit</span>
            <strong className={netProfit >= 0 ? "positive" : "negative"}>
              {money(netProfit)}
            </strong>
          </div>
        </div>
      </section>

      <div className="reports-bottom-space" />
    </div>
  );
}