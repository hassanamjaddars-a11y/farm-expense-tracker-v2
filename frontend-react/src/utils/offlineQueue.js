const PENDING_EXPENSES_KEY = "farm_pending_expenses";
const PENDING_WORKERS_KEY = "farm_pending_workers";
const PENDING_EXPENSE_CATEGORIES_KEY = "farm_pending_expense_categories";
const PENDING_WORKER_CATEGORIES_KEY = "farm_pending_worker_categories";
const PENDING_SALES_KEY = "farm_pending_sales";

const CACHED_EXPENSES_KEY = "farm_cached_expenses";
const CACHED_WORKERS_KEY = "farm_cached_workers";
const CACHED_EXPENSE_CATEGORIES_KEY = "farm_cached_expense_categories";
const CACHED_WORKER_CATEGORIES_KEY = "farm_cached_worker_categories";
const CACHED_REPORTS_KEY = "farm_cached_reports";
const CACHED_SALES_PAGE_KEY = "farm_sales_page_cache_v1";

const getActiveUserScope = () => {
  try {
    const email = String(localStorage.getItem("farm_last_email") || "")
      .trim()
      .toLowerCase();

    const safe = email.replace(/[^a-z0-9]+/g, "_");
    return safe || "guest";
  } catch (err) {
    console.error("getActiveUserScope error:", err);
    return "guest";
  }
};

const buildScopedKey = (baseKey) => {
  return `${baseKey}__${getActiveUserScope()}`;
};

const safeRead = (baseKey, fallback = []) => {
  try {
    const scopedKey = buildScopedKey(baseKey);
    const scopedRaw = localStorage.getItem(scopedKey);

    if (scopedRaw !== null) {
      return JSON.parse(scopedRaw);
    }

    const legacyRaw = localStorage.getItem(baseKey);

    if (legacyRaw !== null) {
      const parsed = JSON.parse(legacyRaw);
      localStorage.setItem(scopedKey, legacyRaw);
      localStorage.removeItem(baseKey);
      return parsed;
    }

    return fallback;
  } catch (err) {
    console.error("safeRead error:", err);
    return fallback;
  }
};

const safeWrite = (baseKey, value) => {
  try {
    localStorage.setItem(buildScopedKey(baseKey), JSON.stringify(value));
  } catch (err) {
    console.error("safeWrite error:", err);
  }
};

const nowIso = () => new Date().toISOString();

const normalizeName = (value) => String(value || "").trim().toLowerCase();

const isLocalCategoryId = (value) => String(value || "").startsWith("local-");

const sortByCreatedAtDesc = (items) => {
  return [...items].sort((a, b) => {
    const aTime = new Date(a?.createdAt || 0).getTime();
    const bTime = new Date(b?.createdAt || 0).getTime();
    return bTime - aTime;
  });
};

const sortCategoriesByName = (items) => {
  return [...items].sort((a, b) => {
    return String(a?.name || "").localeCompare(String(b?.name || ""));
  });
};

const matchesPendingId = (item, idOrClientId) => {
  return item?._id === idOrClientId || item?.clientId === idOrClientId;
};

export const isOnlineNow = () => {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
};

