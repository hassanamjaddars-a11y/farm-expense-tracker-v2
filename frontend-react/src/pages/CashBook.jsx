import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import farmPremiumHeader from "../assets/farm-premium-header.png";
import cashbookWalletPkr from "../assets/cashbook-wallet-pkr.png";
import "../styles/cashbook.css";

const CASH_BOOK_STORAGE_KEY = "farm_cashbook_local_entries_v1";
const CASH_BOOK_LINKED_CACHE_KEY = "farm_cashbook_linked_cache_v1";
const CASH_BOOK_API_ENDPOINT_CACHE_KEY = "farm_cashbook_api_endpoint_v1";

const CASH_BOOK_API_ENDPOINTS = [
  "/cash-book",
  "/cashbook",
  "/cash-transactions",
  "/cashtransactions",
];

const EMPTY_REPORTS_DATA = {
  totalExpenses: 0,
  totalWorkers: 0,
  recentExpenses: [],
  recentWorkers: [],
};

const EMPTY_SALES_DATA = {
  items: [],
  summary: {
    ownerIncomeAmount: 0,
    grossSalesAmount: 0,
    totalSales: 0,
    workersAllocationAmount: 0,
  },
};

const readCashBookLinkedCache = () => {
  try {
    const raw = localStorage.getItem(CASH_BOOK_LINKED_CACHE_KEY);
    const parsed = JSON.parse(raw || "{}");

    return {
      reportsData: {
        ...EMPTY_REPORTS_DATA,
        ...(parsed?.reportsData || {}),
        recentExpenses: Array.isArray(parsed?.reportsData?.recentExpenses)
          ? parsed.reportsData.recentExpenses
          : [],
        recentWorkers: Array.isArray(parsed?.reportsData?.recentWorkers)
          ? parsed.reportsData.recentWorkers
          : [],
      },
      salesData: {
        ...EMPTY_SALES_DATA,
        ...(parsed?.salesData || {}),
        items: Array.isArray(parsed?.salesData?.items) ? parsed.salesData.items : [],
        summary: {
          ...EMPTY_SALES_DATA.summary,
          ...(parsed?.salesData?.summary || {}),
        },
      },
    };
  } catch (error) {
    console.error("Cash book linked cache read error:", error);
    return {
      reportsData: EMPTY_REPORTS_DATA,
      salesData: EMPTY_SALES_DATA,
    };
  }
};

