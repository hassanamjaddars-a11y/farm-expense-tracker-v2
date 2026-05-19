import { useEffect, useRef, useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  NavLink,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Toaster } from "react-hot-toast";

import Home from "./pages/Home";
import Expenses from "./pages/Expenses";
import Workers from "./pages/Workers";
import Reports from "./pages/Reports";
import Login from "./pages/Login";
import CashBook from "./pages/CashBook";
import Sales from "./pages/Sales";

import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./context/AuthContext";

import farmAppLogo from "./assets/farm-expense-tracker-logo.png";
import "./App.css";


/* =========================================================
   ACCOUNT DATA ISOLATION FIX
   Why this exists:
   Some pages use localStorage for offline/cache data. Those keys were global
   before, so a second/new account could see the previous account's cashbook,
   worker profiles, category images, report cache, and graph cache.

   This proxy keeps the same old page code working, but stores farm data under:
   farm_account:<user-id-or-email>:<original-key>

   Important: auth/token/user login keys are NOT scoped or removed.
   ========================================================= */
const FARM_ACTIVE_ACCOUNT_KEY = "__farm_active_account_scope_v2";
const FARM_SCOPED_PREFIX = "farm_account:";

const FARM_EXACT_DATA_KEYS = new Set([
  "farm_cashbook_local_entries_v1",
  "farm_worker_profiles_v2",
  "farm_worker_category_icons_v1",
  "farm_worker_category_images_v1",
  "farm_expense_category_images_v1",
  "farm_sales_categories_v1",
]);

const FARM_DATA_PREFIXES = [
  "farm_cashbook_",
  "farm_cash_",
  "farm_expense_",
  "farm_expenses_",
  "farm_worker_",
  "farm_workers_",
  "farm_sales_",
  "farm_reports_",
  "farm_report_",
  "farm_dashboard_",
  "farm_cached_",
  "farm_cache_",
  "farm_pending_",
  "farm_offline_",
];

function normalizeFarmAccountId(user) {
  const raw = user?._id || user?.id || user?.email || user?.name || "guest";

  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "guest";
}