export const createClientId = (prefix) => {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const SALES_EMPTY_SUMMARY = {
  totalSales: 0,
  totalQuantity: 0,
  grossSalesAmount: 0,
  ownerIncomeAmount: 0,
  workersAllocationAmount: 0,
};

const SALES_DEFAULT_SETTINGS = {
  murhWeightKg: 20,
  defaultOwnerSharePercentage: 70,
  defaultWorkerSharePercentage: 30,
  currencyLabel: "PKR",
};

const UNIT_WEIGHT_KG = {
  murh: 20,
  maund: 40,
  kg: 1,
};

const getSaleUnitWeightKg = (unit, fallback) => {
  const explicit = Number(fallback || 0);
  if (explicit > 0) return explicit;

  return UNIT_WEIGHT_KG[String(unit || "kg").toLowerCase()] || 1;
};

const cleanSaleWorkerName = (worker) => {
  if (typeof worker === "string") return worker.trim();

  return String(worker?.workerName || worker?.fullName || worker?.name || "").trim();
};

const normalizeSalePayload = (payload = {}) => {
  const quantity = Number(payload.quantity || 0);
  const rate = Number(payload.rate || 0);
  const unit = payload.unit || "kg";
  const unitWeightKg = getSaleUnitWeightKg(unit, payload.unitWeightKg);

  const totalAmount =
    Number(payload.totalAmount || 0) > 0
      ? Number(payload.totalAmount)
      : quantity * rate;

  const ownerSharePercentage = Number(payload.ownerSharePercentage ?? 70);
  const workerSharePercentage = Number(
    payload.workerSharePercentage ?? Math.max(0, 100 - ownerSharePercentage)
  );

  const ownerAmount = (totalAmount * ownerSharePercentage) / 100;
  const workersAllocationAmount = Math.max(0, totalAmount - ownerAmount);

  const workers = Array.isArray(payload.workers)
    ? payload.workers
        .map((worker) => cleanSaleWorkerName(worker))
        .filter(Boolean)
        .map((workerName) => ({ workerName }))
    : [];

  return {
    clientId: payload.clientId || createClientId("sale"),
    productName: String(payload.productName || "").trim(),
    quantity,
    unit,
    unitWeightKg,
    totalWeightKg: quantity * unitWeightKg,
    rate,
    totalAmount,
    ownerSharePercentage,
    workerSharePercentage,
    ownerAmount,
    ownerIncomeAmount: ownerAmount,
    workersAllocationAmount,
    saleDate: payload.saleDate || nowIso().slice(0, 10),
    note: String(payload.note || "").trim(),
    distributionMode: payload.distributionMode || "equal",
    workers,
    billImageUrls: Array.isArray(payload.billImageUrls) ? payload.billImageUrls : [],
  };
};

const buildWorkerSplitsForSale = (sale) => {
  const workers = Array.isArray(sale.workers) ? sale.workers : [];

  if (!workers.length) return [];

  const totalWorkerAmount = Number(sale.workersAllocationAmount || 0);
  const perWorkerAmount = totalWorkerAmount / workers.length;

  return workers.map((worker) => ({
    workerName: cleanSaleWorkerName(worker),
    amount: perWorkerAmount,
  }));
};

const buildSaleItemFromPayload = (payload = {}, extra = {}) => {
  const sale = normalizeSalePayload(payload);
  const createdAt = extra.createdAt || payload.createdAt || nowIso();

  return {
    _id: extra._id || payload._id || `local-sale-${sale.clientId}`,
    ...sale,
    createdAt,
    updatedAt: extra.updatedAt || payload.updatedAt || createdAt,
    workerSplits: Array.isArray(payload.workerSplits)
      ? payload.workerSplits
      : buildWorkerSplitsForSale(sale),
    isPendingSync: extra.isPendingSync ?? payload.isPendingSync ?? true,
  };
};

const buildSalesSummary = (items = []) => {
  const safeItems = Array.isArray(items) ? items : [];

  return safeItems.reduce(
    (summary, item) => {
      summary.totalSales += 1;
      summary.totalQuantity += Number(item?.quantity || 0);
      summary.grossSalesAmount += Number(item?.totalAmount || 0);
      summary.ownerIncomeAmount += Number(
        item?.ownerAmount || item?.ownerIncomeAmount || 0
      );
      summary.workersAllocationAmount += Number(
        item?.workersAllocationAmount || item?.workerAmount || 0
      );

      return summary;
    },
    { ...SALES_EMPTY_SUMMARY }
  );
};

const cleanSalesPageSnapshot = (payload = {}) => {
  return {
    items: Array.isArray(payload?.items) ? payload.items : [],
    summary: {
      ...SALES_EMPTY_SUMMARY,
      ...(payload?.summary || {}),
    },
    settings: {
      ...SALES_DEFAULT_SETTINGS,
      ...(payload?.settings || {}),
      currencyLabel: "PKR",
    },
    workerRecords: Array.isArray(payload?.workerRecords) ? payload.workerRecords : [],
  };
};

const notifySalesCacheUpdated = () => {
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("farm-sales-cache-updated"));
    }
  } catch (err) {
    console.warn("Sales cache update event error:", err);
  }
};

