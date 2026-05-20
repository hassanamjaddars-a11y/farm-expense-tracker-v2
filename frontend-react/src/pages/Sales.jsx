import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import farmPremiumHeader from "../assets/farm-premium-header.png";
import salesProduceHero from "../assets/sales-produce-hero.png";
import "../styles/sales.css";
import {
  attemptSyncPending,
  buildSalesPageWithPending,
  cacheSalesPageSnapshot,
  deletePendingSaleLocal,
  getSalesPageSnapshotWithPending,
  isOnlineNow,
  queueSaleOffline,
  updatePendingSaleLocal,
} from "../utils/offlineQueue";

const WORKER_PROFILES_STORAGE_KEY = "farm_worker_profiles_v2";
const SALES_CATEGORY_STORAGE_KEY = "farm_sales_categories_v1";
const SALES_PAGE_CACHE_KEY = "farm_sales_page_cache_v1";

const EMPTY_SALES_SUMMARY = {
  totalSales: 0,
  totalQuantity: 0,
  grossSalesAmount: 0,
  ownerIncomeAmount: 0,
  workersAllocationAmount: 0,
};

const DEFAULT_SALES_SETTINGS = {
  murhWeightKg: 20,
  defaultOwnerSharePercentage: 70,
  defaultWorkerSharePercentage: 30,
  currencyLabel: "PKR",
};

const readSalesPageCache = () => {
  try {
    return getSalesPageSnapshotWithPending();
  } catch (error) {
    console.error("Sales page cache read error:", error);
    return {
      items: [],
      summary: EMPTY_SALES_SUMMARY,
      settings: DEFAULT_SALES_SETTINGS,
      workerRecords: [],
    };
  }
};

const writeSalesPageCache = (payload) => {
  try {
    cacheSalesPageSnapshot(payload);
  } catch (error) {
    console.error("Sales page cache write error:", error);
  }
};

const todayInputValue = () => new Date().toISOString().slice(0, 10);

const defaultSalesCategories = [
  {
    id: "crop-sales",
    name: "Crop Sales",
    subtitle: "Field crops",
    icon: "🌾",
    imageDataUrl: "",
  },
  {
    id: "vegetables",
    name: "Vegetables",
    subtitle: "Fresh produce",
    icon: "🥬",
    imageDataUrl: "",
  },
  {
    id: "cotton",
    name: "Cotton",
    subtitle: "Fiber crop",
    icon: "☁️",
    imageDataUrl: "",
  },
  {
    id: "wheat",
    name: "Wheat",
    subtitle: "Grain bags",
    icon: "🌾",
    imageDataUrl: "",
  },
];

