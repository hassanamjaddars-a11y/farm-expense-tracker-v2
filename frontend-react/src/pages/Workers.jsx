import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import toast from "react-hot-toast";
import farmPremiumHeader from "../assets/farm-premium-header.png";
import { useAuth } from "../context/AuthContext";
import "../styles/workers.css";
import {
  attemptSyncPending,
  cacheWorkerCategories,
  cacheWorkers,
  getCachedWorkerCategories,
  getCachedWorkers,
  isOnlineNow,
  mergeWorkerCategoriesWithPending,
  mergeWorkersWithPending,
  queueWorkerCategoryOffline,
  queueWorkerOffline,
} from "../utils/offlineQueue";

const WORKER_PROFILES_STORAGE_KEY = "farm_worker_profiles_v2";
const WORKER_CATEGORY_ICONS_KEY = "farm_worker_category_icons_v1";
const WORKER_CATEGORY_IMAGES_KEY = "farm_worker_category_images_v1";
const WORKER_RETURNS_STORAGE_KEY = "farm_worker_returns_v1";
const WORKER_DELETED_PROFILES_STORAGE_KEY = "farm_worker_deleted_profiles_v1";

const getInitialWorkerItems = () => mergeWorkersWithPending(getCachedWorkers());
const getInitialWorkerCategories = () =>
  mergeWorkerCategoriesWithPending(getCachedWorkerCategories());

const defaultPaymentForm = {
  category: "",
  workerProfileId: "",
  workerName: "",
  amount: "",
  description: "",
};

const defaultProfileForm = {
  id: "",
  fullName: "",
  roleCategory: "",
  phone: "",
  note: "",
  photoDataUrl: "",
  photoZoom: 1,
  photoX: 0,
  photoY: 0,
};

const money = (value) => `PKR ${Number(value || 0).toLocaleString("en-PK")}`;

const signedMoney = (value) => {
  const num = Number(value || 0);
  const prefix = num >= 0 ? "+PKR" : "-PKR";
  return `${prefix} ${Math.abs(num).toLocaleString("en-PK")}`;
};

const readWorkerCategoryIcons = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(WORKER_CATEGORY_ICONS_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    console.error("Worker category icon read error:", error);
    return {};
  }
};

const writeWorkerCategoryIcons = (icons) => {
  try {
    localStorage.setItem(WORKER_CATEGORY_ICONS_KEY, JSON.stringify(icons || {}));
  } catch (error) {
    console.error("Worker category icon write error:", error);
  }
};

const readWorkerCategoryImages = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(WORKER_CATEGORY_IMAGES_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    console.error("Worker category image read error:", error);
    return {};
  }
};

const writeWorkerCategoryImages = (images) => {
  try {
    localStorage.setItem(WORKER_CATEGORY_IMAGES_KEY, JSON.stringify(images || {}));
  } catch (error) {
    console.error("Worker category image write error:", error);
  }
};

const getWorkerCategoryIconType = (name = "") => {
  const value = String(name).toLowerCase();
  if (value.includes("ship") || value.includes("boat")) return "ship";
  if (value.includes("mechanic") || value.includes("repair") || value.includes("wrench")) return "wrench";
  if (value.includes("manager") || value.includes("supervisor")) return "manager";
  return "people";
};

function WorkerPremiumIcon({ type, custom }) {
  if (custom) {
    return <span className="worker-custom-emoji-icon">{custom}</span>;
  }

  return (
    <svg viewBox="0 0 24 24" className="worker-premium-svg" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {type === "logo" && (
        <>
          <path d="M12 20V5" />
          <path d="M12 12C8.4 12 5.7 9.7 4.7 6.5c3.8 0 6.3 2 7.3 5.5Z" fill="currentColor" stroke="none" />
          <path d="M12 16.7c-3.8-.1-6.6-2.3-7.8-5.5 3.9.1 6.8 2.2 7.8 5.5Z" fill="currentColor" stroke="none" opacity=".88" />
          <path d="M12.2 9.8c3.2-2 6.6-2 9.1-.1-3.2 1.9-6.5 1.9-9.1.1Z" fill="currentColor" stroke="none" opacity=".9" />
        </>
      )}
      {type === "settings" && (
        <>
          <path d="M12 15.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8Z" />
          <path d="M18.8 13.4c.1-.5.2-.9.2-1.4s-.1-.9-.2-1.4l2-1.5-2-3.4-2.4 1a8 8 0 0 0-2.4-1.4L13.6 2h-3.2L10 5.3a8 8 0 0 0-2.4 1.4l-2.4-1-2 3.4 2 1.5C5.1 11.1 5 11.5 5 12s.1.9.2 1.4l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 2.4 1.4l.4 3.3h3.2l.4-3.3a8 8 0 0 0 2.4-1.4l2.4 1 2-3.4-2-1.5Z" />
        </>
      )}
      {type === "people" && (
        <>
          <path d="M8.7 11.2a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8Z" />
          <path d="M3.2 20a5.6 5.6 0 0 1 11.1 0" />
          <path d="M16.4 10.8a3 3 0 1 0-1.1-5.7" />
          <path d="M17 13.7a5.1 5.1 0 0 1 3.8 4.9" />
        </>
      )}
      {type === "wallet" && (
        <>
          <path d="M4.8 7.2h14.4A2.8 2.8 0 0 1 22 10v7.2a2.8 2.8 0 0 1-2.8 2.8H4.8A2.8 2.8 0 0 1 2 17.2V10a2.8 2.8 0 0 1 2.8-2.8Z" />
          <path d="M16 11h6v4h-6a2 2 0 1 1 0-4Z" />
          <path d="M5.4 7.2 14.5 4a2 2 0 0 1 2.6 1.2l.6 2" />
        </>
      )}
      {type === "pie" && (
        <>
          <path d="M12 3v9h9" />
          <path d="M19.8 14.9A8.3 8.3 0 1 1 9.1 4.2" />
          <path d="M14 3.3a8.3 8.3 0 0 1 6.7 6.7H14Z" />
        </>
      )}
      {type === "document" && (
        <>
          <path d="M7 3.5h7l4 4V20.5H7Z" />
          <path d="M14 3.5V8h4" />
          <path d="M9.5 12h5" />
          <path d="M9.5 15.5h6" />
        </>
      )}
      {type === "grid" && (
        <>
          <rect x="4" y="4" width="6" height="6" rx="1.2" />
          <rect x="14" y="4" width="6" height="6" rx="1.2" />
          <rect x="4" y="14" width="6" height="6" rx="1.2" />
          <rect x="14" y="14" width="6" height="6" rx="1.2" />
        </>
      )}
      {type === "workerAdd" && (
        <>
          <path d="M9 11a3.4 3.4 0 1 0 0-6.8A3.4 3.4 0 0 0 9 11Z" />
          <path d="M3.5 20a5.5 5.5 0 0 1 8.5-4.6" />
          <path d="M17.5 12.5v7" />
          <path d="M14 16h7" />
        </>
      )}
      {type === "usersAdd" && (
        <>
          <path d="M8.4 10.8a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2Z" />
          <path d="M3.6 19a5 5 0 0 1 8.4-3.7" />
          <path d="M15.3 9.9a2.8 2.8 0 1 0-1-5.3" />
          <path d="M16.2 13a5 5 0 0 1 1.2.8" />
          <path d="M18.5 14.5v6" />
          <path d="M15.5 17.5h6" />
        </>
      )}
      {type === "ship" && (
        <>
          <path d="M4 14.5h16l-2.6 5H6.6Z" />
          <path d="M7 14.5V9h8v5.5" />
          <path d="M10 9V5h4l2 4" />
          <path d="M5 20.5c1.2.8 2.4.8 3.6 0 1.2.8 2.4.8 3.6 0 1.2.8 2.4.8 3.6 0 1.2.8 2.4.8 3.6 0" />
        </>
      )}
      {type === "wrench" && (
        <>
          <path d="M14.7 5.4a4.5 4.5 0 0 0 5.2 5.2L10.7 19.8a2.6 2.6 0 0 1-3.7-3.7Z" />
          <path d="M7.4 16.8 9.2 18.6" />
        </>
      )}
      {type === "manager" && (
        <>
          <path d="M12 10.7a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2Z" />
          <path d="M5 20a7 7 0 0 1 14 0" />
          <path d="M9.2 14.2 12 17l2.8-2.8" />
        </>
      )}
    </svg>
  );
}

const normalizeName = (value = "") =>
  String(value).trim().replace(/\s+/g, " ").toLowerCase();

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
    const safeProfiles = Array.isArray(parsed) ? parsed : [];

    return safeProfiles.map((profile) => ({
      ...profile,
      photoZoom: clampZoom(profile?.photoZoom),
      photoX: safeNumber(profile?.photoX, 0),
      photoY: safeNumber(profile?.photoY, 0),
    }));
  } catch (error) {
    console.error("Worker profiles local read error:", error);
    return [];
  }
};