export const getPendingExpenses = () => safeRead(PENDING_EXPENSES_KEY, []);
export const getPendingWorkers = () => safeRead(PENDING_WORKERS_KEY, []);
export const getPendingExpenseCategories = () =>
  safeRead(PENDING_EXPENSE_CATEGORIES_KEY, []);
export const getPendingWorkerCategories = () =>
  safeRead(PENDING_WORKER_CATEGORIES_KEY, []);
export const getPendingSales = () => safeRead(PENDING_SALES_KEY, []);

export const cacheExpenses = (items) => safeWrite(CACHED_EXPENSES_KEY, items || []);
export const getCachedExpenses = () => safeRead(CACHED_EXPENSES_KEY, []);

export const cacheWorkers = (items) => safeWrite(CACHED_WORKERS_KEY, items || []);
export const getCachedWorkers = () => safeRead(CACHED_WORKERS_KEY, []);

export const cacheExpenseCategories = (items) =>
  safeWrite(CACHED_EXPENSE_CATEGORIES_KEY, items || []);
export const getCachedExpenseCategories = () =>
  safeRead(CACHED_EXPENSE_CATEGORIES_KEY, []);

export const cacheWorkerCategories = (items) =>
  safeWrite(CACHED_WORKER_CATEGORIES_KEY, items || []);
export const getCachedWorkerCategories = () =>
  safeRead(CACHED_WORKER_CATEGORIES_KEY, []);

export const cacheReportsSnapshot = (data) =>
  safeWrite(CACHED_REPORTS_KEY, data || {});

export const getCachedReportsSnapshot = () =>
  safeRead(CACHED_REPORTS_KEY, {
    totalExpenses: 0,
    totalWorkers: 0,
    grandTotal: 0,
    totalExpenseEntries: 0,
    totalWorkerEntries: 0,
    expenseByCategory: [],
    workerByCategory: [],
    recentExpenses: [],
    recentWorkers: [],
  });

export const cacheSalesPageSnapshot = (payload) => {
  safeWrite(CACHED_SALES_PAGE_KEY, cleanSalesPageSnapshot(payload));
};

export const getCachedSalesPageSnapshot = () =>
  cleanSalesPageSnapshot(safeRead(CACHED_SALES_PAGE_KEY, cleanSalesPageSnapshot()));

export const mergeSalesWithPending = (serverSales = []) => {
  const pending = getPendingSales();

  const existingClientIds = new Set(
    (serverSales || []).map((item) => item?.clientId).filter(Boolean)
  );

  const existingIds = new Set(
    (serverSales || []).map((item) => item?._id).filter(Boolean)
  );

  const filteredPending = pending.filter((item) => {
    return !existingClientIds.has(item?.clientId) && !existingIds.has(item?._id);
  });

  return sortByCreatedAtDesc([...(serverSales || []), ...filteredPending]);
};

export const buildSalesPageWithPending = (basePage = {}) => {
  const base = cleanSalesPageSnapshot(basePage);
  const items = mergeSalesWithPending(base.items || []);
  const summary = buildSalesSummary(items);

  return {
    ...base,
    items,
    summary,
  };
};

export const getSalesPageSnapshotWithPending = () => {
  return buildSalesPageWithPending(getCachedSalesPageSnapshot());
};

export const mergeExpenseCategoriesWithPending = (serverCategories = []) => {
  const pending = getPendingExpenseCategories();

  const existingClientIds = new Set(
    (serverCategories || []).map((item) => item?.clientId).filter(Boolean)
  );

  const existingNames = new Set(
    (serverCategories || [])
      .map((item) => normalizeName(item?.name))
      .filter(Boolean)
  );

  const filteredPending = pending.filter((item) => {
    return (
      !existingClientIds.has(item?.clientId) &&
      !existingNames.has(normalizeName(item?.name))
    );
  });

  return sortCategoriesByName([...(serverCategories || []), ...filteredPending]);
};