const readSalesCategories = () => {
  try {
    const raw = localStorage.getItem(SALES_CATEGORY_STORAGE_KEY);
    const parsed = JSON.parse(raw || "[]");

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return defaultSalesCategories;
    }

    const merged = [...defaultSalesCategories];

    parsed.forEach((item) => {
      const existingIndex = merged.findIndex(
        (category) => normalizeName(category.name) === normalizeName(item?.name)
      );

      const clean = {
        id: item?.id || `sales-cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: item?.name || "Other",
        subtitle: item?.subtitle || "Sales category",
        icon: item?.icon || "🌱",
        imageDataUrl: item?.imageDataUrl || "",
      };

      if (existingIndex >= 0) {
        merged[existingIndex] = { ...merged[existingIndex], ...clean };
      } else {
        merged.push(clean);
      }
    });

    return merged;
  } catch (error) {
    console.error("Sales categories read error:", error);
    return defaultSalesCategories;
  }
};

const writeSalesCategories = (categories) => {
  localStorage.setItem(SALES_CATEGORY_STORAGE_KEY, JSON.stringify(categories));
};

const defaultForm = {
  productName: "",
  quantity: "",
  unit: "murh",
  rate: "",
  totalAmount: "",
  ownerSharePercentage: "70",
  saleDate: todayInputValue(),
  note: "",
};

const UNIT_WEIGHT_KG = {
  murh: 20,
  maund: 40,
  kg: 1,
};

const getUnitWeightKg = (unit) => UNIT_WEIGHT_KG[unit] || 1;

const getUnitHint = (unit) => {
  if (unit === "maund") return "1 Maund = 40 kg";
  if (unit === "murh") return "1 Murh = 20 kg";
  return "Kg selected: write exact kg in Quantity";
};

const money = (value) => `PKR ${Number(value || 0).toLocaleString()}`;

const normalizeName = (value = "") =>
  String(value).trim().replace(/\s+/g, " ").toLowerCase();

const formatDate = (value) => {
  if (!value) return "No date";

  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const getSeed = (value = "") =>
  String(value)
    .split("")
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);

const pick = (arr, seed) => arr[seed % arr.length];

const clampZoom = (value) => {
  const num = Number(value || 1);
  if (Number.isNaN(num)) return 1;
  return Math.min(2.4, Math.max(1, num));
};

const safeNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const readWorkerProfiles = () => {
  try {
    const raw = localStorage.getItem(WORKER_PROFILES_STORAGE_KEY);
    const parsed = JSON.parse(raw || "[]");

    if (!Array.isArray(parsed)) return [];

    return parsed.map((profile) => ({
      ...profile,
      photoZoom: clampZoom(profile?.photoZoom),
      photoX: safeNumber(profile?.photoX, 0),
      photoY: safeNumber(profile?.photoY, 0),
    }));
  } catch (error) {
    console.error("Sales worker profile read error:", error);
    return [];
  }
};

const getWorkerAvatar = (name = "Worker") => {
  const seed = getSeed(name);
  const backgrounds = [
    ["#dbeafe", "#bfdbfe"],
    ["#dcfce7", "#bbf7d0"],
    ["#fef3c7", "#fde68a"],
    ["#fae8ff", "#f5d0fe"],
  ];
  const shirts = ["#2563eb", "#0f766e", "#7c3aed", "#0f172a", "#ea580c"];
  const hairs = ["#111827", "#334155", "#1f2937", "#475569"];
  const skins = ["#f2c6a0", "#e9b98f", "#dba77f", "#c98e65"];

  const [bgA, bgB] = pick(backgrounds, seed);
  const shirt = pick(shirts, seed + 1);
  const hair = pick(hairs, seed + 2);
  const skin = pick(skins, seed + 3);

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="84" height="84" viewBox="0 0 84 84">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${bgA}" />
          <stop offset="100%" stop-color="${bgB}" />
        </linearGradient>
      </defs>
      <circle cx="42" cy="42" r="42" fill="url(#bg)" />
      <ellipse cx="42" cy="70" rx="22" ry="15" fill="${shirt}" />
      <circle cx="42" cy="34" r="14" fill="${skin}" />
      <path d="M28 33c1-10 9-16 14-16 8 0 13 6 14 15-5-4-10-6-15-6-4 0-8 1-13 7z" fill="${hair}" />
      <circle cx="37" cy="35" r="1.3" fill="#1f2937" />
      <circle cx="47" cy="35" r="1.3" fill="#1f2937" />
      <path d="M38 41c2 2 6 2 8 0" stroke="#7c2d12" stroke-width="1.6" stroke-linecap="round" fill="none" />
    </svg>
  `;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};


const FarmLeafLogo = () => (
  <span className="sales-logo-orb" aria-hidden="true">
    <svg viewBox="0 0 64 64" fill="none">
      <path d="M32 50V18" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M32 24c-11-1-18-7-21-16 11 0 19 5 21 16Z" fill="currentColor" opacity="0.95" />
      <path d="M33 32c10-1 17-6 20-15-10 0-17 5-20 15Z" fill="currentColor" opacity="0.78" />
      <path d="M32 40c-9-1-15-5-18-13 9 0 15 5 18 13Z" fill="currentColor" opacity="0.72" />
    </svg>
  </span>
);

const SalesIcon = ({ type }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
    {type === "cart" && (
      <>
        <path d="M5 7h14l-1.3 7H8L5 7Z" />
        <path d="M5 7 4.3 4H2.8" />
        <circle cx="9" cy="19.2" r="1.25" />
        <circle cx="17" cy="19.2" r="1.25" />
      </>
    )}

    {type === "tag" && (
      <>
        <path d="M4.5 12.5 12.8 4.2H19.5v6.7l-8.3 8.3a2 2 0 0 1-2.8 0l-3.9-3.9a2 2 0 0 1 0-2.8Z" />
        <path d="M16 8h.1" />
      </>
    )}

    {type === "qty" && (
      <>
        <path d="M7 6h10v12H7z" />
        <path d="M9.5 9h5" />
        <path d="M9.5 12h5" />
        <path d="M9.5 15h3" />
      </>
    )}

    {type === "money" && (
      <>
        <path d="M4 7h16v10H4z" />
        <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path d="M6.5 9h.1" />
        <path d="M17.5 15h.1" />
      </>
    )}

    {type === "calendar" && (
      <>
        <path d="M5 5.5h14v14H5z" />
        <path d="M8 3.5v4" />
        <path d="M16 3.5v4" />
        <path d="M5 9h14" />
      </>
    )}

    {type === "note" && (
      <>
        <path d="M7 4.5h7l3 3v12H7z" />
        <path d="M14 4.5v4h4" />
        <path d="M9.5 12h5" />
        <path d="M9.5 15h4" />
      </>
    )}

    {type === "grid" && (
      <>
        <path d="M5 5h5v5H5z" />
        <path d="M14 5h5v5h-5z" />
        <path d="M5 14h5v5H5z" />
        <path d="M14 14h5v5h-5z" />
      </>
    )}
  </svg>
);

const Avatar = ({ src, alt, zoom = 1, x = 0, y = 0 }) => (
  <span className="sales-worker-avatar">
    <img
      src={src}
      alt={alt}
      style={{
        transform: `translate(${safeNumber(x, 0)}px, ${safeNumber(y, 0)}px) scale(${clampZoom(
          zoom
        )})`,
      }}
    />
  </span>
);

export default function Sales() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const menuRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const cachedSalesPage = useMemo(() => readSalesPageCache(), []);
  const [items, setItems] = useState(cachedSalesPage.items);
  const [summary, setSummary] = useState(cachedSalesPage.summary);
  const [settings, setSettings] = useState(cachedSalesPage.settings);
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [workerRecords, setWorkerRecords] = useState(cachedSalesPage.workerRecords);
  const [workerProfiles, setWorkerProfiles] = useState(() => readWorkerProfiles());
  const [selectedWorkerKeys, setSelectedWorkerKeys] = useState([]);
  const [salesCategories, setSalesCategories] = useState(() => readSalesCategories());
  const [manageCategories, setManageCategories] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const fetchSales = async ({ silent = false } = {}) => {
    try {
      const [salesRes, settingsRes, workersRes] = await Promise.all([
        api.get("/sales"),
        api.get("/settings").catch(() => ({ data: {} })),
        api.get("/workers").catch(() => ({ data: [] })),
      ]);

      const salesData = salesRes.data || {};
      const settingsData = settingsRes.data || {};
      const nextWorkerRecords = Array.isArray(workersRes.data) ? workersRes.data : [];
      const nextSettings = {
        ...settings,
        ...settingsData,
        currencyLabel: "PKR",
      };

      const serverSnapshot = {
        items: Array.isArray(salesData.items) ? salesData.items : [],
        summary: salesData.summary || EMPTY_SALES_SUMMARY,
        settings: nextSettings,
        workerRecords: nextWorkerRecords,
      };
      const mergedSnapshot = buildSalesPageWithPending(serverSnapshot);

      setItems(mergedSnapshot.items);
      setSummary(mergedSnapshot.summary);
      setWorkerRecords(nextWorkerRecords);
      setWorkerProfiles(readWorkerProfiles());
      setSettings(nextSettings);
      writeSalesPageCache(serverSnapshot);

      setForm((prev) => {
        if (editingId) return prev;

        return {
          ...prev,
          ownerSharePercentage: String(
            settingsData.defaultOwnerSharePercentage ??
              prev.ownerSharePercentage ??
              70
          ),
        };
      });
    } catch (err) {
      console.error("Sales fetch error:", err);
      const offlineSnapshot = getSalesPageSnapshotWithPending();
      setItems(offlineSnapshot.items);
      setSummary(offlineSnapshot.summary);
      setWorkerRecords(offlineSnapshot.workerRecords || []);
      setSettings(offlineSnapshot.settings || DEFAULT_SALES_SETTINGS);

      if (!silent) {
        toast.error(err?.response?.data?.error || "Offline mode: showing saved sales");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const refreshFromLocalCache = () => {
      const localSnapshot = getSalesPageSnapshotWithPending();
      setItems(localSnapshot.items);
      setSummary(localSnapshot.summary);
      setWorkerRecords(localSnapshot.workerRecords || []);
      setWorkerProfiles(readWorkerProfiles());
      setSettings(localSnapshot.settings || DEFAULT_SALES_SETTINGS);
    };

    refreshFromLocalCache();
    fetchSales({ silent: true });

    const handleOnline = async () => {
      await attemptSyncPending(api);
      await fetchSales({ silent: true });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("farm-sales-cache-updated", refreshFromLocalCache);
    window.addEventListener("storage", refreshFromLocalCache);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("farm-sales-cache-updated", refreshFromLocalCache);
      window.removeEventListener("storage", refreshFromLocalCache);
    };
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

  const workerDirectory = useMemo(() => {
    const map = new Map();

    workerProfiles.forEach((profile) => {
      const key = normalizeName(profile.fullName);
      if (!key) return;

      map.set(key, {
        key,
        fullName: profile.fullName,
        roleCategory: profile.roleCategory || "Worker",
        photoDataUrl: profile.photoDataUrl || "",
        photoZoom: clampZoom(profile.photoZoom),
        photoX: safeNumber(profile.photoX, 0),
        photoY: safeNumber(profile.photoY, 0),
      });
    });

    workerRecords.forEach((record) => {
      const name = record.workerName || "";
      const key = normalizeName(name);

      if (!key || map.has(key)) return;

      map.set(key, {
        key,
        fullName: name,
        roleCategory: record.category?.name || "Worker",
        photoDataUrl: "",
        photoZoom: 1,
        photoX: 0,
        photoY: 0,
      });
    });

    return Array.from(map.values()).sort((a, b) =>
      a.fullName.localeCompare(b.fullName)
    );
  }, [workerProfiles, workerRecords]);

  const ownerShare = Number(form.ownerSharePercentage || 0);
  const workerShare = Math.max(0, 100 - ownerShare);
  const quantity = Number(form.quantity || 0);
  const rate = Number(form.rate || 0);
  const manualTotal = Number(form.totalAmount || 0);

  const previewTotalAmount =
    manualTotal > 0 ? manualTotal : quantity > 0 && rate > 0 ? quantity * rate : 0;

  const selectedUnitWeightKg = getUnitWeightKg(form.unit);
  const previewTotalWeightKg = quantity * selectedUnitWeightKg;

  const previewOwnerAmount = (previewTotalAmount * ownerShare) / 100;
  const previewWorkerAmount = previewTotalAmount - previewOwnerAmount;

  const selectedWorkers = useMemo(
    () => workerDirectory.filter((worker) => selectedWorkerKeys.includes(worker.key)),
    [workerDirectory, selectedWorkerKeys]
  );

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return items;

    return items.filter((item) => {
      const productName = String(item.productName || "").toLowerCase();
      const unit = String(item.unit || "").toLowerCase();
      const totalAmount = String(item.totalAmount || "").toLowerCase();
      const totalWeightKg = String(item.totalWeightKg || "").toLowerCase();
      const note = String(item.note || "").toLowerCase();
      const workerNames = Array.isArray(item.workerSplits)
        ? item.workerSplits.map((entry) => entry.workerName).join(" ").toLowerCase()
        : "";
      const date = item.saleDate
        ? new Date(item.saleDate).toLocaleString().toLowerCase()
        : "";

      return (
        productName.includes(q) ||
        unit.includes(q) ||
        totalAmount.includes(q) ||
        totalWeightKg.includes(q) ||
        note.includes(q) ||
        workerNames.includes(q) ||
        date.includes(q)
      );
    });
  }, [items, search]);

  const toggleWorker = (workerKey) => {
    setSelectedWorkerKeys((prev) =>
      prev.includes(workerKey)
        ? prev.filter((key) => key !== workerKey)
        : [...prev, workerKey]
    );
  };

  const selectAllWorkers = () => {
    if (!workerDirectory.length) {
      toast.error("No workers saved yet");
      return;
    }

    setSelectedWorkerKeys(workerDirectory.map((worker) => worker.key));
  };

  const clearWorkers = () => {
    setSelectedWorkerKeys([]);
  };

  const applySalesCategory = (category) => {
    setForm((prev) => ({
      ...prev,
      productName: category.name,
    }));
    toast.success(`${category.name} selected`);
  };

  const saveSalesCategories = (nextCategories) => {
    setSalesCategories(nextCategories);
    writeSalesCategories(nextCategories);
  };

  const addSalesCategory = () => {
    const cleanName = newCategoryName.trim();

    if (!cleanName) {
      toast.error("Enter category name");
      return;
    }

    const exists = salesCategories.some(
      (category) => normalizeName(category.name) === normalizeName(cleanName)
    );

    if (exists) {
      toast.error("Category already exists");
      return;
    }

    const nextCategories = [
      ...salesCategories,
      {
        id: `sales-cat-${Date.now()}`,
        name: cleanName,
        subtitle: "Custom sale",
        icon: "🌱",
        imageDataUrl: "",
      },
    ];

    saveSalesCategories(nextCategories);
    setNewCategoryName("");
    toast.success("Sales category added");
  };

  const updateSalesCategoryImage = (categoryId, file) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const nextCategories = salesCategories.map((category) =>
        category.id === categoryId
          ? { ...category, imageDataUrl: String(reader.result || "") }
          : category
      );

      saveSalesCategories(nextCategories);
      toast.success("Category image updated");
    };
    reader.readAsDataURL(file);
  };

  const resetForm = () => {
    setForm({
      ...defaultForm,
      ownerSharePercentage: String(
        settings.defaultOwnerSharePercentage ?? defaultForm.ownerSharePercentage
      ),
      saleDate: todayInputValue(),
    });
    setSelectedWorkerKeys([]);
    setEditingId("");
  };

  const refreshSalesFromOfflineSnapshot = () => {
    const snapshot = getSalesPageSnapshotWithPending();
    setItems(snapshot.items);
    setSummary(snapshot.summary);
    setWorkerRecords(snapshot.workerRecords || []);
    setWorkerProfiles(readWorkerProfiles());
    setSettings(snapshot.settings || DEFAULT_SALES_SETTINGS);
  };

  const saveSaleOffline = ({ payload, existingId = "" }) => {
    if (existingId) {
      const updated = updatePendingSaleLocal({ id: existingId, payload });

      if (!updated) {
        toast.error("This saved sale cannot be edited while offline");
        return false;
      }

      toast.success("Offline sale updated. It will sync when internet returns.");
    } else {
      queueSaleOffline(payload);
      toast.success("Sale saved offline. It will sync when internet returns.");
    }

    resetForm();
    refreshSalesFromOfflineSnapshot();
    return true;
  };

  const saveSale = async () => {
    if (!form.productName.trim()) {
      toast.error("Please enter product name");
      return;
    }

    if (!form.quantity || Number(form.quantity) <= 0) {
      toast.error("Please enter valid quantity");
      return;
    }

    if (!form.rate || Number(form.rate) < 0) {
      toast.error("Please enter valid rate");
      return;
    }

    if (ownerShare < 0 || ownerShare > 100) {
      toast.error("Owner share must be between 0 and 100");
      return;
    }

    if (workerShare > 0 && selectedWorkers.length === 0) {
      toast.error("Please select at least one worker for worker share");
      return;
    }

    const payload = {
      productName: form.productName.trim(),
      quantity: Number(form.quantity),
      unit: form.unit,
      unitWeightKg: selectedUnitWeightKg,
      rate: Number(form.rate),
      totalAmount: form.totalAmount ? Number(form.totalAmount) : undefined,
      ownerSharePercentage: ownerShare,
      workerSharePercentage: workerShare,
      saleDate: form.saleDate || todayInputValue(),
      note: form.note.trim(),
      distributionMode: "equal",
      workers: selectedWorkers.map((worker) => ({
        workerName: worker.fullName,
      })),
      billImageUrls: [],
    };

    const editingItem = items.find(
      (item) => item?._id === editingId || item?.clientId === editingId
    );
    const isEditingPendingSale = Boolean(
      editingItem?.isPendingSync || String(editingId || "").startsWith("local-sale-")
    );

    if (!isOnlineNow()) {
      saveSaleOffline({
        payload,
        existingId: editingId && isEditingPendingSale ? editingId : "",
      });
      return;
    }

    try {
      if (editingId) {
        if (isEditingPendingSale) {
          saveSaleOffline({ payload, existingId: editingId });
          return;
        }

        await api.put(`/sales/${editingId}`, payload);
        toast.success("Sale updated");
      } else {
        await api.post("/sales", payload);
        toast.success("Sale added");
      }

      resetForm();
      await attemptSyncPending(api);
      await fetchSales();
    } catch (err) {
      console.error("Sales save error:", err);

      const isNetworkFailure =
        !err?.response ||
        err?.code === "ERR_NETWORK" ||
        err?.code === "ECONNABORTED" ||
        navigator.onLine === false;

      if (isNetworkFailure && !editingId) {
        saveSaleOffline({ payload });
        return;
      }

      if (isNetworkFailure && isEditingPendingSale) {
        saveSaleOffline({ payload, existingId: editingId });
        return;
      }

      toast.error(err?.response?.data?.error || "Failed to save sale");
    }
  };

  const startEdit = (item) => {
    const selectedKeys = Array.isArray(item.workerSplits)
      ? item.workerSplits
          .map((entry) => normalizeName(entry.workerName))
          .filter(Boolean)
      : [];

    setEditingId(item._id);
    setSelectedWorkerKeys(selectedKeys);

    setForm({
      productName: item.productName || "",
      quantity: item.quantity || "",
      unit: item.unit || "murh",
      rate: item.rate || "",
      totalAmount: item.totalAmount || "",
      ownerSharePercentage: String(item.ownerSharePercentage ?? 70),
      saleDate: item.saleDate
        ? new Date(item.saleDate).toISOString().slice(0, 10)
        : todayInputValue(),
      note: item.note || "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteSale = async (item) => {
    const ok = window.confirm("Delete this sale?");
    if (!ok) return;

    const isPendingSale = Boolean(
      item?.isPendingSync || String(item?._id || "").startsWith("local-sale-")
    );

    if (isPendingSale) {
      deletePendingSaleLocal(item._id || item.clientId);
      refreshSalesFromOfflineSnapshot();
      toast.success("Offline sale deleted");
      return;
    }

    if (!isOnlineNow()) {
      toast.error("This sale is already synced. Connect internet to delete it.");
      return;
    }

    try {
      await api.delete(`/sales/${item._id}`);
      toast.success("Sale deleted");
      await fetchSales();
    } catch (err) {
      console.error("Sales delete error:", err);
      toast.error(err?.response?.data?.error || "Failed to delete sale");
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

  return (
    <div className="sales-page">
      <section className="sales-farm-header">
        <img
          className="sales-header-image"
          src={farmPremiumHeader}
          alt="Farm fields and tractor"
        />
        <div className="sales-header-shade" />

        <div className="sales-brand-row">
          <div className="sales-brand-left">
            <FarmLeafLogo />
            <div className="sales-brand-copy">
              <h1>Farm Expense Tracker</h1>
              <p>Expenses, workers, reports</p>
            </div>
          </div>

          <div className="sales-menu-wrap" ref={menuRef}>
            <button
              type="button"
              className="sales-settings-button"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label="Open settings menu"
              aria-expanded={menuOpen}
            >
              ⚙
            </button>

            {menuOpen ? (
              <div className="premium-profile-dropdown sales-profile-dropdown">
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

        <div className="sales-page-title">
          <span className="sales-page-icon">
            <SalesIcon type="cart" />
          </span>
          <h2>Sales</h2>
        </div>
      </section>

      <section className="sales-summary-card">
        <div className="sales-summary-copy">
          <span>Total Sales</span>
          <h3>{loading ? "—" : money(summary.grossSalesAmount)}</h3>
          <p>{loading ? "Loading..." : `${summary.totalSales || 0} saved records`}</p>
        </div>

        <div className="sales-produce-art" aria-hidden="true">
          <img src={salesProduceHero} alt="" />
        </div>

        <div className="sales-trend-line">
          <span>↗</span>
          <strong>{money(summary.ownerIncomeAmount)}</strong>
          <small>owner income</small>
        </div>
      </section>

      <section className="sales-tabs">
        <button type="button" onClick={() => navigate("/cash-book")}>
          Cash Book
        </button>

        <button type="button" className="active">
          Sales
        </button>

        <button
          type="button"
          onClick={() => toast("Profit Share will be available in future updates.")}
        >
          Profit Share
        </button>
      </section>

      <section className="sales-panel sales-categories-panel sales-categories-compact">
        <div className="sales-section-head">
          <div className="sales-title-row compact">
            <span className="sales-section-icon soft">
              <SalesIcon type="grid" />
            </span>
            <div>
              <h3>Sales Categories</h3>
              <p>Tap a category to fill product name. Upload images for your own look.</p>
            </div>
          </div>

          <button
            type="button"
            className="sales-text-btn"
            onClick={() => setManageCategories((prev) => !prev)}
          >
            {manageCategories ? "Done" : "Manage"} ›
          </button>
        </div>

        <div className="sales-category-grid">
          {salesCategories.map((category) => (
            <button
              key={category.id}
              type="button"
              className="sales-category-tile"
              onClick={() => applySalesCategory(category)}
            >
              <span className="sales-category-icon">
                {category.imageDataUrl ? (
                  <img src={category.imageDataUrl} alt={category.name} />
                ) : (
                  category.icon || "🌱"
                )}
              </span>
              <div>
                <strong>{category.name}</strong>
                <small>{category.subtitle || "Sale category"}</small>
              </div>
            </button>
          ))}
        </div>

        {manageCategories ? (
          <div className="sales-manage-box">
            <div>
              <h4>Add or update sales categories</h4>
              <p>Images stay saved in this browser for quick farm-style category tiles.</p>
            </div>

            <div className="sales-add-category-row">
              <input
                type="text"
                placeholder="New category name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
              />
              <button type="button" onClick={addSalesCategory}>Add</button>
            </div>

            <div className="sales-image-manage-grid">
              {salesCategories.map((category) => (
                <label key={category.id} className="sales-image-upload">
                  <span>{category.imageDataUrl ? "Change" : "Upload"}</span>
                  <strong>{category.name}</strong>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) =>
                      updateSalesCategoryImage(category.id, e.target.files?.[0])
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        ) : null}
      </section>


      <section className="sales-panel sales-add-panel">
        <div className="sales-section-head">
          <div className="sales-title-row">
            <span className="sales-section-icon">
              <SalesIcon type="tag" />
            </span>
            <div>
              <h3>{editingId ? "Edit Sale" : "Add Sale"}</h3>
              <p>
                Murh = 20 kg, Maund = 40 kg, and Kg uses the quantity as exact weight. Owner and worker share calculate automatically.
              </p>
            </div>
          </div>
        </div>

        <div className="sales-preview-grid">
          <div>
            <span>Total sale</span>
            <strong>{money(previewTotalAmount)}</strong>
          </div>

          <div>
            <span>Owner gets</span>
            <strong>{money(previewOwnerAmount)}</strong>
          </div>

          <div>
            <span>Workers get</span>
            <strong>{money(previewWorkerAmount)}</strong>
          </div>

          <div>
            <span>Total kg</span>
            <strong>{Number(previewTotalWeightKg || 0).toLocaleString()} kg</strong>
          </div>
        </div>

        <div className="sales-form-grid">
          <label className="sales-field">
            <span className="sales-field-icon">
              <SalesIcon type="tag" />
            </span>
            <div>
              <small>Product</small>
              <input
                type="text"
                placeholder="Wheat, chilies, cotton"
                value={form.productName}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, productName: e.target.value }))
                }
              />
            </div>
          </label>

          <label className="sales-field">
            <span className="sales-field-icon">
              <SalesIcon type="qty" />
            </span>
            <div>
              <small>Quantity</small>
              <input
                type="number"
                placeholder="Enter quantity"
                value={form.quantity}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, quantity: e.target.value }))
                }
              />
            </div>
          </label>

          <label className="sales-field">
            <span className="sales-field-icon">
              <SalesIcon type="grid" />
            </span>
            <div>
              <small>Unit</small>
              <select
                value={form.unit}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, unit: e.target.value }))
                }
              >
                <option value="murh">Murh</option>
                <option value="maund">Maund</option>
                <option value="kg">Kg</option>
              </select>
              <em className="sales-unit-hint">{getUnitHint(form.unit)}</em>
            </div>
          </label>

          <label className="sales-field">
            <span className="sales-field-icon">
              <SalesIcon type="money" />
            </span>
            <div>
              <small>Rate (PKR)</small>
              <input
                type="number"
                placeholder="Enter rate"
                value={form.rate}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, rate: e.target.value }))
                }
              />
            </div>
          </label>

          <label className="sales-field">
            <span className="sales-field-icon">
              <SalesIcon type="money" />
            </span>
            <div>
              <small>Total Amount</small>
              <input
                type="number"
                placeholder="Optional manual total"
                value={form.totalAmount}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, totalAmount: e.target.value }))
                }
              />
            </div>
          </label>

          <label className="sales-field">
            <span className="sales-field-icon">
              <SalesIcon type="grid" />
            </span>
            <div>
              <small>Owner Share %</small>
              <input
                type="number"
                placeholder="70"
                value={form.ownerSharePercentage}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    ownerSharePercentage: e.target.value,
                  }))
                }
              />
            </div>
          </label>

          <label className="sales-field sales-field-wide">
            <span className="sales-field-icon">
              <SalesIcon type="calendar" />
            </span>
            <div>
              <small>Date</small>
              <input
                type="date"
                value={form.saleDate}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, saleDate: e.target.value }))
                }
              />
            </div>
          </label>

          <label className="sales-field sales-field-wide">
            <span className="sales-field-icon">
              <SalesIcon type="note" />
            </span>
            <div>
              <small>Note (Optional)</small>
              <input
                type="text"
                placeholder="Buyer name, market, payment detail..."
                value={form.note}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, note: e.target.value }))
                }
              />
            </div>
          </label>
        </div>

        <section className="sales-worker-box">
          <div className="sales-worker-head">
            <div>
              <h4>Select workers for share</h4>
              <p>Tap worker cards instead of typing names.</p>
            </div>

            <div className="sales-worker-tools">
              <button type="button" onClick={selectAllWorkers}>All</button>
              <button type="button" onClick={clearWorkers}>Clear</button>
            </div>
          </div>

          <div className="sales-worker-selected-line">
            <span>{selectedWorkers.length} selected</span>
            <strong>{money(previewWorkerAmount)}</strong>
          </div>

          {workerDirectory.length === 0 ? (
            <div className="sales-worker-empty">
              No saved workers yet. Add workers from the Workers page first.
            </div>
          ) : (
            <div className="sales-worker-grid">
              {workerDirectory.map((worker) => {
                const selected = selectedWorkerKeys.includes(worker.key);

                return (
                  <button
                    key={worker.key}
                    type="button"
                    className={`sales-worker-card ${selected ? "selected" : ""}`}
                    onClick={() => toggleWorker(worker.key)}
                  >
                    <Avatar
                      src={worker.photoDataUrl || getWorkerAvatar(worker.fullName)}
                      alt={worker.fullName}
                      zoom={worker.photoZoom}
                      x={worker.photoX}
                      y={worker.photoY}
                    />

                    <span>
                      <strong>{worker.fullName}</strong>
                      <small>{worker.roleCategory}</small>
                    </span>

                    <b>{selected ? "✓" : "+"}</b>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <div className="sales-button-row">
          <button type="button" className="sales-save-btn" onClick={saveSale}>
            {editingId ? "Update Sale" : "Save Sale"}
          </button>

          {editingId ? (
            <button type="button" className="sales-cancel-btn" onClick={resetForm}>
              Cancel
            </button>
          ) : null}
        </div>
      </section>

      <section className="sales-panel">
        <div className="sales-section-head">
          <div className="sales-title-row compact">
            <span className="sales-section-icon soft">
              <SalesIcon type="calendar" />
            </span>
            <div>
              <h3>Recent Sales</h3>
              <p>Search and manage saved crop sale records.</p>
            </div>
          </div>

          <button type="button" className="sales-text-btn" onClick={() => fetchSales()}>
            View all ›
          </button>
        </div>

        <div className="sales-search">
          <input
            type="text"
            placeholder="Search sales"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="sales-list">
          {filteredItems.length === 0 ? (
            <div className="sales-empty">
              {loading ? "Loading sales..." : "No sales found"}
            </div>
          ) : (
            filteredItems.slice(0, 12).map((item) => (
              <article key={item._id} className="sales-row">
                <span className="sales-row-icon">🌾</span>

                <div className="sales-row-main">
                  <strong>
                    {item.productName || "Sale"}
                    {item.isPendingSync ? " • Offline" : ""}
                  </strong>
                  <span>
                    {Number(item.quantity || 0).toLocaleString()} {item.unit || ""}
                    {item.totalWeightKg
                      ? ` • ${Number(item.totalWeightKg).toLocaleString()} kg`
                      : ""}
                  </span>
                  <small>{formatDate(item.saleDate || item.createdAt)}</small>

                  {Array.isArray(item.workerSplits) && item.workerSplits.length > 0 ? (
                    <div className="sales-row-workers">
                      {item.workerSplits.slice(0, 3).map((worker) => (
                        <em key={`${item._id}-${worker.workerName}`}>
                          {worker.workerName}
                        </em>
                      ))}
                      {item.workerSplits.length > 3 ? (
                        <em>+{item.workerSplits.length - 3}</em>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="sales-row-side">
                  <b>{money(item.totalAmount)}</b>
                  <small>Owner {money(item.ownerAmount || item.ownerIncomeAmount)}</small>

                  <div>
                    <button type="button" onClick={() => startEdit(item)}>
                      Edit
                    </button>

                    <button
                      type="button"
                      className="danger"
                      onClick={() => deleteSale(item)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <div className="sales-bottom-space" />
    </div>
  );
}    