const readLegacyWorkerProfilesForRecovery = () => {
  try {
    const originals = window.__farmStorageOriginalsV2;
    const raw = originals?.getItem
      ? originals.getItem(WORKER_PROFILES_STORAGE_KEY)
      : null;

    if (!raw) return [];

    const parsed = JSON.parse(raw || "[]");
    const safeProfiles = Array.isArray(parsed) ? parsed : [];

    return safeProfiles.map((profile) => ({
      ...profile,
      photoZoom: clampZoom(profile?.photoZoom),
      photoX: safeNumber(profile?.photoX, 0),
      photoY: safeNumber(profile?.photoY, 0),
      recoveredFromLegacyStorage: true,
    }));
  } catch (error) {
    console.error("Worker legacy profile recovery error:", error);
    return [];
  }
};

const writeWorkerProfiles = (profiles) => {
  localStorage.setItem(WORKER_PROFILES_STORAGE_KEY, JSON.stringify(profiles));
};


const getWorkerReturnsStorageKey = (user) => {
  const rawKey =
    user?._id ||
    user?.id ||
    user?.email ||
    user?.name ||
    "guest";

  return `${WORKER_RETURNS_STORAGE_KEY}:${String(rawKey)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@._-]+/g, "-")}`;
};

const readWorkerReturns = (storageKey) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Worker returns local read error:", error);
    return [];
  }
};

const writeWorkerReturns = (storageKey, returns) => {
  localStorage.setItem(storageKey, JSON.stringify(returns || []));
};

const getDeletedWorkerProfilesStorageKey = (user) => {
  const rawKey =
    user?._id ||
    user?.id ||
    user?.email ||
    user?.name ||
    "guest";

  return `${WORKER_DELETED_PROFILES_STORAGE_KEY}:${String(rawKey)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@._-]+/g, "-")}`;
};

const readDeletedWorkerProfiles = (storageKey) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Deleted worker profile read error:", error);
    return [];
  }
};

const writeDeletedWorkerProfiles = (storageKey, items) => {
  localStorage.setItem(storageKey, JSON.stringify(items || []));
};

const getDeletedWorkerProfileKey = (profile = {}) =>
  normalizeName(profile?.fullName || profile?.workerName || profile?.name || "");

const isWorkerProfileDeleted = (profile = {}, deletedProfiles = []) => {
  const profileId = String(profile?.id || profile?.workerProfileId || "").trim();
  const profileKey = getDeletedWorkerProfileKey(profile);

  return deletedProfiles.some((item) => {
    const deletedId = String(item?.id || item?.workerProfileId || "").trim();
    const deletedKey = getDeletedWorkerProfileKey(item);

    return (profileId && deletedId && profileId === deletedId) ||
      (profileKey && deletedKey && profileKey === deletedKey);
  });
};


const createProfileId = () =>
  `worker-profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createPaymentClientId = () =>
  `worker-payment-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const buildRecoveredProfilesFromWorkerPayments = (
  workerItems = [],
  currentProfiles = [],
  deletedProfiles = []
) => {
  const existingNames = new Set(
    currentProfiles.map((profile) => normalizeName(profile?.fullName)).filter(Boolean)
  );
  const deletedNames = new Set(
    deletedProfiles
      .map((profile) => getDeletedWorkerProfileKey(profile))
      .filter(Boolean)
  );
  const deletedIds = new Set(
    deletedProfiles
      .map((profile) => String(profile?.id || profile?.workerProfileId || "").trim())
      .filter(Boolean)
  );

  const legacyProfiles = readLegacyWorkerProfilesForRecovery();
  const legacyProfileMap = new Map();

  legacyProfiles.forEach((profile) => {
    const key = normalizeName(profile?.fullName);
    if (key && !legacyProfileMap.has(key)) {
      legacyProfileMap.set(key, profile);
    }
  });

  const recoveredByName = new Map();

  workerItems.forEach((item) => {
    const name = String(item?.workerName || "").trim();
    const key = normalizeName(name);

    if (!name || !key || existingNames.has(key) || recoveredByName.has(key)) {
      return;
    }

    if (deletedNames.has(key)) {
      return;
    }

    const legacyProfile = legacyProfileMap.get(key);

    if (legacyProfile?.id && deletedIds.has(String(legacyProfile.id).trim())) {
      return;
    }

    const categoryName = item?.category?.name || item?.categoryName || "General Worker";
    const recordDate = item?.createdAt || item?.paymentDate || item?.date || "";

    recoveredByName.set(key, {
      id:
        legacyProfile?.id ||
        `worker-profile-recovered-${key.replace(/[^a-z0-9]+/g, "-") || Date.now()}`,
      fullName: legacyProfile?.fullName || name,
      roleCategory: legacyProfile?.roleCategory || categoryName,
      phone: legacyProfile?.phone || "",
      note:
        legacyProfile?.note ||
        "Recovered automatically from saved worker payment history.",
      photoDataUrl: legacyProfile?.photoDataUrl || "",
      photoZoom: clampZoom(legacyProfile?.photoZoom),
      photoX: safeNumber(legacyProfile?.photoX, 0),
      photoY: safeNumber(legacyProfile?.photoY, 0),
      createdAt: legacyProfile?.createdAt || recordDate || "1970-01-01T00:00:00.000Z",
      updatedAt: new Date().toISOString(),
      recoveredFromPayments: !legacyProfile,
      recoveredFromLegacyStorage: !!legacyProfile,
    });
  });

  return [...recoveredByName.values()];
};

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const getSeed = (value = "") =>
  String(value)
    .split("")
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);

const pick = (arr, seed) => arr[seed % arr.length];

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

const resolveCategoryIdFromName = (categories, name) => {
  if (!name) return "";
  const found = categories.find(
    (item) => normalizeName(item?.name) === normalizeName(name)
  );
  return found?._id || "";
};

const formatDateTime = (value) => {
  if (!value) return "No date";
  return new Date(value).toLocaleString();
};

const formatShortDate = (value) => {
  if (!value) return "No date";

  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const sortNewestFirst = (a, b) =>
  new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime();

const getBestCameraStream = async (preferredFacingMode = "user") => {
  const oppositeFacingMode =
    preferredFacingMode === "environment" ? "user" : "environment";

  const cameraTries = [
    {
      audio: false,
      video: {
        facingMode: { ideal: preferredFacingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    },
    {
      audio: false,
      video: {
        facingMode: preferredFacingMode,
      },
    },
    {
      audio: false,
      video: {
        facingMode: { ideal: oppositeFacingMode },
      },
    },
    {
      audio: false,
      video: {
        facingMode: oppositeFacingMode,
      },
    },
    {
      audio: false,
      video: true,
    },
  ];

  let lastError = null;

  for (const constraints of cameraTries) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      lastError = error;

      if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
        throw error;
      }
    }
  }

  throw lastError || new Error("No camera found");
};

const Avatar = ({ src, alt, zoom = 1, x = 0, y = 0, size = "md" }) => (
  <div className={`worker-avatar worker-avatar--${size}`}>
    <img
      className="worker-avatar-image"
      src={src}
      alt={alt}
      style={{
        transform: `translate(${safeNumber(x, 0)}px, ${safeNumber(y, 0)}px) scale(${clampZoom(
          zoom
        )})`,
      }}
    />
  </div>
);

const InputCard = ({ icon, label, children, wide = false }) => (
  <label className={`worker-input-card ${wide ? "worker-input-card--wide" : ""}`}>
    <span className="worker-small-icon">{icon}</span>
    <span className="worker-input-content">
      <small>{label}</small>
      {children}
    </span>
  </label>
);