export const mergeWorkerCategoriesWithPending = (serverCategories = []) => {
  const pending = getPendingWorkerCategories();

  const existingClientIds = new Set(
    (serverCategories || []).map((item) => item?.clientId).filter(Boolean)
  );

  const existingNames = new Set(
    (serverCategories || [])
      .map((item) => normalizeName(item?.name))
      .filter(Boolean)
  );

  const filteredPending = pending.filter((item) => {
    return (
      !existingClientIds.has(item?.clientId) &&
      !existingNames.has(normalizeName(item?.name))
    );
  });

  return sortCategoriesByName([...(serverCategories || []), ...filteredPending]);
};

export const queueExpenseCategoryOffline = (name) => {
  const cleanName = String(name || "").trim();

  if (!cleanName) return null;

  const existing = mergeExpenseCategoriesWithPending(getCachedExpenseCategories()).find(
    (item) => normalizeName(item?.name) === normalizeName(cleanName)
  );

  if (existing) {
    return existing;
  }

  const clientId = createClientId("expense_category");

  const item = {
    _id: `local-expcat-${clientId}`,
    clientId,
    name: cleanName,
    createdAt: nowIso(),
    isPendingSync: true,
  };

  const current = getPendingExpenseCategories();
  safeWrite(PENDING_EXPENSE_CATEGORIES_KEY, [item, ...current]);

  return item;
};

export const queueWorkerCategoryOffline = (name) => {
  const cleanName = String(name || "").trim();

  if (!cleanName) return null;

  const existing = mergeWorkerCategoriesWithPending(getCachedWorkerCategories()).find(
    (item) => normalizeName(item?.name) === normalizeName(cleanName)
  );

  if (existing) {
    return existing;
  }

  const clientId = createClientId("worker_category");

  const item = {
    _id: `local-workcat-${clientId}`,
    clientId,
    name: cleanName,
    createdAt: nowIso(),
    isPendingSync: true,
  };

  const current = getPendingWorkerCategories();
  safeWrite(PENDING_WORKER_CATEGORIES_KEY, [item, ...current]);

  return item;
};

export const queueExpenseOffline = ({
  description,
  amount,
  categoryId,
  categoryName,
  categoryClientId,
}) => {
  const clientId = createClientId("expense");

  const item = {
    _id: `local-exp-${clientId}`,
    clientId,
    description: String(description || "").trim(),
    amount: Number(amount || 0),
    category: {
      _id: categoryId,
      name: categoryName || "Uncategorized",
      clientId: categoryClientId || null,
    },
    createdAt: nowIso(),
    isPendingSync: true,
  };

  const current = getPendingExpenses();
  safeWrite(PENDING_EXPENSES_KEY, [item, ...current]);

  return item;
};

export const queueWorkerOffline = ({
  workerName,
  amount,
  description,
  categoryId,
  categoryName,
  categoryClientId,
}) => {
  const clientId = createClientId("worker");

  const item = {
    _id: `local-worker-${clientId}`,
    clientId,
    workerName: String(workerName || "").trim(),
    amount: Number(amount || 0),
    description: String(description || "").trim(),
    category: {
      _id: categoryId,
      name: categoryName || "Uncategorized",
      clientId: categoryClientId || null,
    },
    createdAt: nowIso(),
    isPendingSync: true,
  };

  const current = getPendingWorkers();
  safeWrite(PENDING_WORKERS_KEY, [item, ...current]);

  return item;
};

export const queueSaleOffline = (payload = {}) => {
  const item = buildSaleItemFromPayload(payload, {
    isPendingSync: true,
  });

  const current = getPendingSales();
  safeWrite(PENDING_SALES_KEY, [item, ...current]);

  const cached = getCachedSalesPageSnapshot();
  cacheSalesPageSnapshot(cached);
  notifySalesCacheUpdated();

  return item;
};