const writeCashBookLinkedCache = (payload) => {
  try {
    localStorage.setItem(CASH_BOOK_LINKED_CACHE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.error("Cash book linked cache write error:", error);
  }
};

const todayInputValue = () => new Date().toISOString().slice(0, 10);

const nowTimeValue = () =>
  new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

const money = (value) => `PKR ${Number(value || 0).toLocaleString()}`;

const createId = () =>
  `cash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const readCashBookEntries = () => {
  try {
    const raw = localStorage.getItem(CASH_BOOK_STORAGE_KEY);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Cash book local read error:", error);
    return [];
  }
};

const writeCashBookEntries = (entries) => {
  localStorage.setItem(CASH_BOOK_STORAGE_KEY, JSON.stringify(entries));
};

const localTypeToApiType = (type) => {
  if (type === "opening_balance") return "opening_balance";
  if (type === "cash_in") return "money_in";
  if (type === "cash_out") return "expense";
  return "money_in";
};

const apiTypeToLocalType = (type) => {
  if (type === "opening_balance") return "opening_balance";
  if (type === "money_in" || type === "worker_recovery" || type === "sale_income") {
    return "cash_in";
  }
  return "cash_out";
};

const combineDateAndTime = (dateValue, timeValue) => {
  const fallback = new Date();
  const dateText = dateValue || fallback.toISOString().slice(0, 10);
  const timeText = timeValue || nowTimeValue();
  const parsed = new Date(`${dateText}T${timeText}`);

  return Number.isNaN(parsed.getTime()) ? fallback.toISOString() : parsed.toISOString();
};

const splitApiDateTime = (value) => {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;

  return {
    entryDate: safeDate.toISOString().slice(0, 10),
    entryTime: safeDate.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
};

const isManualCashBookApiItem = (item) => {
  if (!item || item.isSystemGenerated) return false;

  const type = item.type || "";
  const sourceKind = item.sourceKind || "manual";

  return (
    sourceKind === "manual" &&
    ["opening_balance", "money_in", "expense"].includes(type)
  );
};

const apiCashEntryToLocalEntry = (item) => {
  const { entryDate, entryTime } = splitApiDateTime(
    item.transactionDate || item.createdAt
  );
  const localType = apiTypeToLocalType(item.type);

  return {
    id: item.clientId || item._id || createId(),
    dbId: item._id || "",
    clientId: item.clientId || "",
    type: localType,
    amount: Number(item.amount || 0),
    entryDate,
    entryTime,
    note:
      item.note ||
      (localType === "opening_balance"
        ? "Opening cash balance"
        : item.description || ""),
    createdAt: item.createdAt || item.transactionDate || new Date().toISOString(),
    isRemote: true,
  };
};

const buildCashBookApiPayload = (entry) => ({
  clientId: entry.clientId || entry.id,
  type: localTypeToApiType(entry.type),
  amount: Number(entry.amount || 0),
  description:
    entry.type === "opening_balance"
      ? "Opening Balance"
      : entry.note || (entry.type === "cash_in" ? "Cash In" : "Cash Out"),
  note: entry.note || "",
  transactionDate: combineDateAndTime(entry.entryDate, entry.entryTime),
});

const getCachedCashBookApiEndpoint = () => {
  try {
    return sessionStorage.getItem(CASH_BOOK_API_ENDPOINT_CACHE_KEY) || "";
  } catch (error) {
    return "";
  }
};

const setCachedCashBookApiEndpoint = (endpoint) => {
  try {
    sessionStorage.setItem(CASH_BOOK_API_ENDPOINT_CACHE_KEY, endpoint);
  } catch (error) {
    // Cache is only a convenience. Ignore storage failures.
  }
};

const getCashBookEndpointCandidates = () => {
  const cached = getCachedCashBookApiEndpoint();

  return [
    ...(cached ? [cached] : []),
    ...CASH_BOOK_API_ENDPOINTS.filter((endpoint) => endpoint !== cached),
  ];
};

const fetchDatabaseCashEntries = async () => {
  let lastError = null;

  for (const endpoint of getCashBookEndpointCandidates()) {
    try {
      const res = await api.get(endpoint);
      const items = Array.isArray(res?.data?.items) ? res.data.items : [];

      setCachedCashBookApiEndpoint(endpoint);

      return items.filter(isManualCashBookApiItem).map(apiCashEntryToLocalEntry);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Cash book API endpoint not found");
};

const saveDatabaseCashEntry = async (entry) => {
  let lastError = null;

  for (const endpoint of getCashBookEndpointCandidates()) {
    try {
      const res = await api.post(endpoint, buildCashBookApiPayload(entry));

      setCachedCashBookApiEndpoint(endpoint);

      return apiCashEntryToLocalEntry(res.data);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Cash book API endpoint not found");
};

const deleteDatabaseCashEntry = async (entry) => {
  if (!entry?.dbId) return false;

  let lastError = null;

  for (const endpoint of getCashBookEndpointCandidates()) {
    try {
      await api.delete(`${endpoint}/${entry.dbId}`);

      setCachedCashBookApiEndpoint(endpoint);

      return true;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Cash book API endpoint not found");
};

const mergeCashBookEntries = (databaseEntries, localEntries) => {
  const merged = Array.isArray(databaseEntries) ? [...databaseEntries] : [];
  const seen = new Set(
    merged.flatMap((item) => [item.id, item.clientId, item.dbId].filter(Boolean))
  );

  (Array.isArray(localEntries) ? localEntries : []).forEach((item) => {
    const keys = [item.id, item.clientId, item.dbId].filter(Boolean);
    const alreadyExists = keys.some((key) => seen.has(key));

    if (!alreadyExists) {
      merged.push(item);
      keys.forEach((key) => seen.add(key));
    }
  });

  return merged.sort((a, b) => {
    const aDate = new Date(
      a.entryDate ? `${a.entryDate}T${a.entryTime || "00:00"}` : a.createdAt || 0
    ).getTime();
    const bDate = new Date(
      b.entryDate ? `${b.entryDate}T${b.entryTime || "00:00"}` : b.createdAt || 0
    ).getTime();

    return bDate - aDate;
  });
};

const getOpeningBalance = (entries) => {
  const openingEntries = entries.filter((item) => item.type === "opening_balance");

  if (!openingEntries.length) return 0;

  const latest = [...openingEntries].sort(
    (a, b) =>
      new Date(`${b.entryDate || ""}T${b.entryTime || "00:00"}`).getTime() -
      new Date(`${a.entryDate || ""}T${a.entryTime || "00:00"}`).getTime()
  )[0];

  return Number(latest.amount || 0);
};

const sumByType = (entries, type) =>
  entries
    .filter((item) => item.type === type)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

const formatDate = (value) => {
  if (!value) return "No date";

  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatDateTime = (item) => {
  const date = item.entryDate || item.createdAt || item.saleDate;

  if (!date) return "No date";

  const dateText = formatDate(date);
  const timeText = item.entryTime || "";

  return timeText ? `${dateText}, ${timeText}` : dateText;
};

const buildUnifiedActivity = ({
  cashEntries,
  salesItems,
  recentExpenses,
  recentWorkers,
}) => {
  const localCash = (cashEntries || []).map((item) => ({
    id: item.id,
    dbId: item.dbId || "",
    source: item.isRemote ? "database-cash" : "local",
    title:
      item.type === "opening_balance"
        ? "Opening Balance"
        : item.note || (item.type === "cash_in" ? "Cash In" : "Cash Out"),
    subtitle:
      item.type === "opening_balance"
        ? "Initial cash amount"
        : item.type === "cash_in"
        ? item.isRemote
          ? "Saved cash in"
          : "Manual cash entry"
        : item.isRemote
        ? "Saved cash out"
        : "Manual cash out",
    amount: Number(item.amount || 0),
    type:
      item.type === "cash_in" || item.type === "opening_balance" ? "in" : "out",
    entryDate: item.entryDate,
    entryTime: item.entryTime,
    createdAt: item.createdAt,
    rawType: item.type,
    canDelete: true,
  }));

  const sales = (salesItems || []).map((item) => ({
    id: `sale-${item._id}`,
    source: "sale",
    title: item.productName || "Sale Income",
    subtitle: "Owner income from sale",
    amount: Number(item.ownerAmount || item.ownerIncomeAmount || 0),
    type: "in",
    saleDate: item.saleDate,
    createdAt: item.createdAt,
    canDelete: false,
  }));

  const expenses = (recentExpenses || []).map((item) => ({
    id: `expense-${item._id}`,
    source: "expense",
    title: item.description || "Expense",
    subtitle: item.category?.name || "Expense",
    amount: Number(item.amount || 0),
    type: "out",
    createdAt: item.createdAt,
    canDelete: false,
  }));

  const workers = (recentWorkers || []).map((item) => ({
    id: `worker-${item._id}`,
    source: "worker",
    title: item.workerName || "Worker Payment",
    subtitle: item.category?.name || "Worker payment",
    amount: Number(item.amount || 0),
    type: "out",
    createdAt: item.createdAt,
    canDelete: false,
  }));

  return [...localCash, ...sales, ...expenses, ...workers].sort((a, b) => {
    const aDate = new Date(
      a.entryDate ? `${a.entryDate}T${a.entryTime || "00:00"}` : a.saleDate || a.createdAt || 0
    ).getTime();

    const bDate = new Date(
      b.entryDate ? `${b.entryDate}T${b.entryTime || "00:00"}` : b.saleDate || b.createdAt || 0
    ).getTime();

    return bDate - aDate;
  });
};

const defaultForm = {
  type: "cash_in",
  amount: "",
  entryDate: todayInputValue(),
  entryTime: nowTimeValue(),
  note: "",
};

const FarmLeafLogo = () => (
  <span className="cashbook-logo-orb" aria-hidden="true">
    <svg viewBox="0 0 64 64" fill="none">
      <path
        d="M32 50V18"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M32 24c-11-1-18-7-21-16 11 0 19 5 21 16Z"
        fill="currentColor"
        opacity="0.95"
      />
      <path
        d="M33 32c10-1 17-6 20-15-10 0-17 5-20 15Z"
        fill="currentColor"
        opacity="0.78"
      />
      <path
        d="M32 40c-9-1-15-5-18-13 9 0 15 5 18 13Z"
        fill="currentColor"
        opacity="0.72"
      />
    </svg>
  </span>
);

const CashBookIcon = ({ type }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
    {type === "book" && (
      <>
        <path d="M7 4.5h10a2 2 0 0 1 2 2v13H5v-13a2 2 0 0 1 2-2Z" />
        <path d="M9 9h6" />
        <path d="M9 12h6" />
        <path d="M9 15h6" />
      </>
    )}

    {type === "bank" && (
      <>
        <path d="M4 10h16" />
        <path d="M6 10v8" />
        <path d="M10 10v8" />
        <path d="M14 10v8" />
        <path d="M18 10v8" />
        <path d="M3.5 18.5h17" />
        <path d="M12 4.5 4.5 8.5h15L12 4.5Z" />
      </>
    )}

    {type === "in" && (
      <>
        <path d="M12 4v13" />
        <path d="m7 12 5 5 5-5" />
        <path d="M5 20h14" />
      </>
    )}

    {type === "out" && (
      <>
        <path d="M12 20V7" />
        <path d="m7 12 5-5 5 5" />
        <path d="M5 20h14" />
      </>
    )}

    {type === "import" && (
      <>
        <path d="M12 4v9" />
        <path d="m8 9 4 4 4-4" />
        <path d="M5 16v3h14v-3" />
      </>
    )}

    {type === "sale" && (
      <>
        <path d="M5 7h14l-1.3 7H8L5 7Z" />
        <path d="M5 7 4.3 4H2.8" />
        <path d="M9 19.5h.1" />
        <path d="M17 19.5h.1" />
      </>
    )}

    {type === "expense" && (
      <>
        <path d="M5 7h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
        <path d="M16 11h5v4h-5a2 2 0 0 1 0-4Z" />
      </>
    )}

    {type === "worker" && (
      <>
        <path d="M9.4 11.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" />
        <path d="M3.8 20a5.7 5.7 0 0 1 11.4 0" />
        <path d="M16.1 10.9a2.8 2.8 0 1 0-1.1-5.3" />
        <path d="M17.2 13.6a4.7 4.7 0 0 1 3 4.4" />
      </>
    )}
  </svg>
);

const entryMeta = {
  opening_balance: {
    label: "Opening Balance",
    title: "Set opening balance",
    subtitle: "Initial cash amount",
    icon: "bank",
  },
  cash_in: {
    label: "Cash In",
    title: "Add cash in",
    subtitle: "Money received",
    icon: "in",
  },
  cash_out: {
    label: "Cash Out",
    title: "Add cash out",
    subtitle: "Money paid out",
    icon: "out",
  },
};


export default function CashBook() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const menuRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const [entries, setEntries] = useState(() => readCashBookEntries());
  const cachedLinkedData = useMemo(() => readCashBookLinkedCache(), []);
  const [reportsData, setReportsData] = useState(cachedLinkedData.reportsData);
  const [salesData, setSalesData] = useState(cachedLinkedData.salesData);
  const [form, setForm] = useState(defaultForm);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchLinkedData = async ({ silent = false } = {}) => {
    setLoading(true);

    try {
      const [reportsRes, salesRes, databaseCashEntries] = await Promise.all([
        api.get("/reports").catch(() => ({ data: {} })),
        api.get("/sales").catch(() => ({ data: {} })),
        fetchDatabaseCashEntries().catch((error) => {
          console.error("Cash book database entries fetch error:", error);
          return null;
        }),
      ]);

      const nextReportsData = {
        totalExpenses: Number(reportsRes?.data?.totalExpenses || 0),
        totalWorkers: Number(reportsRes?.data?.totalWorkers || 0),
        recentExpenses: Array.isArray(reportsRes?.data?.recentExpenses)
          ? reportsRes.data.recentExpenses
          : [],
        recentWorkers: Array.isArray(reportsRes?.data?.recentWorkers)
          ? reportsRes.data.recentWorkers
          : [],
      };

      const nextSalesData = {
        items: Array.isArray(salesRes?.data?.items) ? salesRes.data.items : [],
        summary: salesRes?.data?.summary || EMPTY_SALES_DATA.summary,
      };

      if (databaseCashEntries) {
        setEntries((currentEntries) => {
          const nextEntries = mergeCashBookEntries(databaseCashEntries, currentEntries);
          writeCashBookEntries(nextEntries);
          return nextEntries;
        });
      }

      setReportsData(nextReportsData);
      setSalesData(nextSalesData);
      writeCashBookLinkedCache({ reportsData: nextReportsData, salesData: nextSalesData });
    } catch (error) {
      console.error("Cash book linked data fetch error:", error);
      if (!silent) {
        toast.error("Cash book linked data could not load");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLinkedData({ silent: true });
  }, []);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const openingBalance = useMemo(() => getOpeningBalance(entries), [entries]);
  const manualCashIn = useMemo(() => sumByType(entries, "cash_in"), [entries]);
  const manualCashOut = useMemo(() => sumByType(entries, "cash_out"), [entries]);

  const ownerIncomeAmount = Number(salesData?.summary?.ownerIncomeAmount || 0);
  const totalExpenses = Number(reportsData?.totalExpenses || 0);
  const totalWorkers = Number(reportsData?.totalWorkers || 0);

  const moneyIn = openingBalance + manualCashIn + ownerIncomeAmount;
  const moneyOut = totalExpenses + totalWorkers + manualCashOut;
  const currentBalance = moneyIn - moneyOut;

  const activity = useMemo(
    () =>
      buildUnifiedActivity({
        cashEntries: entries,
        salesItems: salesData.items,
        recentExpenses: reportsData.recentExpenses,
        recentWorkers: reportsData.recentWorkers,
      }),
    [entries, salesData.items, reportsData.recentExpenses, reportsData.recentWorkers]
  );

  const filteredActivity = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return activity;

    return activity.filter((item) => {
      const title = String(item.title || "").toLowerCase();
      const subtitle = String(item.subtitle || "").toLowerCase();
      const amount = String(item.amount || "");
      const type = String(item.type || "").toLowerCase();
      const date = formatDateTime(item).toLowerCase();

      return (
        title.includes(q) ||
        subtitle.includes(q) ||
        amount.includes(q) ||
        type.includes(q) ||
        date.includes(q)
      );
    });
  }, [activity, search]);

  const setEntryType = (type) => {
    setForm((prev) => ({
      ...prev,
      type,
      note:
        type === "opening_balance"
          ? "Opening cash balance"
          : type === "cash_in"
          ? ""
          : "",
    }));
  };

  const saveEntry = async () => {
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error("Please enter valid amount");
      return;
    }

    if (!form.entryDate) {
      toast.error("Please select date");
      return;
    }

    const cleanEntry = {
      id: createId(),
      type: form.type,
      amount: Number(form.amount),
      entryDate: form.entryDate,
      entryTime: form.entryTime || nowTimeValue(),
      note: form.note.trim(),
      createdAt: new Date().toISOString(),
      isRemote: false,
    };

    let finalEntry = cleanEntry;
    let savedToDatabase = false;

    try {
      finalEntry = await saveDatabaseCashEntry(cleanEntry);
      savedToDatabase = true;
    } catch (error) {
      console.error("Cash book database save error:", error);
    }

    const nextEntries =
      form.type === "opening_balance"
        ? [
            finalEntry,
            ...entries.filter((item) => item.type !== "opening_balance"),
          ]
        : [finalEntry, ...entries];

    setEntries(nextEntries);
    writeCashBookEntries(nextEntries);

    setForm({
      ...defaultForm,
      type: form.type === "opening_balance" ? "cash_in" : form.type,
      entryDate: todayInputValue(),
      entryTime: nowTimeValue(),
    });

    toast.success(
      finalEntry.type === "opening_balance"
        ? savedToDatabase
          ? "Opening balance saved"
          : "Opening balance saved locally"
        : finalEntry.type === "cash_in"
        ? savedToDatabase
          ? "Cash in saved"
          : "Cash in saved locally"
        : savedToDatabase
        ? "Cash out saved"
        : "Cash out saved locally"
    );
  };

  const deleteLocalEntry = async (id) => {
    const entry = entries.find((item) => item.id === id);
    const ok = window.confirm("Delete this cash entry?");
    if (!ok) return;

    try {
      if (entry?.dbId) {
        await deleteDatabaseCashEntry(entry);
      }

      const nextEntries = entries.filter((item) => item.id !== id);
      setEntries(nextEntries);
      writeCashBookEntries(nextEntries);
      toast.success("Cash entry deleted");
    } catch (error) {
      console.error("Cash book database delete error:", error);
      toast.error("Failed to delete cash entry");
    }
  };

  const initials =
    user?.name
      ?.split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "FT";

  const handleLogout = () => {
    setMenuOpen(false);
    logout();
    navigate("/login");
  };

  const currentEntryMeta = entryMeta[form.type] || entryMeta.cash_in;

  return (
    <div className="cashbook-page">
      <section className="cashbook-farm-header">
        <img
          className="cashbook-header-image"
          src={farmPremiumHeader}
          alt="Farm fields and tractor"
        />
        <div className="cashbook-header-shade" />

        <div className="cashbook-brand-row">
          <div className="cashbook-brand-left">
            <FarmLeafLogo />
            <div className="cashbook-brand-copy">
              <h1>Farm Expense Tracker</h1>
              <p>Expenses, workers, reports</p>
            </div>
          </div>

          <div className="cashbook-menu-wrap" ref={menuRef}>
            <button
              type="button"
              className="cashbook-settings-button"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label="Open settings menu"
              aria-expanded={menuOpen}
            >
              ⚙
            </button>

            {menuOpen ? (
              <div className="premium-profile-dropdown cashbook-profile-dropdown">
                <div className="premium-profile-head">
                  <div className="premium-profile-avatar">{initials}</div>

                  <div>
                    <strong>{user?.name || "User"}</strong>
                    <span>{user?.email || "Signed in"}</span>
                  </div>
                </div>

                <div className="premium-profile-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
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
                      setMenuOpen(false);
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
                      setMenuOpen(false);
                      navigate("/reports?panel=settings");
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
            ) : null}
          </div>
        </div>

        <div className="cashbook-page-title">
          <span className="cashbook-page-icon">
            <CashBookIcon type="book" />
          </span>
          <h2>Cash Book</h2>
        </div>
      </section>

      <section className="cashbook-balance-card">
        <div className="cashbook-balance-copy">
          <span>Current Balance</span>
          <h3>{loading ? "—" : money(currentBalance)}</h3>
        </div>

        <div className="cashbook-wallet-art cashbook-wallet-art-image" aria-hidden="true">
          <img src={cashbookWalletPkr} alt="" />
        </div>

        <div className="cashbook-balance-breakdown">
          <div>
            <span>
              <CashBookIcon type="bank" />
              Opening Balance
            </span>
            <strong>{money(openingBalance)}</strong>
          </div>

          <div>
            <span>
              <CashBookIcon type="in" />
              Money In
            </span>
            <strong>{money(moneyIn)}</strong>
          </div>

          <div>
            <span>
              <CashBookIcon type="out" />
              Money Out
            </span>
            <strong>{money(moneyOut)}</strong>
          </div>
        </div>

        <p className="cashbook-balance-note">
          Expenses and worker payments reduce the same balance.
        </p>
      </section>

      <section className="cashbook-tabs">
        <button type="button" className="active">
          Cash Book
        </button>

        <button type="button" onClick={() => navigate("/sales")}>
          Sales
        </button>

        <button
          type="button"
          onClick={() => toast("Profit Share will be available in future updates.")}
        >
          Profit Share
        </button>
      </section>

      <section className="cashbook-actions">
        <button type="button" onClick={() => setEntryType("opening_balance")}>
          <span className="cashbook-action-icon bank">
            <CashBookIcon type="bank" />
          </span>
          Opening Balance
        </button>

        <button type="button" onClick={() => setEntryType("cash_in")}>
          <span className="cashbook-action-icon in">
            <CashBookIcon type="in" />
          </span>
          Cash In
        </button>

        <button type="button" onClick={() => setEntryType("cash_out")}>
          <span className="cashbook-action-icon out">
            <CashBookIcon type="out" />
          </span>
          Cash Out
        </button>

        <button
          type="button"
          onClick={() => toast("Import will be available in future updates.")}
        >
          <span className="cashbook-action-icon import">
            <CashBookIcon type="import" />
          </span>
          Import Data
        </button>
      </section>

      <section className="cashbook-panel cashbook-entry-panel">
        <div className="cashbook-section-head">
          <div className="cashbook-title-row">
            <span className={`cashbook-section-icon ${form.type}`}>
              <CashBookIcon type={currentEntryMeta.icon} />
            </span>
            <div>
              <h3>{currentEntryMeta.title}</h3>
              <p>{currentEntryMeta.subtitle}. Save quick entries without disturbing expense records.</p>
            </div>
          </div>
        </div>

        <div className="cashbook-form-grid">
          <label className="cashbook-field">
            <span>Entry Type</span>
            <select
              value={form.type}
              onChange={(e) => setEntryType(e.target.value)}
            >
              <option value="opening_balance">Opening Balance</option>
              <option value="cash_in">Cash In</option>
              <option value="cash_out">Cash Out</option>
            </select>
          </label>

          <label className="cashbook-field">
            <span>Amount (PKR)</span>
            <input
              type="number"
              placeholder="Enter amount"
              value={form.amount}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, amount: e.target.value }))
              }
            />
          </label>

          <label className="cashbook-field">
            <span>Date</span>
            <input
              type="date"
              value={form.entryDate}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, entryDate: e.target.value }))
              }
            />
          </label>

          <label className="cashbook-field">
            <span>Time</span>
            <input
              type="time"
              value={form.entryTime}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, entryTime: e.target.value }))
              }
            />
          </label>

          <label className="cashbook-field cashbook-field-wide">
            <span>Note</span>
            <input
              type="text"
              placeholder="Example: Sold vegetables, cash received, market cash out"
              value={form.note}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, note: e.target.value }))
              }
            />
          </label>
        </div>

        <button type="button" className="cashbook-save-btn" onClick={saveEntry}>
          Save Cash Entry
        </button>
      </section>

      <section className="cashbook-panel">
        <div className="cashbook-section-head">
          <div>
            <h3>Recent Transactions</h3>
            <p>Sales, expenses, worker payments, and manual cash entries.</p>
          </div>

          <button
            type="button"
            className="cashbook-text-btn"
            onClick={() => fetchLinkedData()}
          >
            View All ›
          </button>
        </div>

        <div className="cashbook-search">
          <input
            type="text"
            placeholder="Search cash transactions"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="cashbook-list">
          {filteredActivity.length === 0 ? (
            <div className="cashbook-empty">
              {loading ? "Loading cash book..." : "No transactions found"}
            </div>
          ) : (
            filteredActivity.slice(0, 12).map((item) => {
              const rowIcon =
                item.source === "sale"
                  ? "sale"
                  : item.source === "expense"
                  ? "expense"
                  : item.source === "worker"
                  ? "worker"
                  : item.rawType === "opening_balance"
                  ? "bank"
                  : item.type === "in"
                  ? "in"
                  : "out";

              return (
                <article key={item.id} className="cashbook-row">
                  <span
                    className={`cashbook-row-icon ${
                      item.type === "in" ? "income" : "outflow"
                    }`}
                  >
                    <CashBookIcon type={rowIcon} />
                  </span>

                  <div className="cashbook-row-main">
                    <strong>{item.title}</strong>
                    <span>{item.subtitle}</span>
                    <small>{formatDateTime(item)}</small>
                  </div>

                  <div className="cashbook-row-side">
                    <b className={item.type === "in" ? "income" : "outflow"}>
                      {item.type === "in" ? "+" : "-"}
                      {money(item.amount)}
                    </b>

                    {item.canDelete ? (
                      <button type="button" onClick={() => deleteLocalEntry(item.id)}>
                        Delete
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>

      <section className="cashbook-sticky-summary" aria-label="Cash totals summary">
        <div>
          <span>Money In</span>
          <strong>{money(moneyIn)}</strong>
        </div>

        <div>
          <span>Money Out</span>
          <strong>{money(moneyOut)}</strong>
        </div>

        <div>
          <span>Balance</span>
          <strong>{money(currentBalance)}</strong>
        </div>
      </section>

      <div className="cashbook-bottom-space" />
    </div>
  );
} 