function FarmPremiumLogoMark({ className = "" }) {
  return (
    <span className={`farm-premium-logo-mark ${className}`} aria-hidden="true">
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

export default function Workers() {
  const navigate = useNavigate();
  const settingsMenuRef = useRef(null);
  const { user, logout } = useAuth();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workers, setWorkers] = useState(getInitialWorkerItems);
  const [categories, setCategories] = useState(getInitialWorkerCategories);
  const [salesItems, setSalesItems] = useState([]);
  const [profiles, setProfiles] = useState(() => readWorkerProfiles());

  const deletedProfilesStorageKey = useMemo(() => getDeletedWorkerProfilesStorageKey(user), [
    user?._id,
    user?.id,
    user?.email,
    user?.name,
  ]);
  const [deletedProfiles, setDeletedProfiles] = useState(() =>
    readDeletedWorkerProfiles(getDeletedWorkerProfilesStorageKey(user))
  );

  const [form, setForm] = useState(defaultPaymentForm);
  const [profileForm, setProfileForm] = useState(defaultProfileForm);

  const [newCategory, setNewCategory] = useState("");
  const [recordSearch, setRecordSearch] = useState("");
  const [workerSearch, setWorkerSearch] = useState("");
  const [workerFilter, setWorkerFilter] = useState("all");
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(
    () =>
      getInitialWorkerItems().length === 0 &&
      getInitialWorkerCategories().length === 0
  );
  const [profileUploading, setProfileUploading] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [showAllPayments, setShowAllPayments] = useState(false);
  const [showAllProfiles, setShowAllProfiles] = useState(false);
  const [activePanel, setActivePanel] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [cameraFacingMode, setCameraFacingMode] = useState("user");
  const [categoryIcons, setCategoryIcons] = useState(() => readWorkerCategoryIcons());
  const [categoryImages, setCategoryImages] = useState(() => readWorkerCategoryImages());
  const [showAllWorkerCategories, setShowAllWorkerCategories] = useState(false);
  const workerReturnsStorageKey = useMemo(() => getWorkerReturnsStorageKey(user), [
    user?._id,
    user?.id,
    user?.email,
    user?.name,
  ]);
  const [workerReturns, setWorkerReturns] = useState(() =>
    readWorkerReturns(getWorkerReturnsStorageKey(user))
  );
  const [returnAmount, setReturnAmount] = useState("");
  const [showAllPaymentProfiles, setShowAllPaymentProfiles] = useState(false);

  const pageTopRef = useRef(null);
  const uploadInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const photoDragRef = useRef(null);
  const paymentSaveLockRef = useRef(false);
  const profileSaveLockRef = useRef(false);
  const paymentClientIdRef = useRef("");

  useEffect(() => {
    setWorkerReturns(readWorkerReturns(workerReturnsStorageKey));
  }, [workerReturnsStorageKey]);

  const persistWorkerReturns = (nextReturns) => {
    setWorkerReturns(nextReturns);
    writeWorkerReturns(workerReturnsStorageKey, nextReturns);
  };

  const persistProfiles = (nextProfiles) => {
    const safeProfiles = nextProfiles.map((item) => ({
      ...item,
      photoZoom: clampZoom(item?.photoZoom),
      photoX: safeNumber(item?.photoX, 0),
      photoY: safeNumber(item?.photoY, 0),
    }));
    setProfiles(safeProfiles);
    writeWorkerProfiles(safeProfiles);
  };

  const persistDeletedProfiles = (nextDeletedProfiles) => {
    const uniqueMap = new Map();

    nextDeletedProfiles.forEach((item) => {
      const id = String(item?.id || item?.workerProfileId || "").trim();
      const key = getDeletedWorkerProfileKey(item);
      const mapKey = id || key;

      if (mapKey) {
        uniqueMap.set(mapKey, {
          ...item,
          id,
          fullName: item?.fullName || item?.workerName || item?.name || "",
          key,
        });
      }
    });

    const safeDeletedProfiles = [...uniqueMap.values()];
    setDeletedProfiles(safeDeletedProfiles);
    writeDeletedWorkerProfiles(deletedProfilesStorageKey, safeDeletedProfiles);
  };

  useEffect(() => {
    setDeletedProfiles(readDeletedWorkerProfiles(deletedProfilesStorageKey));
  }, [deletedProfilesStorageKey]);

  useEffect(() => {
    if (!workers.length) return;

    const recoveredProfiles = buildRecoveredProfilesFromWorkerPayments(
      workers,
      profiles,
      deletedProfiles
    );

    if (!recoveredProfiles.length) return;

    persistProfiles([...profiles, ...recoveredProfiles]);

    toast.success(
      recoveredProfiles.length === 1
        ? "Recovered 1 worker profile"
        : `Recovered ${recoveredProfiles.length} worker profiles`
    );
  }, [workers, profiles, deletedProfiles]);

  const refreshLocalState = () => {
    setWorkers(mergeWorkersWithPending(getCachedWorkers()));
    setCategories(mergeWorkerCategoriesWithPending(getCachedWorkerCategories()));
  };

  const fetchData = async () => {
    try {
      await attemptSyncPending(api);

      const [w, c, salesRes] = await Promise.all([
        api.get("/workers"),
        api.get("/worker-categories"),
        api.get("/sales").catch(() => ({ data: { items: [] } })),
      ]);

      const serverWorkers = w.data || [];
      const serverCategories = c.data || [];

      cacheWorkers(serverWorkers);
      cacheWorkerCategories(serverCategories);

      setWorkers(mergeWorkersWithPending(serverWorkers));
      setCategories(mergeWorkerCategoriesWithPending(serverCategories));
      setSalesItems(Array.isArray(salesRes?.data?.items) ? salesRes.data.items : []);
    } catch (err) {
      console.error("Worker fetch error:", err);
      refreshLocalState();
    } finally {
      setLoading(false);
    }
  };

  const stopCamera = () => {
    const stream = cameraStreamRef.current;

    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    cameraStreamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraOpen(false);
  };

  useEffect(() => {
    fetchData();

    const handleOnline = () => {
      fetchData();
    };

    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("online", handleOnline);

      const stream = cameraStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const initials =
    user?.name
      ?.split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "FT";

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

  const handleLogout = () => {
    setSettingsOpen(false);
    logout();
    navigate("/login");
  };

  useEffect(() => {
    if (!cameraOpen || !videoRef.current || !cameraStreamRef.current) return;

    videoRef.current.srcObject = cameraStreamRef.current;
    videoRef.current.play().catch((error) => {
      console.error("Camera video play error:", error);
    });
  }, [cameraOpen]);

  const startCamera = async (preferredFacingMode = cameraFacingMode) => {
    setCameraError("");

    const isLocalhost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    if (!window.isSecureContext && !isLocalhost) {
      const message =
        "Camera needs HTTPS. It should work on localhost or after deployment on Netlify HTTPS.";
      setCameraError(message);
      toast.error(message);
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const message = "Camera is not supported in this browser. Please use upload photo.";
      setCameraError(message);
      toast.error(message);
      return;
    }

    try {
      stopCamera();

      const stream = await getBestCameraStream(preferredFacingMode);

      cameraStreamRef.current = stream;
      setCameraFacingMode(preferredFacingMode);
      setCameraOpen(true);

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch((error) => {
            console.error("Camera play error:", error);
          });
        }
      }, 100);

      toast.success(
        preferredFacingMode === "environment"
          ? "Back camera opened"
          : "Front camera opened"
      );
    } catch (error) {
      console.error("Camera open error:", error);

      let message = "Camera could not open. Please check camera permission.";

      if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
        message =
          "Camera permission is blocked. Please allow camera permission from browser site settings.";
      } else if (
        error?.name === "NotFoundError" ||
        error?.name === "DevicesNotFoundError"
      ) {
        message = "No camera was found on this device.";
      } else if (error?.name === "NotReadableError") {
        message = "Camera is already being used by another app.";
      } else if (error?.name === "OverconstrainedError") {
        message = "This camera mode is not available on this device.";
      }

      setCameraError(message);
      toast.error(message);
    }
  };

  const captureCameraPhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      toast.error("Camera is not ready yet");
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      toast.error("Could not capture photo");
      return;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

    setProfileForm((prev) => ({
      ...prev,
      photoDataUrl: dataUrl,
      photoZoom: 1,
      photoX: 0,
      photoY: 0,
    }));

    stopCamera();
    toast.success("Photo captured");
  };

  const toggleCameraFacingMode = async () => {
    const nextFacingMode =
      cameraFacingMode === "environment" ? "user" : "environment";

    await startCamera(nextFacingMode);
  };

  const beginPhotoDrag = (event) => {
    if (!profileForm.photoDataUrl) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    photoDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originalX: safeNumber(profileForm.photoX, 0),
      originalY: safeNumber(profileForm.photoY, 0),
    };
  };

  const movePhotoDrag = (event) => {
    const drag = photoDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    event.preventDefault();

    const nextX = Math.round(drag.originalX + (event.clientX - drag.startX));
    const nextY = Math.round(drag.originalY + (event.clientY - drag.startY));

    setProfileForm((prev) => ({
      ...prev,
      photoX: nextX,
      photoY: nextY,
    }));
  };

  const endPhotoDrag = (event) => {
    const drag = photoDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    photoDragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const resetPhotoPosition = () => {
    setProfileForm((prev) => ({
      ...prev,
      photoZoom: 1,
      photoX: 0,
      photoY: 0,
    }));
  };

  const getRecordDateMs = (record) => {
    const rawDate =
      record?.createdAt ||
      record?.updatedAt ||
      record?.paymentDate ||
      record?.saleDate ||
      record?.transactionDate ||
      "";

    const time = rawDate ? new Date(rawDate).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
  };

  const recordBelongsToProfile = (record, profile, nameField = "workerName") => {
    if (!record || !profile?.id) return false;

    const recordProfileId = String(record?.workerProfileId || "").trim();
    if (recordProfileId) {
      return recordProfileId === String(profile.id);
    }

    const recordName = normalizeName(record?.[nameField]);
    const profileName = normalizeName(profile.fullName);

    if (!recordName || !profileName || recordName !== profileName) {
      return false;
    }

    // Legacy records did not have workerProfileId. To stop old payments/sales
    // from attaching to a newly-created worker with the same name, only attach
    // legacy records that were created after this profile was created.
    const profileCreatedAt = new Date(profile?.createdAt || 0).getTime();
    const recordCreatedAt = getRecordDateMs(record);

    if (!profileCreatedAt || !recordCreatedAt) return false;

    return recordCreatedAt >= profileCreatedAt - 60_000;
  };

  const profileDirectory = useMemo(() => {
    return profiles
      .filter((profile) => !isWorkerProfileDeleted(profile, deletedProfiles))
      .map((profile) => {
        const matchingPayments = workers.filter((item) =>
          recordBelongsToProfile(item, profile, "workerName")
        );

        const totalPaid = matchingPayments.reduce(
          (sum, item) => sum + Number(item.amount || 0),
          0
        );

        const latestPayment = matchingPayments
          .slice()
          .sort(sortNewestFirst)[0];

        const matchingReturns = workerReturns.filter((item) =>
          recordBelongsToProfile(item, profile, "workerName")
        );

        const totalReturned = matchingReturns.reduce(
          (sum, item) => sum + Number(item.amount || 0),
          0
        );

        let profitShare = 0;

        salesItems.forEach((sale) => {
          const splits = Array.isArray(sale?.workerSplits) ? sale.workerSplits : [];

          splits.forEach((split) => {
            const splitWithSaleDate = {
              ...split,
              createdAt: sale?.createdAt || sale?.saleDate || sale?.updatedAt,
            };

            if (recordBelongsToProfile(splitWithSaleDate, profile, "workerName")) {
              profitShare += Number(split?.amount || 0);
            }
          });
        });

        const outstandingBalance = Math.max(0, totalPaid - totalReturned);
        const availableProfit = Math.max(0, profitShare - outstandingBalance);
        const netBalance = outstandingBalance > 0 ? -outstandingBalance : availableProfit;
        const status =
          outstandingBalance > 0 ? "loss" : availableProfit > 0 ? "profit" : "settled";

        return {
          ...profile,
          key: normalizeName(profile.fullName),
          photoZoom: clampZoom(profile?.photoZoom),
          photoX: safeNumber(profile?.photoX, 0),
          photoY: safeNumber(profile?.photoY, 0),
          roleCategory: profile.roleCategory || "General Worker",
          totalPaid,
          paymentCount: matchingPayments.length,
          latestPaymentAt: latestPayment?.createdAt || latestPayment?.paymentDate || "",
          profitShare,
          totalReturned,
          outstandingBalance,
          availableProfit,
          returnCount: matchingReturns.length,
          netBalance,
          status,
        };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [profiles, workers, salesItems, workerReturns, deletedProfiles]);

  const workerProfileMap = useMemo(() => {
    const map = new Map();
    profileDirectory.forEach((profile) => {
      map.set(normalizeName(profile.fullName), profile);
    });
    return map;
  }, [profileDirectory]);

  const searchedProfiles = useMemo(() => {
    const q = workerSearch.trim().toLowerCase();
    if (!q) return profileDirectory;

    return profileDirectory.filter((item) => {
      const fullName = String(item.fullName || "").toLowerCase();
      const roleCategory = String(item.roleCategory || "").toLowerCase();
      const phone = String(item.phone || "").toLowerCase();
      const note = String(item.note || "").toLowerCase();

      return (
        fullName.includes(q) ||
        roleCategory.includes(q) ||
        phone.includes(q) ||
        note.includes(q)
      );
    });
  }, [profileDirectory, workerSearch]);

  const filteredProfiles = useMemo(() => {
    return searchedProfiles.filter((item) => {
      if (workerFilter === "profit") return Number(item.netBalance || 0) > 0;
      if (workerFilter === "loss") return Number(item.netBalance || 0) < 0;
      if (workerFilter === "settled") return Number(item.netBalance || 0) === 0;
      return true;
    });
  }, [searchedProfiles, workerFilter]);

  useEffect(() => {
    if (!profileDirectory.length) {
      setSelectedProfileId("");
      return;
    }

    const stillExists = profileDirectory.some((item) => item.id === selectedProfileId);
    if (!stillExists) {
      setSelectedProfileId(profileDirectory[0].id);
    }
  }, [profileDirectory, selectedProfileId]);

  const selectedProfile =
    profileDirectory.find((item) => item.id === selectedProfileId) || null;

  const selectedWorkerPayments = useMemo(() => {
    if (!selectedProfile) return [];

    return workers
      .filter((item) => recordBelongsToProfile(item, selectedProfile, "workerName"))
      .sort(sortNewestFirst);
  }, [workers, selectedProfile]);

  const selectedPaymentProfile = useMemo(() => {
    const selectedById = profileDirectory.find(
      (profile) => String(profile.id) === String(form.workerProfileId || "")
    );

    if (selectedById) return selectedById;

    return (
      profileDirectory.find(
        (profile) => normalizeName(profile.fullName) === normalizeName(form.workerName)
      ) || null
    );
  }, [profileDirectory, form.workerProfileId, form.workerName]);

  const filteredWorkers = useMemo(() => {
    const q = recordSearch.trim().toLowerCase();
    if (!q) return workers.slice().sort(sortNewestFirst);

    return workers
      .filter((item) => {
        const workerName = item.workerName?.toLowerCase() || "";
        const description = item.description?.toLowerCase() || "";
        const category = item.category?.name?.toLowerCase() || "";
        const amount = String(item.amount || "");
        const date = formatDateTime(item.createdAt).toLowerCase();

        return (
          workerName.includes(q) ||
          description.includes(q) ||
          category.includes(q) ||
          amount.includes(q) ||
          date.includes(q)
        );
      })
      .sort(sortNewestFirst);
  }, [workers, recordSearch]);

  const totalWorkerAmount = useMemo(
    () => workers.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [workers]
  );

  const totalEarnedShare = useMemo(
    () =>
      profileDirectory.reduce(
        (sum, item) => sum + Number(item?.profitShare || 0),
        0
      ),
    [profileDirectory]
  );

  const totalWorkerReturned = useMemo(
    () =>
      profileDirectory.reduce(
        (sum, item) => sum + Number(item?.totalReturned || 0),
        0
      ),
    [profileDirectory]
  );

  const workerBalanceDue = Math.max(0, totalWorkerAmount - totalWorkerReturned);
  const workerCategoryCount = categories.length;

  const workerCategoryChips = useMemo(() => {
    const preferredOrder = ["ship", "mechanics", "workers", "manager"];
    const fallback = preferredOrder.map((name) => ({ _id: `default-${name}`, name }));
    const source = categories.length > 0 ? categories : fallback;

    return [...source].sort((a, b) => {
      const aName = normalizeName(a?.name);
      const bName = normalizeName(b?.name);
      const aIndex = preferredOrder.findIndex((item) => aName.includes(item));
      const bIndex = preferredOrder.findIndex((item) => bName.includes(item));

      if (aIndex !== -1 || bIndex !== -1) {
        return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
      }

      return String(a?.name || "").localeCompare(String(b?.name || ""));
    });
  }, [categories]);

  const setWorkerCategoryIcon = (categoryName) => {
    const currentIcon = categoryIcons[categoryName] || "";
    const nextIcon = window.prompt(
      `Set icon/emoji for ${categoryName}. Leave empty to use default icon.`,
      currentIcon
    );

    if (nextIcon === null) return;

    setCategoryIcons((prev) => {
      const updated = { ...prev };

      if (nextIcon.trim()) {
        updated[categoryName] = nextIcon.trim().slice(0, 4);
      } else {
        delete updated[categoryName];
      }

      writeWorkerCategoryIcons(updated);
      return updated;
    });
  };



  const handleWorkerCategoryImagePick = async (categoryName, file) => {
    if (!file) return;

    try {
      const dataUrl = await fileToDataUrl(file);
      const updated = {
        ...categoryImages,
        [normalizeName(categoryName)]: dataUrl,
      };

      setCategoryImages(updated);
      writeWorkerCategoryImages(updated);
      toast.success("Worker category image updated");
    } catch (error) {
      console.error("Worker category image error:", error);
      toast.error("Could not load category image");
    }
  };
  const visibleProfiles = showAllProfiles ? filteredProfiles : filteredProfiles.slice(0, 4);
  const visiblePaymentProfiles = showAllPaymentProfiles
    ? profileDirectory
    : profileDirectory.slice(0, 5);
  const visiblePayments = showAllPayments ? filteredWorkers : filteredWorkers.slice(0, 5);
  const visibleWorkerCategoryChips = showAllWorkerCategories
    ? workerCategoryChips
    : workerCategoryChips.slice(0, 4);

  const scrollToTop = () => {
    pageTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openPanel = (panel) => {
    setActivePanel(panel);
  };

  const closePanel = () => {
    stopCamera();
    paymentClientIdRef.current = "";
    paymentSaveLockRef.current = false;
    profileSaveLockRef.current = false;
    setSavingPayment(false);
    setSavingProfile(false);
    setActivePanel("");
    setEditing(null);
    setForm(defaultPaymentForm);
    setReturnAmount("");
    setShowAllPaymentProfiles(false);
    setProfileForm(defaultProfileForm);
  };

  const pickProfileForPayment = (profile) => {
    const matchedCategoryId =
      form.category || resolveCategoryIdFromName(categories, profile.roleCategory);

    setForm((prev) => ({
      ...prev,
      workerProfileId: profile.id,
      workerName: profile.fullName,
      category: matchedCategoryId || prev.category,
    }));

    openPanel("payment");
  };

  const openWorkerDetails = (profile) => {
    setSelectedProfileId(profile.id);
    openPanel("details");
  };

  const handleWorkerNameChange = (value) => {
    const matchedProfile = profileDirectory.find(
      (item) => normalizeName(item.fullName) === normalizeName(value)
    );

    setForm((prev) => ({
      ...prev,
      workerName: value,
      workerProfileId: matchedProfile?.id || "",
      category:
        prev.category ||
        resolveCategoryIdFromName(categories, matchedProfile?.roleCategory || ""),
    }));
  };

  const ensureProfileExists = (workerName, selectedCategoryName = "") => {
    const key = normalizeName(workerName);
    if (!key) return;

    if (deletedProfiles.some((item) => getDeletedWorkerProfileKey(item) === key)) {
      return;
    }

    const alreadyExists = profiles.find(
      (profile) => normalizeName(profile.fullName) === key
    );
    if (alreadyExists) return;

    const newProfile = {
      id: createProfileId(),
      fullName: workerName,
      roleCategory: selectedCategoryName || "General Worker",
      phone: "",
      note: "",
      photoDataUrl: "",
      photoZoom: 1,
      photoX: 0,
      photoY: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    persistProfiles([newProfile, ...profiles]);
  };

  const savePayment = async () => {
    if (paymentSaveLockRef.current || savingPayment) {
      return;
    }

    if (!form.category) {
      toast.error("Please select a category");
      return;
    }

    if (!form.workerName.trim()) {
      toast.error("Please enter worker name");
      return;
    }

    if (!form.amount || Number(form.amount) <= 0) {
      toast.error("Please enter valid amount");
      return;
    }

    const selectedCategory = categories.find((c) => c._id === form.category);

    if (!selectedCategory) {
      toast.error("Selected category was not found. Please choose it again.");
      return;
    }

    paymentSaveLockRef.current = true;
    setSavingPayment(true);

    const cleanWorkerName = form.workerName.trim();
    const matchedProfile = profileDirectory.find(
      (profile) => normalizeName(profile.fullName) === normalizeName(cleanWorkerName)
    );
    const cleanWorkerProfileId = String(
      form.workerProfileId || matchedProfile?.id || ""
    ).trim();

    if (!editing && !paymentClientIdRef.current) {
      paymentClientIdRef.current = createPaymentClientId();
    }

    const payload = {
      clientId: editing ? undefined : paymentClientIdRef.current,
      category: form.category,
      workerProfileId: cleanWorkerProfileId,
      workerName: cleanWorkerName,
      amount: Number(form.amount),
      description: form.description.trim(),
      categoryName: selectedCategory.name || "",
      categoryClientId: selectedCategory.clientId || "",
    };

    const hasPendingCategory =
      !!selectedCategory?.isPendingSync ||
      String(payload.category || "").startsWith("local-");

    try {
      if (editing) {
        if (!isOnlineNow()) {
          toast.error("Offline edit for synced worker payment is not available");
          return;
        }

        await api.put(`/workers/${editing}`, payload);
        toast.success("Worker payment updated");
      } else {
        if (!isOnlineNow()) {
          queueWorkerOffline({
            clientId: payload.clientId,
            workerProfileId: payload.workerProfileId,
            workerName: payload.workerName,
            amount: payload.amount,
            description: payload.description,
            categoryId: payload.category,
            categoryName: selectedCategory?.name || "Uncategorized",
            categoryClientId: selectedCategory?.clientId || null,
          });

          toast.success("Worker payment saved offline and will sync automatically");
        } else {
          try {
            await api.post("/workers", payload);
            toast.success("Worker payment added");
          } catch (err) {
            if (!err?.response) {
              queueWorkerOffline({
                clientId: payload.clientId,
                workerProfileId: payload.workerProfileId,
                workerName: payload.workerName,
                amount: payload.amount,
                description: payload.description,
                categoryId: payload.category,
                categoryName: selectedCategory?.name || "Uncategorized",
                categoryClientId: selectedCategory?.clientId || null,
              });

              toast.success(
                hasPendingCategory
                  ? "Worker payment saved locally. It will sync after category sync"
                  : "Internet weak. Worker payment saved offline for sync"
              );
            } else {
              throw err;
            }
          }
        }
      }

      paymentClientIdRef.current = "";
      setForm(defaultPaymentForm);
      setNewCategory("");
      setEditing(null);
      setActivePanel("");

      await fetchData();
    } catch (err) {
      console.error("Worker save error:", err);
      toast.error(err?.response?.data?.error || "Error saving worker payment");
    } finally {
      paymentSaveLockRef.current = false;
      setSavingPayment(false);
    }
  };

  const addCategory = async () => {
    const cleanName = newCategory.trim();

    if (!cleanName) {
      toast.error("Enter category name");
      return;
    }

    const existing = categories.find(
      (item) =>
        String(item?.name || "").trim().toLowerCase() === cleanName.toLowerCase()
    );

    if (existing) {
      setForm((prev) => ({ ...prev, category: existing._id }));
      setNewCategory("");
      toast.success(
        existing.isPendingSync
          ? "Category already saved locally"
          : "Category already exists"
      );
      return;
    }

    if (!isOnlineNow()) {
      const created = queueWorkerCategoryOffline(cleanName);

      setNewCategory("");
      setCategories(mergeWorkerCategoriesWithPending(getCachedWorkerCategories()));

      if (created?._id) {
        setForm((prev) => ({ ...prev, category: created._id }));
      }

      toast.success("Category saved offline and will sync automatically");
      return;
    }

    try {
      const res = await api.post("/worker-categories", {
        name: cleanName,
      });

      const created = res.data;
      setNewCategory("");
      toast.success("Category added");

      await fetchData();

      if (created?._id) {
        setForm((prev) => ({ ...prev, category: created._id }));
      }
    } catch (err) {
      console.error("Worker category add error:", err);
      toast.error(err?.response?.data?.error || "Category exists or invalid");
    }
  };

  const handleEditPayment = (item) => {
    if (item.isPendingSync) {
      toast.error("Offline pending record edit is not available here");
      return;
    }

    const matchedProfile =
      profileDirectory.find(
        (profile) =>
          item.workerProfileId && String(profile.id) === String(item.workerProfileId)
      ) ||
      profileDirectory.find(
        (profile) => normalizeName(profile.fullName) === normalizeName(item.workerName)
      );

    setEditing(item._id);
    setForm({
      category: item.category?._id || "",
      workerProfileId: matchedProfile?.id || "",
      workerName: item.workerName || "",
      amount: item.amount || "",
      description: item.description || "",
    });

    openPanel("payment");
  };

  const deletePayment = async (id, isPendingSync) => {
    if (isPendingSync) {
      toast.error("Offline pending delete is not available here");
      return;
    }

    const ok = window.confirm("Are you sure you want to delete this worker payment?");
    if (!ok) return;

    try {
      await api.delete(`/workers/${id}`);
      toast.success("Worker payment deleted");
      await fetchData();
    } catch (err) {
      console.error("Worker delete error:", err);
      toast.error("Delete failed");
    }
  };

  const startEditProfile = (profile) => {
    setProfileForm({
      id: profile.isDerived ? "" : profile.id,
      fullName: profile.fullName || "",
      roleCategory: profile.roleCategory || "",
      phone: profile.phone || "",
      note: profile.note || "",
      photoDataUrl: profile.photoDataUrl || "",
      photoZoom: clampZoom(profile.photoZoom),
      photoX: safeNumber(profile.photoX, 0),
      photoY: safeNumber(profile.photoY, 0),
    });

    openPanel("profile");
  };

  const resetProfileForm = () => {
    setProfileForm(defaultProfileForm);
    stopCamera();
  };

  const clearProfilePhoto = () => {
    stopCamera();
    setProfileForm((prev) => ({
      ...prev,
      photoDataUrl: "",
      photoZoom: 1,
      photoX: 0,
      photoY: 0,
    }));

    if (uploadInputRef.current) {
      uploadInputRef.current.value = "";
    }
  };

  const saveWorkerReturn = (profile) => {
    if (!profile) {
      toast.error("Please select a worker first");
      return;
    }

    const amount = Number(returnAmount || 0);

    if (!amount || amount <= 0) {
      toast.error("Please enter returned amount");
      return;
    }

    const cleanAmount = Number(amount.toFixed(2));
    const newReturn = {
      id: `worker-return-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      workerProfileId: profile.id,
      workerName: profile.fullName,
      amount: cleanAmount,
      createdAt: new Date().toISOString(),
    };

    persistWorkerReturns([newReturn, ...workerReturns]);
    setReturnAmount("");
    toast.success("Returned amount saved");
  };

  const getOrCreateProfileCategory = async (categoryName) => {
    const cleanName = String(categoryName || "").trim();
    if (!cleanName) return null;

    const existing = categories.find(
      (item) => normalizeName(item?.name) === normalizeName(cleanName)
    );

    if (existing) return existing;

    if (!isOnlineNow()) {
      const created = queueWorkerCategoryOffline(cleanName);
      setCategories(mergeWorkerCategoriesWithPending(getCachedWorkerCategories()));
      return created || null;
    }

    const res = await api.post("/worker-categories", { name: cleanName });
    await fetchData();
    return res.data || null;
  };

  const saveProfile = async () => {
    if (profileSaveLockRef.current || savingProfile) {
      return;
    }

    const cleanName = String(profileForm.fullName || "").trim();

    if (!cleanName) {
      toast.error("Please enter worker full name");
      return;
    }

    const duplicate = profiles.find(
      (item) =>
        normalizeName(item.fullName) === normalizeName(cleanName) &&
        item.id !== profileForm.id
    );

    if (duplicate) {
      toast.error("This worker name already exists. Use full name or Hassan 1");
      return;
    }

    profileSaveLockRef.current = true;
    setSavingProfile(true);

    const existingSaved = profileForm.id
      ? profiles.find((item) => item.id === profileForm.id)
      : null;

    const isRealUpdate = !!existingSaved;
    const cleanRoleCategory =
      String(profileForm.roleCategory || "").trim() || "General Worker";

    try {
      await getOrCreateProfileCategory(cleanRoleCategory);
    } catch (error) {
      console.error("Worker profile category save error:", error);
      toast.error(
        error?.response?.data?.error || "Could not save worker category"
      );
      profileSaveLockRef.current = false;
      setSavingProfile(false);
      return;
    }

    const nextProfile = {
      id: isRealUpdate ? profileForm.id : createProfileId(),
      fullName: cleanName,
      roleCategory: cleanRoleCategory,
      phone: String(profileForm.phone || "").trim(),
      note: String(profileForm.note || "").trim(),
      photoDataUrl: profileForm.photoDataUrl || "",
      photoZoom: clampZoom(profileForm.photoZoom),
      photoX: safeNumber(profileForm.photoX, 0),
      photoY: safeNumber(profileForm.photoY, 0),
      createdAt: existingSaved?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const nextDeletedProfiles = deletedProfiles.filter((item) => {
      const sameId =
        item?.id && nextProfile.id && String(item.id) === String(nextProfile.id);
      const sameName =
        getDeletedWorkerProfileKey(item) &&
        getDeletedWorkerProfileKey(item) === normalizeName(nextProfile.fullName);

      return !sameId && !sameName;
    });

    if (nextDeletedProfiles.length !== deletedProfiles.length) {
      persistDeletedProfiles(nextDeletedProfiles);
    }

    const nextProfiles = isRealUpdate
      ? profiles.map((item) => (item.id === profileForm.id ? nextProfile : item))
      : [nextProfile, ...profiles];

    persistProfiles(nextProfiles);

    setForm((prev) => ({
      ...prev,
      workerProfileId: nextProfile.id,
      workerName: nextProfile.fullName,
      category:
        prev.category ||
        resolveCategoryIdFromName(categories, nextProfile.roleCategory),
    }));

    setSelectedProfileId(nextProfile.id);
    resetProfileForm();
    setActivePanel("");

    toast.success(isRealUpdate ? "Worker profile updated" : "Worker profile saved");

    profileSaveLockRef.current = false;
    setSavingProfile(false);
  };

  const deleteProfile = (profile) => {
    if (!profile) return;

    const ok = window.confirm(
      `Delete worker "${profile.fullName}" from this account?\n\nThis removes the saved worker profile and hides it from auto-recovery. Old payment records remain in Payment History.`
    );

    if (!ok) return;

    const profileId = String(profile.id || "").trim();
    const profileKey = normalizeName(profile.fullName);

    const deletedMarker = {
      id: profileId,
      fullName: profile.fullName || "",
      key: profileKey,
      deletedAt: new Date().toISOString(),
    };

    persistDeletedProfiles([deletedMarker, ...deletedProfiles]);

    const nextProfiles = profiles.filter((item) => {
      const sameId = profileId && String(item.id || "") === profileId;
      const sameName = profileKey && normalizeName(item.fullName) === profileKey;
      return !sameId && !sameName;
    });

    persistProfiles(nextProfiles);

    const nextReturns = workerReturns.filter((item) => {
      const sameId =
        profileId && String(item.workerProfileId || "") === profileId;
      const sameName =
        profileKey && normalizeName(item.workerName || item.fullName || "") === profileKey;

      return !sameId && !sameName;
    });

    if (nextReturns.length !== workerReturns.length) {
      persistWorkerReturns(nextReturns);
    }

    if (
      String(form.workerProfileId || "") === profileId ||
      normalizeName(form.workerName) === profileKey
    ) {
      setForm((prev) => ({
        ...prev,
        workerProfileId: "",
        workerName: "",
      }));
    }

    if (String(selectedProfileId || "") === profileId) {
      const nextSelected = nextProfiles.find(
        (item) => !isWorkerProfileDeleted(item, [deletedMarker, ...deletedProfiles])
      );
      setSelectedProfileId(nextSelected?.id || "");
    }

    if (
      String(profileForm.id || "") === profileId ||
      normalizeName(profileForm.fullName) === profileKey
    ) {
      resetProfileForm();
    }

    setShowAllPaymentProfiles(false);
    setWorkerSearch((prev) =>
      normalizeName(prev) === profileKey ? "" : prev
    );

    toast.success("Worker deleted");
  };

  const handlePhotoPick = async (file) => {
    if (!file) return;

    try {
      setProfileUploading(true);
      stopCamera();

      const dataUrl = await fileToDataUrl(file);

      setProfileForm((prev) => ({
        ...prev,
        photoDataUrl: dataUrl,
        photoZoom: 1,
        photoX: 0,
        photoY: 0,
      }));
    } catch (error) {
      console.error("Worker photo upload error:", error);
      toast.error("Failed to load photo");
    } finally {
      setProfileUploading(false);
    }
  };

  const renderPhotoEditor = () => {
    const previewSrc =
      profileForm.photoDataUrl || getWorkerAvatar(profileForm.fullName || "Worker");

    return (
      <div className="worker-photo-editor-wrap">
        <div
          className={`worker-photo-editor ${
            profileForm.photoDataUrl ? "has-photo" : "has-placeholder"
          }`}
          onPointerDown={beginPhotoDrag}
          onPointerMove={movePhotoDrag}
          onPointerUp={endPhotoDrag}
          onPointerCancel={endPhotoDrag}
        >
          <img
            src={previewSrc}
            alt="Worker preview"
            draggable="false"
            style={{
              transform: `translate(${safeNumber(profileForm.photoX, 0)}px, ${safeNumber(
                profileForm.photoY,
                0
              )}px) scale(${clampZoom(profileForm.photoZoom)})`,
            }}
          />

          <span className="worker-photo-editor-hint">
            {profileForm.photoDataUrl ? "Drag to adjust" : "Add photo"}
          </span>
        </div>

        <p>Drag with finger or mouse, then zoom until the face is centered.</p>

        {profileForm.photoDataUrl ? (
          <button
            type="button"
            className="worker-photo-clear-btn"
            onClick={clearProfilePhoto}
          >
            Remove photo
          </button>
        ) : null}
      </div>
    );
  };

  const renderPaymentPanel = () => (
    <section className="worker-panel worker-panel--compact">
      <div className="worker-panel-topline">
        <button type="button" className="worker-back-btn" onClick={closePanel}>
          ←
        </button>
        <div>
          <h3>{editing ? "Edit worker payment" : "Worker Payment"}</h3>
          <p>Add payment only when needed.</p>
        </div>
      </div>

      <div className="worker-profile-picker">
        <div className="worker-profile-picker-head">
          <div>
            <strong>Select worker by photo</strong>
            <small>Tap a worker image to fill the name automatically.</small>
          </div>

          {profileDirectory.length > 5 ? (
            <button
              type="button"
              onClick={() => setShowAllPaymentProfiles((prev) => !prev)}
            >
              {showAllPaymentProfiles ? "Show less" : "See more"}
            </button>
          ) : null}
        </div>

        {profileDirectory.length === 0 ? (
          <div className="worker-empty worker-empty--compact">No saved workers yet</div>
        ) : (
          <div
            className={`worker-profile-picker-grid ${
              showAllPaymentProfiles ? "expanded" : ""
            }`}
          >
            {visiblePaymentProfiles.map((profile) => {
              const isSelected =
                String(form.workerProfileId || "") === String(profile.id) ||
                normalizeName(form.workerName) === normalizeName(profile.fullName);

              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => pickProfileForPayment(profile)}
                  className={`worker-profile-choice ${isSelected ? "selected" : ""}`}
                >
                  <Avatar
                    src={profile.photoDataUrl || getWorkerAvatar(profile.fullName)}
                    alt={profile.fullName}
                    zoom={profile.photoZoom}
                    x={profile.photoX}
                    y={profile.photoY}
                    size="sm"
                  />
                  <strong>{profile.fullName}</strong>
                  <small>{profile.roleCategory || "Worker"}</small>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedPaymentProfile ? (
        <div className="worker-selected-payment-profile">
          <Avatar
            src={
              selectedPaymentProfile.photoDataUrl ||
              getWorkerAvatar(selectedPaymentProfile.fullName)
            }
            alt={selectedPaymentProfile.fullName}
            zoom={selectedPaymentProfile.photoZoom}
            x={selectedPaymentProfile.photoX}
            y={selectedPaymentProfile.photoY}
            size="sm"
          />
          <div>
            <strong>{selectedPaymentProfile.fullName}</strong>
            <small>{selectedPaymentProfile.roleCategory || "Selected worker"}</small>
          </div>
        </div>
      ) : null}

      <div className="worker-add-category-card">
        <span className="worker-small-icon">+</span>
        <input
          type="text"
          placeholder="Add payment category"
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
        />
        <button type="button" onClick={addCategory}>
          Add
        </button>
      </div>

      <div className="worker-form-grid">
        <InputCard icon="🏷️" label="Payment category">
          <select
            value={form.category}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, category: e.target.value }))
            }
          >
            <option value="">Select category</option>
            {categories.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
                {c.isPendingSync ? " (pending sync)" : ""}
              </option>
            ))}
          </select>
        </InputCard>

        <InputCard icon="👤" label="Selected / manual worker name">
          <input
            type="text"
            placeholder="Tap worker photo or type name"
            value={form.workerName}
            onChange={(e) => handleWorkerNameChange(e.target.value)}
          />
        </InputCard>

        <InputCard icon="💵" label="Amount (PKR)">
          <input
            type="number"
            placeholder="Enter amount"
            value={form.amount}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, amount: e.target.value }))
            }
          />
        </InputCard>

        <InputCard icon="📝" label="Description / note" wide>
          <input
            type="text"
            placeholder="Enter description or note"
            value={form.description}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, description: e.target.value }))
            }
          />
        </InputCard>
      </div>

      <button
        type="button"
        className="worker-save-premium"
        onClick={savePayment}
        disabled={savingPayment}
        aria-busy={savingPayment}
      >
        💾 {savingPayment ? "Saving..." : editing ? "Update worker payment" : "Save worker payment"}
      </button>
    </section>
  );

  const renderProfilePanel = () => (
    <section className="worker-panel worker-panel--compact">
      <div className="worker-panel-topline">
        <button type="button" className="worker-back-btn" onClick={closePanel}>
          ←
        </button>
        <div>
          <h3>{profileForm.id ? "Edit worker" : "Add Worker"}</h3>
          <p>Upload or capture a photo, then adjust it inside the circle.</p>
        </div>
      </div>

      {renderPhotoEditor()}

      <div className="worker-photo-actions">
        <button
          type="button"
          onClick={() => uploadInputRef.current?.click()}
          disabled={profileUploading}
        >
          Upload photo
        </button>

        <button
          type="button"
          onClick={() => startCamera(cameraFacingMode)}
          disabled={profileUploading}
        >
          Capture photo
        </button>
      </div>

      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => handlePhotoPick(e.target.files?.[0])}
      />

      {cameraOpen ? (
        <div className="worker-camera-box">
          <video
            ref={videoRef}
            className="worker-camera-video"
            autoPlay
            playsInline
            muted
          />

          <canvas ref={canvasRef} hidden />

          <div className="worker-camera-actions worker-camera-actions--triple">
            <button type="button" onClick={captureCameraPhoto}>
              Take photo
            </button>

            <button type="button" onClick={toggleCameraFacingMode}>
              Switch to {cameraFacingMode === "environment" ? "front" : "back"} camera
            </button>

            <button type="button" onClick={stopCamera}>
              Close camera
            </button>
          </div>
        </div>
      ) : null}

      {cameraError ? <div className="worker-camera-error">{cameraError}</div> : null}

      <div className="worker-zoom-control">
        <span>Zoom</span>
        <input
          type="range"
          min="1"
          max="2.4"
          step="0.05"
          value={profileForm.photoZoom}
          onChange={(e) =>
            setProfileForm((prev) => ({
              ...prev,
              photoZoom: clampZoom(e.target.value),
            }))
          }
        />
        <strong>{Number(profileForm.photoZoom || 1).toFixed(2)}x</strong>
      </div>

      <button
        type="button"
        className="worker-photo-reset-btn"
        onClick={resetPhotoPosition}
      >
        Center photo
      </button>

      <div className="worker-form-grid">
        <InputCard icon="👤" label="Full name" wide>
          <input
            type="text"
            placeholder="Enter full name"
            value={profileForm.fullName}
            onChange={(e) =>
              setProfileForm((prev) => ({ ...prev, fullName: e.target.value }))
            }
          />
        </InputCard>

        <InputCard icon="💼" label="Role / category" wide>
          <input
            type="text"
            list="worker-category-options"
            placeholder="General Worker, Tractor Operator, Driver"
            value={profileForm.roleCategory}
            onChange={(e) =>
              setProfileForm((prev) => ({
                ...prev,
                roleCategory: e.target.value,
              }))
            }
          />
        </InputCard>

        <datalist id="worker-category-options">
          {categories.map((category) => (
            <option key={category._id || category.name} value={category.name} />
          ))}
        </datalist>

        <InputCard icon="📞" label="Phone" wide>
          <input
            type="text"
            placeholder="0300 1234567"
            value={profileForm.phone}
            onChange={(e) =>
              setProfileForm((prev) => ({ ...prev, phone: e.target.value }))
            }
          />
        </InputCard>

        <InputCard icon="📝" label="Note" wide>
          <input
            type="text"
            placeholder="Good worker, irrigation, loading..."
            value={profileForm.note}
            onChange={(e) =>
              setProfileForm((prev) => ({ ...prev, note: e.target.value }))
            }
          />
        </InputCard>
      </div>

      <button
        type="button"
        className="worker-save-premium"
        onClick={saveProfile}
        disabled={savingProfile}
        aria-busy={savingProfile}
      >
        💾 {savingProfile ? "Saving..." : "Save worker"}
      </button>
    </section>
  );

  const renderDetailsPanel = () => (
    <section className="worker-panel worker-panel--compact">
      <div className="worker-panel-topline">
        <button type="button" className="worker-back-btn" onClick={closePanel}>
          ←
        </button>
        <div>
          <h3>Worker Details</h3>
          <p>Selected worker summary and activity.</p>
        </div>
      </div>

      {!selectedProfile ? (
        <div className="worker-empty">Select a worker to view details</div>
      ) : (
        <>
          <div className="worker-detail-hero">
            <Avatar
              src={
                selectedProfile.photoDataUrl ||
                getWorkerAvatar(selectedProfile.fullName)
              }
              alt={selectedProfile.fullName}
              zoom={selectedProfile.photoZoom}
              x={selectedProfile.photoX}
              y={selectedProfile.photoY}
              size="lg"
            />

            <div className="worker-detail-name-area">
              <h3>{selectedProfile.fullName}</h3>
              <p>{selectedProfile.roleCategory}</p>
              <span>
                {selectedProfile.phone ? `☎ ${selectedProfile.phone}` : "No phone"}
              </span>
            </div>

            <button
              type="button"
              className="worker-edit-profile-btn"
              onClick={() => startEditProfile(selectedProfile)}
            >
              ✎
            </button>
          </div>

          <div className="worker-detail-stats worker-detail-stats--money">
            <div>
              <span>Total Paid</span>
              <b title={money(selectedProfile.totalPaid)}>{money(selectedProfile.totalPaid)}</b>
            </div>

            <div>
              <span>Returned</span>
              <b title={money(selectedProfile.totalReturned)}>{money(selectedProfile.totalReturned)}</b>
            </div>

            <div className={selectedProfile.outstandingBalance > 0 ? "loss" : "settled"}>
              <span>Still Owes</span>
              <b title={money(selectedProfile.outstandingBalance)}>{money(selectedProfile.outstandingBalance)}</b>
            </div>

            <div className="profit">
              <span>Profit Share</span>
              <b title={money(selectedProfile.profitShare)}>{money(selectedProfile.profitShare)}</b>
            </div>
          </div>

          <div className="worker-return-box">
            <div>
              <strong>Record returned cash</strong>
              <small>Use this when the worker gives money back to you.</small>
            </div>

            <div className="worker-return-form">
              <input
                type="number"
                placeholder="Returned amount"
                value={returnAmount}
                onChange={(e) => setReturnAmount(e.target.value)}
              />
              <button type="button" onClick={() => saveWorkerReturn(selectedProfile)}>
                Save Return
              </button>
            </div>
          </div>

          <div className="worker-detail-actions">
            <button type="button" onClick={() => pickProfileForPayment(selectedProfile)}>
              Worker Payment
            </button>

            <button type="button" onClick={() => startEditProfile(selectedProfile)}>
              Edit Worker
            </button>

            {!selectedProfile.isDerived ? (
              <button
                type="button"
                className="danger"
                onClick={() => deleteProfile(selectedProfile)}
              >
                Delete Worker
              </button>
            ) : null}
          </div>

          <div className="worker-payment-preview">
            {selectedWorkerPayments.length === 0 ? (
              <div className="worker-empty">No payments for this worker yet</div>
            ) : (
              selectedWorkerPayments.slice(0, 4).map((item) => (
                <div key={item._id} className="worker-payment-row">
                  <span className="worker-payment-icon">💵</span>

                  <div>
                    <strong>Worker Payment</strong>
                    <small>{item.description || item.category?.name || "Payment"}</small>
                  </div>

                  <span className="worker-payment-date">
                    📅 {formatShortDate(item.createdAt)}
                  </span>

                  <b>+{money(item.amount)}</b>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </section>
  );

  const renderHistoryPanel = () => (
    <section className="worker-panel worker-panel--compact">
      <div className="worker-panel-topline">
        <button type="button" className="worker-back-btn" onClick={closePanel}>
          ←
        </button>
        <div>
          <h3>Payment History</h3>
          <p>Search all worker payment records.</p>
        </div>
      </div>

      <div className="worker-search worker-search--inside">
        <input
          type="text"
          placeholder="Search worker payments"
          value={recordSearch}
          onChange={(e) => {
            setRecordSearch(e.target.value);
            setShowAllPayments(false);
          }}
        />
      </div>

      {loading ? (
        <div className="worker-empty">Loading payment history...</div>
      ) : visiblePayments.length === 0 ? (
        <div className="worker-empty">No worker payments found</div>
      ) : (
        <div className="worker-history-list">
          {visiblePayments.map((item) => {
            const profile = workerProfileMap.get(normalizeName(item.workerName));

            return (
              <article key={item._id} className="worker-history-card">
                <Avatar
                  src={
                    profile?.photoDataUrl ||
                    getWorkerAvatar(item.workerName || "Worker")
                  }
                  alt={item.workerName || "Worker"}
                  zoom={profile?.photoZoom || 1}
                  x={profile?.photoX || 0}
                  y={profile?.photoY || 0}
                  size="sm"
                />

                <div className="worker-history-main">
                  <strong>{item.workerName || "Worker"}</strong>
                  <span>{item.category?.name || "Uncategorized"}</span>
                  <small>{item.description || "Worker payment"}</small>
                  <small>
                    {formatDateTime(item.createdAt)}
                    {item.isPendingSync ? " • Pending sync" : ""}
                  </small>
                </div>

                <div className="worker-history-side">
                  <b>{money(item.amount)}</b>

                  <div>
                    <button type="button" onClick={() => handleEditPayment(item)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => deletePayment(item._id, item.isPendingSync)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {filteredWorkers.length > 5 ? (
        <button
          type="button"
          className="worker-view-link worker-view-link--full"
          onClick={() => setShowAllPayments((prev) => !prev)}
        >
          {showAllPayments ? "Show less" : "View all payments"}
        </button>
      ) : null}
    </section>
  );

  return (
    <div className={`worker-page-lite${settingsOpen ? " worker-menu-open" : ""}`} ref={pageTopRef}>
      <section
        className="worker-premium-hero"
        style={{
          backgroundImage: `linear-gradient(90deg, rgba(2, 8, 23, 0.96) 0%, rgba(2, 8, 23, 0.6) 42%, rgba(2, 8, 23, 0.1) 100%), url(${farmPremiumHeader})`,
        }}
      >
        <div className="worker-premium-topbar">
          <button
            type="button"
            className="worker-premium-brand"
            onClick={() => scrollToTop()}
            aria-label="Farm Expense Tracker"
          >
            <span className="worker-brand-mark-premium">
              <FarmPremiumLogoMark />
            </span>
            <strong>Farm Expense Tracker</strong>
          </button>

          <div className="worker-settings-wrap" ref={settingsMenuRef}>
            <button
              type="button"
              className="worker-top-icon-button worker-settings-button"
              onClick={() => setSettingsOpen((prev) => !prev)}
              aria-label="Open settings menu"
              aria-expanded={settingsOpen}
            >
              <WorkerPremiumIcon type="settings" />
            </button>

            {settingsOpen && (
              <div className="premium-profile-dropdown worker-profile-dropdown">
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
                      setSettingsOpen(false);
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
            )}
          </div>
        </div>

        <div className="worker-premium-title-row">
          <span className="worker-premium-page-icon">
            <WorkerPremiumIcon type="people" />
          </span>
          <div className="worker-premium-title-copy">
            <h2>Workers</h2>
          </div>
        </div>
      </section>

      <section className="worker-overview-card">
        <div className="worker-overview-head">
          <div>
            <span>Worker Overview</span>
            <h3>{money(totalWorkerAmount)}</h3>
            <p>Total paid to workers</p>
          </div>

          <div className="worker-count-pill">
            <WorkerPremiumIcon type="people" />
            {profileDirectory.length} Worker{profileDirectory.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="worker-overview-grid-premium">
          <div className="worker-overview-mini-card">
            <span><WorkerPremiumIcon type="wallet" /></span>
            <div>
              <small>Total Paid</small>
              <strong>{money(totalWorkerAmount)}</strong>
            </div>
          </div>

          <div className="worker-overview-mini-card">
            <span><WorkerPremiumIcon type="pie" /></span>
            <div>
              <small>Earned Share</small>
              <strong>{money(totalEarnedShare)}</strong>
            </div>
          </div>

          <div className="worker-overview-mini-card">
            <span><WorkerPremiumIcon type="document" /></span>
            <div>
              <small>Balance Due</small>
              <strong>{money(workerBalanceDue)}</strong>
            </div>
          </div>

          <div className="worker-overview-mini-card">
            <span><WorkerPremiumIcon type="grid" /></span>
            <div>
              <small>Categories</small>
              <strong>{workerCategoryCount}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="worker-action-row-lite worker-action-row-premium">
        <button
          type="button"
          className="worker-action-button"
          onClick={() => openPanel("payment")}
        >
          <span><WorkerPremiumIcon type="wallet" /></span>
          Worker Payment
        </button>

        <button
          type="button"
          className="worker-action-button"
          onClick={() => openPanel("profile")}
        >
          <span><WorkerPremiumIcon type="workerAdd" /></span>
          Add Worker
        </button>

        <button
          type="button"
          className="worker-action-button"
          onClick={() => openPanel("details")}
        >
          <span><WorkerPremiumIcon type="usersAdd" /></span>
          Worker Details
        </button>
      </section>

      <section className="worker-category-box-premium" aria-label="Worker categories">
        <div className="worker-category-toolbar">
          <strong>Worker Categories</strong>

          <button
            type="button"
            onClick={() => setShowAllWorkerCategories((prev) => !prev)}
          >
            {showAllWorkerCategories ? "Done" : "See all"}
          </button>
        </div>

        <div className="worker-category-row-premium">
          {visibleWorkerCategoryChips.map((category) => {
            const categoryName = category?.name || "Workers";
            const customIcon = categoryIcons[categoryName];
            const customImage = categoryImages[normalizeName(categoryName)];

            return (
              <button
                key={category._id || categoryName}
                type="button"
                title="Select category. Double-click or right-click to change icon."
                onClick={() => {
                  setWorkerSearch(categoryName);
                  setShowAllProfiles(false);
                }}
                onDoubleClick={() => setWorkerCategoryIcon(categoryName)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setWorkerCategoryIcon(categoryName);
                }}
              >
                <span className="worker-category-chip-icon">
                  {customImage ? (
                    <img src={customImage} alt={categoryName} />
                  ) : (
                    <WorkerPremiumIcon
                      type={getWorkerCategoryIconType(categoryName)}
                      custom={customIcon}
                    />
                  )}
                </span>
                {categoryName}
              </button>
            );
          })}
        </div>

        {showAllWorkerCategories && (
          <div className="worker-category-manage-box">
            <div className="worker-category-add-row">
              <input
                type="text"
                placeholder="New worker category"
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
              />

              <button type="button" onClick={addCategory}>
                Add
              </button>
            </div>

            <div className="worker-category-manage-list">
              {workerCategoryChips.map((category) => {
                const categoryName = category?.name || "Workers";

                return (
                  <div
                    key={`manage-${category._id || categoryName}`}
                    className="worker-category-manage-item"
                  >
                    <span>{categoryName}</span>

                    <label>
                      Image
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) =>
                          handleWorkerCategoryImagePick(
                            categoryName,
                            event.target.files?.[0]
                          )
                        }
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {activePanel === "payment" && renderPaymentPanel()}
      {activePanel === "profile" && renderProfilePanel()}
      {activePanel === "details" && renderDetailsPanel()}
      {activePanel === "history" && renderHistoryPanel()}

      <section className="worker-panel worker-list-panel-lite">
        <div className="worker-section-head">
          <div>
            <h3>Workers</h3>
          </div>

          <button
            type="button"
            className="worker-round-action"
            onClick={() => openPanel("profile")}
          >
            +
          </button>
        </div>

        <div className="worker-search">
          <input
            type="text"
            placeholder="Search workers..."
            value={workerSearch}
            onChange={(e) => {
              setWorkerSearch(e.target.value);
              setShowAllProfiles(false);
            }}
          />
        </div>

        <div className="worker-filter-row">
          {[
            ["all", "All Workers"],
            ["profit", "Profit"],
            ["loss", "Loss"],
            ["settled", "Settled"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`worker-filter-chip ${
                workerFilter === value ? "active" : ""
              }`}
              onClick={() => {
                setWorkerFilter(value);
                setShowAllProfiles(false);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="worker-empty">Loading workers...</div>
        ) : visibleProfiles.length === 0 ? (
          <div className="worker-empty">No workers found</div>
        ) : (
          <div className="worker-list-lite">
            {visibleProfiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                className={`worker-list-card-lite ${
                  selectedProfileId === profile.id ? "active" : ""
                }`}
                onClick={() => openWorkerDetails(profile)}
              >
                <div className="worker-list-main">
                  <Avatar
                    src={profile.photoDataUrl || getWorkerAvatar(profile.fullName)}
                    alt={profile.fullName}
                    zoom={profile.photoZoom}
                    x={profile.photoX}
                    y={profile.photoY}
                    size="md"
                  />

                  <div>
                    <strong>{profile.fullName}</strong>
                    <span>{profile.roleCategory}</span>
                    <small>
                      {profile.paymentCount} payment
                      {profile.paymentCount === 1 ? "" : "s"}
                    </small>
                  </div>
                </div>

                <div className="worker-list-stats-lite">
                  <div>
                    <span>Total Paid</span>
                    <b title={money(profile.totalPaid)}>{money(profile.totalPaid)}</b>
                  </div>

                  <div className={profile.status}>
                    <span>Balance</span>
                    <b title={signedMoney(profile.netBalance)}>{signedMoney(profile.netBalance)}</b>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {filteredProfiles.length > 4 ? (
          <button
            type="button"
            className="worker-view-link worker-view-link--full"
            onClick={() => setShowAllProfiles((prev) => !prev)}
          >
            {showAllProfiles ? "Show less workers" : "View all workers"}
          </button>
        ) : null}
      </section>

      <div className="worker-bottom-space" />
    </div>
  );
}    