export const updatePendingSaleLocal = ({ id, payload = {} }) => {
  const current = getPendingSales();
  let updated = null;

  const next = current.map((item) => {
    if (!matchesPendingId(item, id)) return item;

    updated = buildSaleItemFromPayload(
      {
        ...item,
        ...payload,
        clientId: item.clientId,
      },
      {
        _id: item._id,
        createdAt: item.createdAt,
        updatedAt: nowIso(),
        isPendingSync: true,
      }
    );

    return updated;
  });

  safeWrite(PENDING_SALES_KEY, next);
  notifySalesCacheUpdated();

  return updated;
};

export const deletePendingSaleLocal = (id) => {
  const next = getPendingSales().filter((item) => !matchesPendingId(item, id));
  safeWrite(PENDING_SALES_KEY, next);
  notifySalesCacheUpdated();
};

export const updatePendingExpenseLocal = ({
  id,
  description,
  amount,
  categoryId,
  categoryName,
  categoryClientId,
}) => {
  const current = getPendingExpenses();

  const next = current.map((item) => {
    if (!matchesPendingId(item, id)) return item;

    return {
      ...item,
      description: String(description || "").trim(),
      amount: Number(amount || 0),
      category: {
        _id: categoryId,
        name: categoryName || "Uncategorized",
        clientId: categoryClientId || null,
      },
    };
  });

  safeWrite(PENDING_EXPENSES_KEY, next);

  return next.find((item) => matchesPendingId(item, id)) || null;
};

export const updatePendingWorkerLocal = ({
  id,
  workerName,
  amount,
  description,
  categoryId,
  categoryName,
  categoryClientId,
}) => {
  const current = getPendingWorkers();

  const next = current.map((item) => {
    if (!matchesPendingId(item, id)) return item;

    return {
      ...item,
      workerName: String(workerName || "").trim(),
      amount: Number(amount || 0),
      description: String(description || "").trim(),
      category: {
        _id: categoryId,
        name: categoryName || "Uncategorized",
        clientId: categoryClientId || null,
      },
    };
  });

  safeWrite(PENDING_WORKERS_KEY, next);

  return next.find((item) => matchesPendingId(item, id)) || null;
};

export const deletePendingExpenseLocal = (id) => {
  const next = getPendingExpenses().filter((item) => !matchesPendingId(item, id));
  safeWrite(PENDING_EXPENSES_KEY, next);
};

export const deletePendingWorkerLocal = (id) => {
  const next = getPendingWorkers().filter((item) => !matchesPendingId(item, id));
  safeWrite(PENDING_WORKERS_KEY, next);
};

const removePendingExpense = (clientId) => {
  const next = getPendingExpenses().filter((item) => item.clientId !== clientId);
  safeWrite(PENDING_EXPENSES_KEY, next);
};

const removePendingWorker = (clientId) => {
  const next = getPendingWorkers().filter((item) => item.clientId !== clientId);
  safeWrite(PENDING_WORKERS_KEY, next);
};

const removePendingSale = (clientId) => {
  const next = getPendingSales().filter((item) => item.clientId !== clientId);
  safeWrite(PENDING_SALES_KEY, next);
  notifySalesCacheUpdated();
};

const removePendingExpenseCategory = (clientId) => {
  const next = getPendingExpenseCategories().filter(
    (item) => item.clientId !== clientId
  );
  safeWrite(PENDING_EXPENSE_CATEGORIES_KEY, next);
};

const removePendingWorkerCategory = (clientId) => {
  const next = getPendingWorkerCategories().filter(
    (item) => item.clientId !== clientId
  );
  safeWrite(PENDING_WORKER_CATEGORIES_KEY, next);
};

const replacePendingExpenseCategoryReferences = ({
  localCategoryId,
  localCategoryClientId,
  serverCategory,
}) => {
  const next = getPendingExpenses().map((item) => {
    const category = item?.category || {};

    const match =
      category?._id === localCategoryId ||
      (localCategoryClientId && category?.clientId === localCategoryClientId);

    if (!match) return item;

    return {
      ...item,
      category: {
        _id: serverCategory?._id || category?._id,
        name: serverCategory?.name || category?.name || "Uncategorized",
        clientId: serverCategory?.clientId || localCategoryClientId || null,
      },
    };
  });

  safeWrite(PENDING_EXPENSES_KEY, next);
};