function shouldScopeFarmStorageKey(key) {
  if (!key || typeof key !== "string") return false;
  if (key.startsWith("__farm_")) return false;
  if (key.startsWith(FARM_SCOPED_PREFIX)) return false;

  // Never touch login/auth/session keys.
  if (/auth|token|jwt|session|login/i.test(key)) return false;

  if (FARM_EXACT_DATA_KEYS.has(key)) return true;
  return FARM_DATA_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function getFarmStorageOriginals() {
  if (typeof window === "undefined" || !window.localStorage) return null;

  if (!window.__farmStorageOriginalsV2) {
    window.__farmStorageOriginalsV2 = {
      getItem: window.localStorage.getItem.bind(window.localStorage),
      setItem: window.localStorage.setItem.bind(window.localStorage),
      removeItem: window.localStorage.removeItem.bind(window.localStorage),
      key: window.localStorage.key.bind(window.localStorage),
      get length() {
        return window.localStorage.length;
      },
    };
  }

  return window.__farmStorageOriginalsV2;
}

function getScopedFarmStorageKey(key, accountId) {
  return `${FARM_SCOPED_PREFIX}${accountId}:${key}`;
}

function removeLegacyFarmDataKeys(originals) {
  const keysToRemove = [];

  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = originals.key(i);
    if (shouldScopeFarmStorageKey(key)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => {
    try {
      originals.removeItem(key);
    } catch (error) {
      console.warn("Could not remove old shared farm cache:", key, error);
    }
  });
}

function configureAccountScopedStorage(user) {
  if (typeof window === "undefined" || !window.localStorage) return;

  const originals = getFarmStorageOriginals();
  if (!originals) return;

  const accountId = user ? normalizeFarmAccountId(user) : "guest";
  window.__farmActiveAccountStorageIdV2 = accountId;

  if (!window.__farmStorageProxyInstalledV2) {
    window.localStorage.getItem = function getItemWithAccountScope(key) {
      const activeAccount = window.__farmActiveAccountStorageIdV2 || "guest";

      if (shouldScopeFarmStorageKey(key)) {
        return originals.getItem(getScopedFarmStorageKey(key, activeAccount));
      }

      return originals.getItem(key);
    };

    window.localStorage.setItem = function setItemWithAccountScope(key, value) {
      const activeAccount = window.__farmActiveAccountStorageIdV2 || "guest";

      if (shouldScopeFarmStorageKey(key)) {
        return originals.setItem(getScopedFarmStorageKey(key, activeAccount), value);
      }

      return originals.setItem(key, value);
    };

    window.localStorage.removeItem = function removeItemWithAccountScope(key) {
      const activeAccount = window.__farmActiveAccountStorageIdV2 || "guest";

      if (shouldScopeFarmStorageKey(key)) {
        return originals.removeItem(getScopedFarmStorageKey(key, activeAccount));
      }

      return originals.removeItem(key);
    };

    window.__farmStorageProxyInstalledV2 = true;
  }

  const previousAccount = originals.getItem(FARM_ACTIVE_ACCOUNT_KEY);

  if (previousAccount !== accountId) {
    // Remove only old unscoped data keys so they cannot leak into a fresh account.
    // Account-specific saved data stays untouched under farm_account:<accountId>:...
    removeLegacyFarmDataKeys(originals);
    originals.setItem(FARM_ACTIVE_ACCOUNT_KEY, accountId);

    window.dispatchEvent(
      new CustomEvent("farm-account-storage-changed", {
        detail: { accountId, previousAccount },
      })
    );
  }
}

function SettingsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="app-svg-icon app-settings-svg"
      aria-hidden="true"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 15.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8Z" />
      <path d="M18.8 13.4c.1-.5.2-.9.2-1.4s-.1-.9-.2-1.4l2-1.5-2-3.4-2.4 1a8 8 0 0 0-2.4-1.4L13.6 2h-3.2L10 5.3a8 8 0 0 0-2.4 1.4l-2.4-1-2 3.4 2 1.5C5.1 11.1 5 11.5 5 12s.1.9.2 1.4l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 2.4 1.4l.4 3.3h3.2l.4-3.3a8 8 0 0 0 2.4-1.4l2.4 1 2-3.4-2-1.5Z" />
    </svg>
  );
}

function AppBrandLogo({ className = "" }) {
  return (
    <span className={`app-brand-logo ${className}`} aria-hidden="true">
      <img src={farmAppLogo} alt="" />
    </span>
  );
}

function AppGlobalHeaderStyles() {
  return (
    <style>{`
      :root {
        --farm-app-logo-url: url("${farmAppLogo}");
      }
    `}</style>
  );
}

function AppNavIcon({ type }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="app-svg-icon app-nav-svg"
      aria-hidden="true"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {type === "home" && (
        <>
          <path d="M3.8 11.2 12 4.4l8.2 6.8" />
          <path d="M6.2 10.3v9.3h11.6v-9.3" />
          <path d="M10 19.6v-5h4v5" />
        </>
      )}

      {type === "expenses" && (
        <>
          <path d="M5 7h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
          <path d="M16 11h5v4h-5a2 2 0 0 1 0-4Z" />
          <path d="M6.5 7 15 4.5a1.8 1.8 0 0 1 2.2 1.2l.4 1.3" />
        </>
      )}

      {type === "cash" && (
        <>
          <path d="M7 4.5h10a2 2 0 0 1 2 2v13H5v-13a2 2 0 0 1 2-2Z" />
          <path d="M9 9h6" />
          <path d="M9 12h6" />
          <path d="M9 15h6" />
        </>
      )}

      {type === "workers" && (
        <>
          <path d="M9.4 11.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" />
          <path d="M3.8 20a5.7 5.7 0 0 1 11.4 0" />
          <path d="M16.1 10.9a2.8 2.8 0 1 0-1.1-5.3" />
          <path d="M17.2 13.6a4.7 4.7 0 0 1 3 4.4" />
        </>
      )}

      {type === "reports" && (
        <>
          <path d="M4.5 19.5h15" />
          <path d="M7 16.5v-5" />
          <path d="M12 16.5V7" />
          <path d="M17 16.5v-7" />
          <path d="M6.7 8.2 10 5.7l3.2 2.6 4.1-4" />
        </>
      )}
    </svg>
  );
}

