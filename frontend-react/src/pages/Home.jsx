import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import farmPremiumHeader from "../assets/farm-premium-header.png";
import "../styles/home.css";
import {
  attemptSyncPending,
  buildDashboardWithPending,
  buildSalesPageWithPending,
  cacheReportsSnapshot,
  cacheSalesPageSnapshot,
  getDashboardSnapshotWithPending,
  getSalesPageSnapshotWithPending,
  hasDashboardData,
} from "../utils/offlineQueue";

const CASH_BOOK_STORAGE_KEY = "farm_cashbook_local_entries_v1";
const SALES_PAGE_CACHE_KEY = "farm_sales_page_cache_v1";

const EMPTY_SALES_DATA = {
  items: [],
  summary: {
    totalSales: 0,
    grossSalesAmount: 0,
    ownerIncomeAmount: 0,
    workersAllocationAmount: 0,
  },
};

const getInitialDashboard = () => getDashboardSnapshotWithPending();

const money = (value) => `PKR ${Number(value || 0).toLocaleString()}`;

const readSalesPageCache = () => {
  try {
    const snapshot = getSalesPageSnapshotWithPending();

    return {
      items: Array.isArray(snapshot?.items) ? snapshot.items : [],
      summary: {
        ...EMPTY_SALES_DATA.summary,
        ...(snapshot?.summary || {}),
      },
    };
  } catch (error) {
    console.error("Home sales cache read error:", error);
    return EMPTY_SALES_DATA;
  }
};

const writeSalesPageCache = (payload) => {
  try {
    cacheSalesPageSnapshot(payload);
  } catch (error) {
    console.error("Home sales cache write error:", error);
  }
};

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

const getCashEntryDateTime = (item) => {
  if (item?.entryDate) {
    return `${item.entryDate}T${item.entryTime || "00:00"}`;
  }

  return item?.createdAt || new Date().toISOString();
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

const buildUnifiedActivity = ({
  cashEntries,
  salesItems,
  recentExpenses,
  recentWorkers,
}) => {
  const localCash = (cashEntries || [])
    .filter((item) => item.type !== "opening_balance")
    .map((item) => ({
      id: item.id,
      source: "cash",
      title: item.note || (item.type === "cash_in" ? "Cash In" : "Cash Out"),
      subtitle: item.type === "cash_in" ? "Manual cash entry" : "Manual cash out",
      amount: Number(item.amount || 0),
      type: item.type === "cash_in" ? "in" : "out",
      createdAt: getCashEntryDateTime(item),
      icon: item.type === "cash_in" ? "cashIn" : "cashOut",
    }));

  const sales = (salesItems || []).map((item) => ({
    id: `sale-${item._id}`,
    source: "sale",
    title: item.productName || "Sale Income",
    subtitle: "Owner income from sale",
    amount: Number(item.ownerAmount || item.ownerIncomeAmount || 0),
    type: "in",
    createdAt: item.saleDate || item.createdAt,
    icon: "sales",
  }));

  const expenses = (recentExpenses || []).map((item) => ({
    id: `expense-${item._id}`,
    source: "expense",
    title: item.description || "Expense",
    subtitle: item.category?.name || "Expense",
    amount: Number(item.amount || 0),
    type: "out",
    createdAt: item.createdAt,
    icon: "expense",
  }));

  const workers = (recentWorkers || []).map((item) => ({
    id: `worker-${item._id}`,
    source: "worker",
    title: item.workerName || "Worker Payment",
    subtitle: item.category?.name || "Worker payment",
    amount: Number(item.amount || 0),
    type: "out",
    createdAt: item.createdAt,
    icon: "workers",
  }));

  return [...localCash, ...sales, ...expenses, ...workers]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 6);
};

function HomeLogoIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className="home-logo-svg">
      <path
        d="M31.8 53.8V14.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M31.8 27.5C22.2 27 15 21.3 12.7 13.5c9.6.2 16.6 5.6 19.1 14Z"
        fill="currentColor"
      />
      <path
        d="M32 37.7c-9.9-.5-17.2-6.2-19.8-14.2 9.8.1 17.1 5.8 19.8 14.2Z"
        fill="currentColor"
        opacity="0.88"
      />
      <path
        d="M32.4 21.7c8.2-4.8 16.7-4.7 23.2.3-8.4 4.9-16.6 4.6-23.2-.3Z"
        fill="currentColor"
        opacity="0.92"
      />
      <path
        d="M32.2 32.2c8.6-4.9 17.4-4.6 24.1.7-8.6 4.8-17.5 4.4-24.1-.7Z"
        fill="currentColor"
        opacity="0.8"
      />
    </svg>
  );
}

function HomeSettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="home-line-svg" aria-hidden="true">
      <path d="M12 15.3a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6Z" />
      <path d="M18.7 13.4c.1-.5.1-.9.1-1.4s0-.9-.1-1.4l2-1.5-2-3.4-2.4 1a8 8 0 0 0-2.4-1.4L13.6 2h-4l-.4 3.3a8 8 0 0 0-2.4 1.4l-2.4-1-2 3.4 2 1.5c-.1.5-.1.9-.1 1.4s0 .9.1 1.4l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 2.4 1.4l.4 3.3h4l.4-3.3a8 8 0 0 0 2.4-1.4l2.4 1 2-3.4-2.1-1.5Z" />
    </svg>
  );
}

function ActivityIcon({ type }) {
  return (
    <svg viewBox="0 0 24 24" className="home-line-svg" aria-hidden="true">
      {type === "expense" && (
        <>
          <path d="M7 4.5h10a2 2 0 0 1 2 2v13H5v-13a2 2 0 0 1 2-2Z" />
          <path d="M9 9h6" />
          <path d="M9 12h6" />
          <path d="M12 15v-4" />
          <path d="m9.8 13.2 2.2 2.2 2.2-2.2" />
        </>
      )}

      {type === "workers" && (
        <>
          <path d="M9.5 11a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6Z" />
          <path d="M3.5 20a6 6 0 0 1 12 0" />
          <path d="M17 10.5a2.8 2.8 0 1 0-1-5.3" />
          <path d="M17.8 13.6a4.8 4.8 0 0 1 2.8 4.4" />
        </>
      )}

      {type === "sales" && (
        <>
          <path d="M6 6h14l-1.5 8.2H8L6 6Z" />
          <path d="M6 6 5.4 3.8H3.6" />
          <path d="M9.5 19.2h.1" />
          <path d="M17 19.2h.1" />
        </>
      )}

      {type === "cashIn" && (
        <>
          <path d="M5 5h14v14H5z" />
          <path d="M12 7v9" />
          <path d="m8.8 12.8 3.2 3.2 3.2-3.2" />
        </>
      )}

      {type === "cashOut" && (
        <>
          <path d="M5 5h14v14H5z" />
          <path d="M12 17V8" />
          <path d="m8.8 11.2L12 8l3.2 3.2" />
        </>
      )}

      {type === "cash" && (
        <>
          <path d="M5 7h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
          <path d="M16 11h5v4h-5a2 2 0 0 1 0-4Z" />
          <path d="M6.5 7 15 4.5a1.8 1.8 0 0 1 2.2 1.2l.4 1.3" />
        </>
      )}
    </svg>
  );
}