const replacePendingWorkerCategoryReferences = ({
  localCategoryId,
  localCategoryClientId,
  serverCategory,
}) => {
  const next = getPendingWorkers().map((item) => {
    const category = item?.category || {};

    const match =
      category?._id === localCategoryId ||
      (localCategoryClientId && category?.clientId === localCategoryClientId);

    if (!match) return item;

    return {
      ...item,
      category: {
        _id: serverCategory?._id || category?._id,
        name: serverCategory?.name || category?.name || "Uncategorized",
        clientId: serverCategory?.clientId || localCategoryClientId || null,
      },
    };
  });

  safeWrite(PENDING_WORKERS_KEY, next);
};

export const mergeExpensesWithPending = (serverExpenses = []) => {
  const pending = getPendingExpenses();

  const existingClientIds = new Set(
    (serverExpenses || []).map((item) => item?.clientId).filter(Boolean)
  );

  const filteredPending = pending.filter(
    (item) => !existingClientIds.has(item.clientId)
  );

  return sortByCreatedAtDesc([...(serverExpenses || []), ...filteredPending]);
};

export const mergeWorkersWithPending = (serverWorkers = []) => {
  const pending = getPendingWorkers();

  const existingClientIds = new Set(
    (serverWorkers || []).map((item) => item?.clientId).filter(Boolean)
  );

  const filteredPending = pending.filter(
    (item) => !existingClientIds.has(item.clientId)
  );

  return sortByCreatedAtDesc([...(serverWorkers || []), ...filteredPending]);
};

const addCategoryTotals = (baseItems = [], pendingItems = []) => {
  const map = {};

  for (const item of baseItems) {
    map[item.name] = (map[item.name] || 0) + Number(item.total || 0);
  }

  for (const item of pendingItems) {
    const name = item?.category?.name || "Uncategorized";
    map[name] = (map[name] || 0) + Number(item.amount || 0);
  }

  return Object.entries(map)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);
};

export const buildDashboardWithPending = (baseData) => {
  const data = {
    totalExpenses: 0,
    totalWorkers: 0,
    grandTotal: 0,
    totalExpenseEntries: 0,
    totalWorkerEntries: 0,
    expenseByCategory: [],
    workerByCategory: [],
    recentExpenses: [],
    recentWorkers: [],
    ...(baseData || {}),
  };

  const pendingExpenses = getPendingExpenses();
  const pendingWorkers = getPendingWorkers();

  const totalExpenses =
    Number(data.totalExpenses || 0) +
    pendingExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const totalWorkers =
    Number(data.totalWorkers || 0) +
    pendingWorkers.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const recentExpenses = mergeExpensesWithPending(data.recentExpenses || []).slice(0, 5);
  const recentWorkers = mergeWorkersWithPending(data.recentWorkers || []).slice(0, 5);

  return {
    ...data,
    totalExpenses,
    totalWorkers,
    grandTotal: totalExpenses + totalWorkers,
    totalExpenseEntries: Number(data.totalExpenseEntries || 0) + pendingExpenses.length,
    totalWorkerEntries: Number(data.totalWorkerEntries || 0) + pendingWorkers.length,
    expenseByCategory: addCategoryTotals(data.expenseByCategory || [], pendingExpenses),
    workerByCategory: addCategoryTotals(data.workerByCategory || [], pendingWorkers),
    recentExpenses,
    recentWorkers,
  };
};

export const getDashboardSnapshotWithPending = () => {
  return buildDashboardWithPending(getCachedReportsSnapshot());
};

export const hasDashboardData = (data) => {
  return Boolean(
    Number(data?.totalExpenses || 0) > 0 ||
      Number(data?.totalWorkers || 0) > 0 ||
      Number(data?.totalExpenseEntries || 0) > 0 ||
      Number(data?.totalWorkerEntries || 0) > 0 ||
      (data?.expenseByCategory || []).length > 0 ||
      (data?.workerByCategory || []).length > 0 ||
      (data?.recentExpenses || []).length > 0 ||
      (data?.recentWorkers || []).length > 0
  );
};