function AppLayout() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  const settingsRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuth();

  configureAccountScopedStorage(isAuthenticated ? user : null);

  useEffect(() => {
    const storageKey = `farm-scroll:${location.pathname}${location.search}`;
    const savedY = Number(sessionStorage.getItem(storageKey) || 0);

    requestAnimationFrame(() => {
      window.scrollTo({
        top: Number.isFinite(savedY) ? savedY : 0,
        left: 0,
        behavior: "auto",
      });
    });

    const saveScrollPosition = () => {
      sessionStorage.setItem(storageKey, String(window.scrollY || 0));
    };

    window.addEventListener("scroll", saveScrollPosition, { passive: true });

    return () => {
      saveScrollPosition();
      window.removeEventListener("scroll", saveScrollPosition);
    };
  }, [location.pathname, location.search]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target)) {
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

  useEffect(() => {
    setSettingsOpen(false);
  }, [location.pathname, location.search]);

  const openSettings = () => {
    setSettingsOpen(false);
    navigate("/reports?panel=settings");
  };

  const handleLogout = () => {
    setSettingsOpen(false);
    logout();
    navigate("/login");
  };

  const initials =
    user?.name
      ?.split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "FT";

  const pageHasOwnPremiumHeader = [
    "/",
    "/workers",
    "/expenses",
    "/cash-book",
    "/sales",
    "/reports",
  ].includes(location.pathname);

  return (
    <>
      <AppGlobalHeaderStyles />

      <Toaster
        position="top-center"
        toastOptions={{
          duration: 2200,
          style: {
            borderRadius: "16px",
            padding: "12px 14px",
            background: "#0f172a",
            color: "#ffffff",
            boxShadow: "0 16px 32px rgba(15, 23, 42, 0.24)",
          },
        }}
      />

      <div className={`app-shell ${isAuthenticated ? "" : "app-shell-guest"}`}>
        <div className="shell-backdrop" />

        {isAuthenticated && !pageHasOwnPremiumHeader && (
          <header className="topbar">
            <div className="topbar-inner">
              <button
                type="button"
                className="brand-wrap"
                onClick={() => navigate("/")}
                aria-label="Go to dashboard"
              >
                <AppBrandLogo />

                <span className="brand-block">
                  <span className="logo">Farm Expense Tracker</span>
                  <span className="brand-subtitle">Expenses, workers, reports</span>
                </span>
              </button>

              <div className="settings-wrap" ref={settingsRef}>
                <button
                  type="button"
                  className="settings-trigger"
                  onClick={() => setSettingsOpen((prev) => !prev)}
                  aria-label="Open settings menu"
                  aria-expanded={settingsOpen}
                >
                  <SettingsIcon />
                </button>

                {settingsOpen ? (
                  <div className="settings-dropdown topbar-menu-right">
                    <div className="settings-profile-head">
                      <div className="settings-avatar">{initials}</div>

                      <div>
                        <strong>{user?.name || "User"}</strong>
                        <small>{user?.email || "No email"}</small>
                      </div>
                    </div>

                    <div className="settings-menu-list">
                      <button
                        type="button"
                        className="settings-menu-item"
                        onClick={() => {
                          setSettingsOpen(false);
                          navigate("/");
                        }}
                      >
                        <span>
                          <AppNavIcon type="home" />
                        </span>

                        <div>
                          <strong>Home</strong>
                          <small>Go to dashboard</small>
                        </div>

                        <em>›</em>
                      </button>

                      <button
                        type="button"
                        className="settings-menu-item"
                        onClick={() => {
                          setSettingsOpen(false);
                          navigate("/reports");
                        }}
                      >
                        <span>
                          <AppNavIcon type="reports" />
                        </span>

                        <div>
                          <strong>Reports</strong>
                          <small>See totals and insights</small>
                        </div>

                        <em>›</em>
                      </button>

                      <button
                        type="button"
                        className="settings-menu-item"
                        onClick={openSettings}
                      >
                        <span>
                          <SettingsIcon />
                        </span>

                        <div>
                          <strong>Settings</strong>
                          <small>App and account options</small>
                        </div>

                        <em>›</em>
                      </button>

                      <button
                        type="button"
                        className="settings-menu-item danger"
                        onClick={handleLogout}
                      >
                        <span>↪</span>

                        <div>
                          <strong>Logout</strong>
                          <small>Sign out safely</small>
                        </div>

                        <em>›</em>
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </header>
        )}

        <main className="page-wrap">
          <Routes>
            <Route
              path="/login"
              element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
            />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Home />
                </ProtectedRoute>
              }
            />

            <Route
              path="/expenses"
              element={
                <ProtectedRoute>
                  <Expenses />
                </ProtectedRoute>
              }
            />

            <Route
              path="/workers"
              element={
                <ProtectedRoute>
                  <Workers />
                </ProtectedRoute>
              }
            />

            <Route
              path="/reports"
              element={
                <ProtectedRoute>
                  <Reports />
                </ProtectedRoute>
              }
            />

            <Route
              path="/cash-book"
              element={
                <ProtectedRoute>
                  <CashBook />
                </ProtectedRoute>
              }
            />

            <Route
              path="/sales"
              element={
                <ProtectedRoute>
                  <Sales />
                </ProtectedRoute>
              }
            />
          </Routes>
        </main>

        {isAuthenticated && (
          <nav className="bottom-nav">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                isActive ? "bottom-nav-item active" : "bottom-nav-item"
              }
            >
              <span className="bottom-nav-icon">
                <AppNavIcon type="home" />
              </span>
              <span className="bottom-nav-label">Home</span>
            </NavLink>

            <NavLink
              to="/expenses"
              className={({ isActive }) =>
                isActive ? "bottom-nav-item active" : "bottom-nav-item"
              }
            >
              <span className="bottom-nav-icon">
                <AppNavIcon type="expenses" />
              </span>
              <span className="bottom-nav-label">Expenses</span>
            </NavLink>

            <NavLink
              to="/cash-book"
              className={({ isActive }) =>
                isActive ? "bottom-nav-item active" : "bottom-nav-item"
              }
            >
              <span className="bottom-nav-icon">
                <AppNavIcon type="cash" />
              </span>
              <span className="bottom-nav-label">Cash Book</span>
            </NavLink>

            <NavLink
              to="/workers"
              className={({ isActive }) =>
                isActive ? "bottom-nav-item active" : "bottom-nav-item"
              }
            >
              <span className="bottom-nav-icon">
                <AppNavIcon type="workers" />
              </span>
              <span className="bottom-nav-label">Workers</span>
            </NavLink>

            <NavLink
              to="/reports"
              className={({ isActive }) =>
                isActive ? "bottom-nav-item active" : "bottom-nav-item"
              }
            >
              <span className="bottom-nav-icon">
                <AppNavIcon type="reports" />
              </span>
              <span className="bottom-nav-label">Reports</span>
            </NavLink>
          </nav>
        )}
      </div>
    </>
  );
}

export default function App() {
  return (
    <Router>
      <AppLayout />
    </Router>
  );
}  