function WalletArt() {
  return (
    <svg className="home-wallet-svg" viewBox="0 0 130 112" aria-hidden="true">
      <defs>
        <linearGradient id="homeWalletDark" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#062317" />
          <stop offset="100%" stopColor="#14532d" />
        </linearGradient>

        <linearGradient id="homeWalletGreen" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#15803d" />
        </linearGradient>

        <filter id="homeWalletShadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="12" stdDeviation="8" floodColor="#052e16" floodOpacity="0.35" />
        </filter>
      </defs>

      <g filter="url(#homeWalletShadow)">
        <rect x="18" y="44" width="74" height="48" rx="18" fill="url(#homeWalletDark)" />
        <rect x="61" y="57" width="31" height="17" rx="9" fill="#22c55e" opacity="0.95" />
        <circle cx="73" cy="65.5" r="3" fill="#ecfdf5" opacity="0.9" />
      </g>

      <g>
        <rect x="61" y="10" width="48" height="58" rx="12" fill="#ffffff" />
        <path d="M73 29 H97" stroke="#16a34a" strokeWidth="5" strokeLinecap="round" opacity="0.36" />
        <path d="M73 44 H93" stroke="#16a34a" strokeWidth="5" strokeLinecap="round" opacity="0.23" />
        <text x="85" y="26" textAnchor="middle" fill="#15803d" fontSize="12" fontWeight="900">
          PKR
        </text>
      </g>

      <circle cx="101" cy="76" r="22" fill="url(#homeWalletGreen)" />
      <path d="M101 63 V84" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" />
      <path d="M92 77 L101 86 L110 77" fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HomeSettingsMenu({ user, onGoTo, onReportsSettings, onSwitchAccount, onLogout }) {
  const initials =
    user?.name
      ?.split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "FT";

  return (
    <div className="premium-profile-dropdown home-premium-profile-dropdown">
      <div className="premium-profile-head">
        <div className="premium-profile-avatar">{initials}</div>

        <div>
          <strong>{user?.name || "Farm User"}</strong>
          <span>{user?.email || "Logged in"}</span>
        </div>
      </div>

      <div className="premium-profile-actions">
        <button type="button" onClick={() => onGoTo("/") }>
          <span>🏠</span>
          <div>
            <strong>Home</strong>
            <small>Dashboard and balance</small>
          </div>
        </button>

        <button type="button" onClick={() => onGoTo("/expenses") }>
          <span>🧾</span>
          <div>
            <strong>Expenses</strong>
            <small>Manage farm spending</small>
          </div>
        </button>

        <button type="button" onClick={() => onGoTo("/cash-book") }>
          <span>💼</span>
          <div>
            <strong>Cash Book</strong>
            <small>Cash in, out, and balance</small>
          </div>
        </button>

        <button type="button" onClick={() => onGoTo("/sales") }>
          <span>🛒</span>
          <div>
            <strong>Sales</strong>
            <small>Crop sales and income</small>
          </div>
        </button>

        <button type="button" onClick={() => onGoTo("/workers") }>
          <span>👥</span>
          <div>
            <strong>Workers</strong>
            <small>Payments and profiles</small>
          </div>
        </button>

        <button type="button" onClick={() => onGoTo("/reports") }>
          <span>📊</span>
          <div>
            <strong>Reports</strong>
            <small>Totals and insights</small>
          </div>
        </button>

        <button type="button" onClick={onReportsSettings}>
          <span>⚙️</span>
          <div>
            <strong>Settings</strong>
            <small>App and account options</small>
          </div>
        </button>

        <button type="button" onClick={onSwitchAccount}>
          <span>🚪</span>
          <div>
            <strong>Switch Account</strong>
            <small>Go back to login</small>
          </div>
        </button>

        <button type="button" className="danger" onClick={onLogout}>
          <span>🚪</span>
          <div>
            <strong>Logout</strong>
            <small>Sign out safely</small>
          </div>
        </button>
      </div>
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState(getInitialDashboard);
  const [loading, setLoading] = useState(() => !hasDashboardData(getInitialDashboard()));
  const [salesData, setSalesData] = useState(() => readSalesPageCache());
  const [cashEntries, setCashEntries] = useState(() => readCashBookEntries());
  const [settingsOpen, setSettingsOpen] = useState(false);

  const navigate = useNavigate();
  const settingsRef = useRef(null);
  const { user, logout } = useAuth();

  const fetchDashboard = async (showOfflineToast = false) => {
    setCashEntries(readCashBookEntries());

    // Do not block Home on offline sync. Start it quietly, then fetch dashboard + sales together.
    attemptSyncPending(api).catch((syncError) => {
      console.warn("Home background sync skipped:", syncError);
    });

    const [reportsResult, salesResult] = await Promise.allSettled([
      api.get("/reports"),
      api.get("/sales"),
    ]);

    if (reportsResult.status === "fulfilled") {
      const finalData = buildDashboardWithPending(reportsResult.value.data);
      setData(finalData);
      cacheReportsSnapshot(reportsResult.value.data);
    } else {
      console.error("Dashboard fetch error:", reportsResult.reason);
      setData(getInitialDashboard());

      if (showOfflineToast) {
        toast.error("Offline mode: showing saved dashboard data");
      }
    }

    if (salesResult.status === "fulfilled") {
      const serverSalesData = salesResult.value?.data || EMPTY_SALES_DATA;
      const nextSalesData = buildSalesPageWithPending(serverSalesData);
      setSalesData(nextSalesData);
      writeSalesPageCache(serverSalesData);
    } else {
      console.error("Sales summary fetch error:", salesResult.reason);
      setSalesData(readSalesPageCache());
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchDashboard(true);

    const handleOnline = () => {
      fetchDashboard();
    };

    const refreshLocalSnapshots = () => {
      setCashEntries(readCashBookEntries());
      setSalesData(readSalesPageCache());
      setData(getDashboardSnapshotWithPending());
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("storage", refreshLocalSnapshots);
    window.addEventListener("focus", refreshLocalSnapshots);
    window.addEventListener("farm-sales-cache-updated", refreshLocalSnapshots);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("storage", refreshLocalSnapshots);
      window.removeEventListener("focus", refreshLocalSnapshots);
      window.removeEventListener("farm-sales-cache-updated", refreshLocalSnapshots);
    };
  }, []);

  useEffect(() => {
    setCashEntries(readCashBookEntries());
  }, [loading]);

  useEffect(() => {
    const closeOnOutside = (event) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target)) {
        setSettingsOpen(false);
      }
    };

    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setSettingsOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const openingBalance = useMemo(() => getOpeningBalance(cashEntries), [cashEntries]);
  const manualCashIn = useMemo(() => sumByType(cashEntries, "cash_in"), [cashEntries]);
  const manualCashOut = useMemo(() => sumByType(cashEntries, "cash_out"), [cashEntries]);

  const ownerIncomeAmount = Number(salesData?.summary?.ownerIncomeAmount || 0);
  const grossSalesAmount = Number(salesData?.summary?.grossSalesAmount || 0);
  const latestSalesCount = Number(salesData?.summary?.totalSales || 0);
  const totalExpenses = Number(data?.totalExpenses || 0);
  const totalWorkers = Number(data?.totalWorkers || 0);

  const moneyIn = openingBalance + manualCashIn + ownerIncomeAmount;
  const moneyOut = totalExpenses + totalWorkers + manualCashOut;
  const currentBalance = moneyIn - moneyOut;
  const netCashToday = ownerIncomeAmount + manualCashIn - totalExpenses - totalWorkers - manualCashOut;

  const unifiedActivity = useMemo(
    () =>
      buildUnifiedActivity({
        cashEntries,
        salesItems: salesData?.items || [],
        recentExpenses: data?.recentExpenses || [],
        recentWorkers: data?.recentWorkers || [],
      }),
    [cashEntries, salesData, data]
  );

  const monthlyItems = [
    { label: "Money In", value: moneyIn, icon: "cashIn", tone: "green" },
    { label: "Expenses", value: totalExpenses, icon: "expense", tone: "red" },
    { label: "Workers", value: totalWorkers, icon: "workers", tone: "purple" },
    { label: "Money Out", value: moneyOut, icon: "cashOut", tone: "orange" },
  ];

  const maxMonthlyValue = Math.max(...monthlyItems.map((item) => item.value), 1);
  const goalPercent =
    moneyIn > 0 ? Math.min(100, Math.round((currentBalance / moneyIn) * 100)) : 0;

  const goTo = (path) => {
    setSettingsOpen(false);
    navigate(path);
  };

  const openReportsSettings = () => {
    setSettingsOpen(false);
    navigate("/reports?panel=settings");
  };

  const handleSwitchAccount = () => {
    setSettingsOpen(false);
    logout();
    navigate("/login");
  };

  const handleLogout = () => {
    setSettingsOpen(false);
    logout();
    navigate("/login");
  };

  return (
    <div className="home-page">
      <section className="home-hero-stack">
        <div
          className="home-farm-banner"
          style={{
            backgroundImage: `linear-gradient(90deg, rgba(2, 8, 23, 0.94) 0%, rgba(2, 8, 23, 0.58) 38%, rgba(2, 8, 23, 0.12) 100%), url(${farmPremiumHeader})`,
          }}
        >
          <div className="home-hero-top">
            <button type="button" className="home-brand" onClick={() => navigate("/")}>
              <span className="home-brand-logo">
                <HomeLogoIcon />
              </span>

              <span>
                <strong>Farm Expense Tracker</strong>
                <small>Expenses, workers, reports</small>
              </span>
            </button>

            <div className="home-settings-wrap" ref={settingsRef}>
              <button
                type="button"
                className="home-settings-btn"
                aria-label="Open settings"
                aria-expanded={settingsOpen}
                onClick={() => setSettingsOpen((prev) => !prev)}
              >
                <HomeSettingsIcon />
              </button>

              {settingsOpen && (
                <HomeSettingsMenu
                  user={user}
                  onGoTo={goTo}
                  onReportsSettings={openReportsSettings}
                  onSwitchAccount={handleSwitchAccount}
                  onLogout={handleLogout}
                />
              )}
            </div>
          </div>
        </div>

        <section className="home-balance-card">
          <div className="home-balance-copy">
            <span>Current Balance</span>
            <h3>{money(currentBalance)}</h3>
            <button type="button" onClick={() => navigate("/cash-book")}>
              Available Cash ›
            </button>
          </div>

          <div className="home-wallet-box">
            <WalletArt />
          </div>
        </section>
      </section>

      <section className="home-stat-grid">
        <button type="button" onClick={() => navigate("/expenses")} className="home-stat-card red">
          <span>
            <ActivityIcon type="expense" />
          </span>
          <div>
            <small>Today’s Expenses</small>
            <strong>{loading ? "—" : money(totalExpenses)}</strong>
            <em>{data?.totalExpenseEntries || 0} entries</em>
          </div>
        </button>

        <button type="button" onClick={() => navigate("/workers")} className="home-stat-card purple">
          <span>
            <ActivityIcon type="workers" />
          </span>
          <div>
            <small>Worker Payments</small>
            <strong>{loading ? "—" : money(totalWorkers)}</strong>
            <em>{data?.totalWorkerEntries || 0} payments</em>
          </div>
        </button>

        <button type="button" onClick={() => navigate("/sales")} className="home-stat-card green">
          <span>
            <ActivityIcon type="sales" />
          </span>
          <div>
            <small>Latest Sales</small>
            <strong>{money(grossSalesAmount)}</strong>
            <em>
              {latestSalesCount} sale{latestSalesCount === 1 ? "" : "s"}
            </em>
          </div>
        </button>

        <button type="button" onClick={() => navigate("/cash-book")} className="home-stat-card blue">
          <span>
            <ActivityIcon type="cash" />
          </span>
          <div>
            <small>Net Cash Today</small>
            <strong className={netCashToday >= 0 ? "positive blue-money" : "negative"}>
              {money(netCashToday)}
            </strong>
            <em>Inflow - Outflow</em>
          </div>
        </button>
      </section>

      <section className="home-action-row">
        <button type="button" onClick={() => navigate("/expenses")} className="home-action-red">
          <span>+</span>
          Add Expense
        </button>

        <button type="button" onClick={() => navigate("/sales")} className="home-action-green">
          <span>+</span>
          Add Sale
        </button>

        <button type="button" onClick={() => navigate("/workers")} className="home-action-purple">
          <span>+</span>
          Worker Payment
        </button>
      </section>

      <section className="home-panel">
        <div className="home-section-head">
          <div>
            <h3>Recent Activity</h3>
            <p>Latest linked activity from all money pages.</p>
          </div>

          <button type="button" onClick={() => navigate("/reports")}>
            View all ›
          </button>
        </div>

        {unifiedActivity.length === 0 ? (
          <div className="home-empty">No recent activity found</div>
        ) : (
          <div className="home-activity-list">
            {unifiedActivity.map((item) => (
              <article key={item.id} className="home-activity-row">
                <span className={`home-activity-icon ${item.type === "in" ? "in" : "out"} ${item.icon}`}>
                  <ActivityIcon type={item.icon} />
                </span>

                <div>
                  <strong>{item.title}</strong>
                  <small>{item.subtitle}</small>
                </div>

                <aside>
                  <b className={item.type === "in" ? "positive" : "negative"}>
                    {item.type === "in" ? "+" : "-"}
                    {money(item.amount)}
                  </b>
                  <small>{formatDateTime(item.createdAt)}</small>
                </aside>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="home-panel">
        <div className="home-section-head">
          <div>
            <h3>This Month Summary</h3>
            <p>{formatDate(new Date())}</p>
          </div>

          <button type="button" onClick={() => navigate("/reports")}>
            Reports ›
          </button>
        </div>

        <div className="home-month-summary">
          <div>
            <span>Total Income</span>
            <strong className="positive">{money(moneyIn)}</strong>
          </div>

          <div>
            <span>Total Expenses</span>
            <strong className="negative">{money(moneyOut)}</strong>
          </div>

          <div>
            <span>Net Profit</span>
            <strong className={currentBalance >= 0 ? "positive" : "negative"}>
              {money(currentBalance)}
            </strong>
          </div>
        </div>

        <div className="home-goal-row">
          <span>Monthly Goal Progress</span>
          <strong>{Math.max(0, goalPercent)}%</strong>
        </div>

        <div className="home-progress-track">
          <div style={{ width: `${Math.max(6, goalPercent)}%` }} />
        </div>

        <div className="home-chart-list">
          {monthlyItems.map((item) => (
            <div key={item.label} className="home-chart-item">
              <div className="home-chart-label">
                <span className={`home-mini-dot ${item.tone}`}>
                  <ActivityIcon type={item.icon} />
                </span>
                <strong>{item.label}</strong>
                <em>{money(item.value)}</em>
              </div>

              <div className="home-chart-track">
                <div
                  className={item.tone}
                  style={{
                    width: `${Math.max(6, Math.round((item.value / maxMonthlyValue) * 100))}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="home-bottom-space" />
    </div>
  );
}  