export const attemptSyncPending = async (api) => {
  if (!isOnlineNow()) {
    return {
      syncedExpenseCategories: 0,
      syncedWorkerCategories: 0,
      syncedExpenses: 0,
      syncedWorkers: 0,
      syncedSales: 0,
    };
  }

  const token = localStorage.getItem("farm_token");

  if (!token) {
    return {
      syncedExpenseCategories: 0,
      syncedWorkerCategories: 0,
      syncedExpenses: 0,
      syncedWorkers: 0,
      syncedSales: 0,
    };
  }

  let syncedExpenseCategories = 0;
  let syncedWorkerCategories = 0;
  let syncedExpenses = 0;
  let syncedWorkers = 0;
  let syncedSales = 0;

  const expenseCategoryQueue = getPendingExpenseCategories();

  for (const item of expenseCategoryQueue) {
    try {
      const res = await api.post("/expense-categories", {
        clientId: item.clientId,
        name: item.name,
      });

      replacePendingExpenseCategoryReferences({
        localCategoryId: item._id,
        localCategoryClientId: item.clientId,
        serverCategory: res?.data,
      });

      removePendingExpenseCategory(item.clientId);
      syncedExpenseCategories += 1;
    } catch (err) {
      console.error("Expense category sync error:", err);

      if (!err?.response) {
        break;
      }
    }
  }

  const workerCategoryQueue = getPendingWorkerCategories();

  for (const item of workerCategoryQueue) {
    try {
      const res = await api.post("/worker-categories", {
        clientId: item.clientId,
        name: item.name,
      });

      replacePendingWorkerCategoryReferences({
        localCategoryId: item._id,
        localCategoryClientId: item.clientId,
        serverCategory: res?.data,
      });

      removePendingWorkerCategory(item.clientId);
      syncedWorkerCategories += 1;
    } catch (err) {
      console.error("Worker category sync error:", err);

      if (!err?.response) {
        break;
      }
    }
  }

  const expenseQueue = getPendingExpenses();

  for (const item of expenseQueue) {
    try {
      if (isLocalCategoryId(item?.category?._id)) {
        continue;
      }

      await api.post("/expenses", {
        clientId: item.clientId,
        description: item.description,
        amount: Number(item.amount),
        category: item.category?._id,
      });

      removePendingExpense(item.clientId);
      syncedExpenses += 1;
    } catch (err) {
      console.error("Expense sync error:", err);

      if (!err?.response) {
        break;
      }
    }
  }

  const workerQueue = getPendingWorkers();

  for (const item of workerQueue) {
    try {
      if (isLocalCategoryId(item?.category?._id)) {
        continue;
      }

      await api.post("/workers", {
        clientId: item.clientId,
        workerName: item.workerName,
        amount: Number(item.amount),
        description: item.description,
        category: item.category?._id,
      });

      removePendingWorker(item.clientId);
      syncedWorkers += 1;
    } catch (err) {
      console.error("Worker sync error:", err);

      if (!err?.response) {
        break;
      }
    }
  }

  const saleQueue = getPendingSales();

  for (const item of saleQueue) {
    try {
      await api.post("/sales", {
        clientId: item.clientId,
        productName: item.productName,
        quantity: Number(item.quantity || 0),
        unit: item.unit,
        unitWeightKg: Number(item.unitWeightKg || 1),
        rate: Number(item.rate || 0),
        totalAmount: Number(item.totalAmount || 0),
        ownerSharePercentage: Number(item.ownerSharePercentage || 0),
        workerSharePercentage: Number(item.workerSharePercentage || 0),
        saleDate: item.saleDate,
        note: item.note || "",
        distributionMode: item.distributionMode || "equal",
        workers: Array.isArray(item.workers) ? item.workers : [],
        billImageUrls: Array.isArray(item.billImageUrls) ? item.billImageUrls : [],
      });

      removePendingSale(item.clientId);
      syncedSales += 1;
    } catch (err) {
      console.error("Sale sync error:", err);

      if (!err?.response) {
        break;
      }
    }
  }

  return {
    syncedExpenseCategories,
    syncedWorkerCategories,
    syncedExpenses,
    syncedWorkers,
    syncedSales,
  };
};