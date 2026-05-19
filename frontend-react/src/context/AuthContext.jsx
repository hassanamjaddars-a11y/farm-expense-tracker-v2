import { createContext, useContext, useEffect, useMemo, useState } from "react";
import api from "../api";

const AuthContext = createContext(null);

const AUTH_BOOT_TIMEOUT_MS = 2500;
const FARM_LAST_ACCOUNT_SCOPE_KEY = "farm_last_account_scope_v2";
const FARM_ACTIVE_ACCOUNT_KEY = "__farm_active_account_scope_v2";

function getStableAccountScopeFromUser(user) {
  const raw = user?._id || user?.id || user?.email || user?.name || "";

  return (
    String(raw)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9@._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "guest"
  );
}

function rememberUserForOffline(user, fallbackPayload = {}) {
  try {
    const email = user?.email || fallbackPayload?.email || "";
    const name = user?.name || fallbackPayload?.name || "User";
    const accountScope = getStableAccountScopeFromUser(user || fallbackPayload);

    if (email) {
      localStorage.setItem("farm_last_email", email);
    }

    if (name) {
      localStorage.setItem("farm_last_name", name);
    }

    if (accountScope && accountScope !== "guest") {
      localStorage.setItem(FARM_LAST_ACCOUNT_SCOPE_KEY, accountScope);
    }
  } catch (error) {
    console.warn("Could not save offline auth snapshot:", error);
  }
}

function getRememberedOfflineAccountScope() {
  try {
    return (
      localStorage.getItem(FARM_LAST_ACCOUNT_SCOPE_KEY) ||
      localStorage.getItem(FARM_ACTIVE_ACCOUNT_KEY) ||
      ""
    );
  } catch (error) {
    console.warn("Could not read offline account scope:", error);
    return "";
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authResolvedOnce, setAuthResolvedOnce] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const finishAuth = (nextUser) => {
      if (!isMounted) return;

      setUser(nextUser);
      setAuthLoading(false);
      setAuthResolvedOnce(true);
    };

    const getOfflineSessionUser = () => {
      const cachedEmail = localStorage.getItem("farm_last_email") || "";
      const cachedName = localStorage.getItem("farm_last_name") || "User";
      const rememberedScope = getRememberedOfflineAccountScope();

      /*
        VERY IMPORTANT:
        Do NOT use only "offline-user" here.

        Your App.jsx scopes localStorage like this:
        farm_account:<user-id-or-email>:<key>

        If offline auth uses "offline-user", then app reads:
        farm_account:offline-user:...

        But your real saved data is under the real account id/email.
      */
      const stableId = rememberedScope || cachedEmail || "offline-user";

      return {
        _id: stableId,
        id: stableId,
        name: cachedName,
        email: cachedEmail,
        offlineSession: true,
      };
    };

    const bootstrapAuth = async () => {
      const token = localStorage.getItem("farm_token");

      if (!token) {
        finishAuth(null);
        return;
      }

      try {
        const res = await Promise.race([
          api.get("/auth/me"),
          new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error("AUTH_BOOT_TIMEOUT"));
            }, AUTH_BOOT_TIMEOUT_MS);
          }),
        ]);

        if (!isMounted) return;

        const resolvedUser = res?.data?.user || null;

        if (resolvedUser) {
          rememberUserForOffline(resolvedUser);
        }

        localStorage.setItem("farm_auth_mode", "login");
        finishAuth(resolvedUser);
      } catch (err) {
        console.error("Auth bootstrap error:", err);

        if (!isMounted) return;

        const status = err?.response?.status;
        const isUnauthorized = status === 401;

        const isOfflineFailure =
          !err?.response ||
          err?.code === "ECONNABORTED" ||
          err?.message === "AUTH_BOOT_TIMEOUT" ||
          navigator.onLine === false;

        if (isUnauthorized) {
          localStorage.removeItem("farm_token");
          localStorage.setItem("farm_auth_mode", "login");
          finishAuth(null);
          return;
        }

        if (isOfflineFailure) {
          finishAuth(getOfflineSessionUser());
          return;
        }

        finishAuth(null);
      }
    };

    bootstrapAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (payload) => {
    const res = await api.post("/auth/login", payload);

    localStorage.setItem("farm_token", res.data.token);
    localStorage.setItem("farm_auth_mode", "login");

    rememberUserForOffline(res?.data?.user, payload);

    setUser(res.data.user);
    setAuthLoading(false);
    setAuthResolvedOnce(true);

    return res.data;
  };

  const register = async (payload) => {
    const res = await api.post("/auth/register", payload);

    localStorage.setItem("farm_token", res.data.token);
    localStorage.setItem("farm_auth_mode", "login");

    rememberUserForOffline(res?.data?.user, payload);

    setUser(res.data.user);
    setAuthLoading(false);
    setAuthResolvedOnce(true);

    return res.data;
  };

  const logout = () => {
    localStorage.removeItem("farm_token");
    localStorage.setItem("farm_auth_mode", "login");

    setUser(null);
    setAuthLoading(false);
    setAuthResolvedOnce(true);
  };

  const value = useMemo(
    () => ({
      user,
      setUser,
      authLoading,
      authResolvedOnce,
      isAuthenticated: !!user,
      login,
      register,
      logout,
    }),
    [user, authLoading, authResolvedOnce]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}