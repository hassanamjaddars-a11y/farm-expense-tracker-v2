import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import toast from "react-hot-toast";
import "../styles/expenses.css";
import farmPremiumHeader from "../assets/farm-premium-header.png";
import farmAppLogo from "../assets/farm-expense-tracker-logo.png";
import cashWalletPkr from "../assets/cash-wallet-pkr.png";
import { useAuth } from "../context/AuthContext";
import {
  IoAddCircleOutline,
  IoCalendarClearOutline,
  IoCashOutline,
  IoChevronDown,
  IoChevronForward,
  IoDocumentTextOutline,
  IoGridOutline,
  IoImageOutline,
  IoPricetagOutline,
  IoSaveOutline,
  IoSearchOutline,
  IoTimeOutline,
  IoWalletOutline,
} from "react-icons/io5";
import {
  FaBoxOpen,
  FaGasPump,
  FaSeedling,
  FaShieldAlt,
  FaTools,
} from "react-icons/fa";
import {
  attemptSyncPending,
  cacheExpenseCategories,
  cacheExpenses,
  getCachedExpenseCategories,
  getCachedExpenses,
  isOnlineNow,
  mergeExpenseCategoriesWithPending,
  mergeExpensesWithPending,
  queueExpenseCategoryOffline,
  queueExpenseOffline,
} from "../utils/offlineQueue";

const getInitialExpenseItems = () => mergeExpensesWithPending(getCachedExpenses());
const getInitialExpenseCategories = () =>
  mergeExpenseCategoriesWithPending(getCachedExpenseCategories());

const CATEGORY_IMAGES_STORAGE_KEY = "farm_expense_category_images_v1";
const DEFAULT_CATEGORY_NAMES = ["Diesel", "Fertilizer", "Seeds"];

const money = (value) => `PKR ${Number(value || 0).toLocaleString()}`;

const todayInputValue = () => new Date().toISOString().slice(0, 10);

const normalizeName = (value = "") =>
  String(value).trim().replace(/\s+/g, " ").toLowerCase();

const readCategoryImages = () => {
  try {
    const raw = localStorage.getItem(CATEGORY_IMAGES_STORAGE_KEY);
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.error("Expense category image read error:", error);
    return {};
  }
};

const writeCategoryImages = (images) => {
  localStorage.setItem(CATEGORY_IMAGES_STORAGE_KEY, JSON.stringify(images));
};

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;

    reader.readAsDataURL(file);
  });

const getExpenseDate = (item) => item?.date || item?.expenseDate || item?.createdAt;

const getCategoryMeta = (name = "") => {
  const key = normalizeName(name);

  if (key.includes("diesel") || key.includes("fuel")) {
    return {
      Icon: FaGasPump,
      subtitle: "Fuel",
      className: "diesel",
    };
  }

  if (key.includes("fertilizer") || key.includes("urea") || key.includes("khad")) {
    return {
      Icon: FaSeedling,
      subtitle: "Inputs",
      className: "fertilizer",
    };
  }

  if (key.includes("seed")) {
    return {
      Icon: FaSeedling,
      subtitle: "Sowing",
      className: "seeds",
    };
  }

  if (key.includes("repair") || key.includes("maintenance")) {
    return {
      Icon: FaTools,
      subtitle: "Maintenance",
      className: "repair",
    };
  }

  if (key.includes("pesticide") || key.includes("spray")) {
    return {
      Icon: FaShieldAlt,
      subtitle: "Crop safety",
      className: "pesticide",
    };
  }

  return {
    Icon: FaBoxOpen,
    subtitle: "Expense",
    className: "other",
  };
};

const CategoryIcon = ({ name, image }) => {
  const meta = getCategoryMeta(name);
  const Icon = meta.Icon;

  return (
    <div className={`expense-category-icon ${meta.className}`}>
      {image ? <img src={image} alt={name} /> : <Icon />}
    </div>
  );
};

function ExpenseSettingsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="expense-settings-svg"
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

export default function Expenses() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const settingsMenuRef = useRef(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [expenses, setExpenses] = useState(getInitialExpenseItems);
  const [categories, setCategories] = useState(getInitialExpenseCategories);
  const [form, setForm] = useState({
    description: "",
    amount: "",
    category: "",
    date: todayInputValue(),
    note: "",
  });
  const [editing, setEditing] = useState(null);
  const [newCategory, setNewCategory] = useState("");
  const [recordSearch, setRecordSearch] = useState("");
  const [loading, setLoading] = useState(
    () =>
      getInitialExpenseItems().length === 0 &&
      getInitialExpenseCategories().length === 0
  );
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [showAllRecords, setShowAllRecords] = useState(false);
  const [categoryImages, setCategoryImages] = useState(() => readCategoryImages());
  const [creatingDefaults, setCreatingDefaults] = useState(false);

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

  const refreshLocalState = () => {
    setExpenses(mergeExpensesWithPending(getCachedExpenses()));
    setCategories(mergeExpenseCategoriesWithPending(getCachedExpenseCategories()));
  };

  const fetchData = async () => {
    try {
      await attemptSyncPending(api);

      const [expRes, catRes] = await Promise.all([
        api.get("/expenses"),
        api.get("/expense-categories"),
      ]);

      const serverExpenses = expRes.data || [];
      const serverCategories = catRes.data || [];

      cacheExpenses(serverExpenses);
      cacheExpenseCategories(serverCategories);

      setExpenses(mergeExpensesWithPending(serverExpenses));
      setCategories(mergeExpenseCategoriesWithPending(serverCategories));
    } catch (err) {
      console.error("Expenses fetch error:", err);
      refreshLocalState();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const handleOnline = () => {
      fetchData();
    };

    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  useEffect(() => {
    const createMissingDefaultCategories = async () => {
      if (creatingDefaults) return;

      const existingNames = new Set(categories.map((item) => normalizeName(item?.name)));
      const missingNames = DEFAULT_CATEGORY_NAMES.filter(
        (name) => !existingNames.has(normalizeName(name))
      );

      if (!missingNames.length) return;

      setCreatingDefaults(true);

      try {
        if (!isOnlineNow()) {
          missingNames.forEach((name) => queueExpenseCategoryOffline(name));
          setCategories(mergeExpenseCategoriesWithPending(getCachedExpenseCategories()));
          return;
        }

        await Promise.all(
          missingNames.map((name) =>
            api.post("/expense-categories", { name }).catch((error) => {
              console.warn(`Default category "${name}" was not created:`, error);
              return null;
            })
          )
        );

        await fetchData();
      } finally {
        setCreatingDefaults(false);
      }
    };

    createMissingDefaultCategories();
  }, [categories, creatingDefaults]);

  const filteredExpenses = useMemo(() => {
    const q = recordSearch.trim().toLowerCase();
    const sortedExpenses = [...expenses].sort(
      (a, b) => new Date(getExpenseDate(b) || 0) - new Date(getExpenseDate(a) || 0)
    );

    if (!q) return sortedExpenses;

    return sortedExpenses.filter((item) => {
      const description = item.description?.toLowerCase() || "";
      const category = item.category?.name?.toLowerCase() || "";
      const amount = String(item.amount || "");
      const date = formatDateTime(getExpenseDate(item)).toLowerCase();

      return (
        description.includes(q) ||
        category.includes(q) ||
        amount.includes(q) ||
        date.includes(q)
      );
    });
  }, [expenses, recordSearch]);

  const totalExpenseAmount = useMemo(() => {
    return expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  }, [expenses]);

  const categorySummary = useMemo(() => {
    const map = new Map();

    expenses.forEach((item) => {
      const categoryName = item.category?.name || "Uncategorized";
      const categoryId = item.category?._id || `name-${categoryName}`;
      const current = map.get(categoryId) || {
        _id: categoryId,
        name: categoryName,
        total: 0,
        count: 0,
      };

      current.total += Number(item.amount || 0);
      current.count += 1;
      map.set(categoryId, current);
    });

    categories.forEach((cat) => {
      if (!map.has(cat._id)) {
        map.set(cat._id, {
          _id: cat._id,
          name: cat.name,
          total: 0,
          count: 0,
          isPendingSync: cat.isPendingSync,
        });
      }
    });

    return [...map.values()].sort((a, b) => {
      const aDefault = DEFAULT_CATEGORY_NAMES.some(
        (name) => normalizeName(name) === normalizeName(a.name)
      );
      const bDefault = DEFAULT_CATEGORY_NAMES.some(
        (name) => normalizeName(name) === normalizeName(b.name)
      );

      if (aDefault && !bDefault) return -1;
      if (!aDefault && bDefault) return 1;

      return b.total - a.total;
    });
  }, [expenses, categories]);

  const visibleCategorySummary = showAllCategories
    ? categorySummary
    : categorySummary.slice(0, 4);

  const visibleExpenseRecords =
    showAllRecords || recordSearch.trim()
      ? filteredExpenses
      : filteredExpenses.slice(0, 3);

  const resetForm = () => {
    setForm({
      description: "",
      amount: "",
      category: "",
      date: todayInputValue(),
      note: "",
    });
    setEditing(null);
    setNewCategory("");
  };

  const saveExpense = async () => {
    if (!form.category) {
      toast.error("Please select a category");
      return;
    }

    if (!form.description.trim()) {
      toast.error("Please enter description");
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

    const noteText = form.note.trim();
    const payload = {
      description: noteText
        ? `${form.description.trim()} — ${noteText}`
        : form.description.trim(),
      amount: Number(form.amount),
      category: form.category,
      categoryName: selectedCategory.name || "",
      categoryClientId: selectedCategory.clientId || "",
      date: form.date,
    };

    const hasPendingCategory =
      !!selectedCategory?.isPendingSync ||
      String(payload.category || "").startsWith("local-");

    try {
      if (editing) {
        if (!isOnlineNow()) {
          toast.error("Offline edit for synced expense is not available");
          return;
        }

        await api.put(`/expenses/${editing}`, payload);
        toast.success("Expense updated");
      } else {
        if (!isOnlineNow()) {
          queueExpenseOffline({
            description: payload.description,
            amount: payload.amount,
            categoryId: payload.category,
            categoryName: selectedCategory?.name || "Uncategorized",
            categoryClientId: selectedCategory?.clientId || null,
            date: payload.date,
          });

          toast.success("Expense saved offline and will sync automatically");
        } else {
          try {
            await api.post("/expenses", payload);
            toast.success("Expense added");
          } catch (err) {
            if (!err?.response) {
              queueExpenseOffline({
                description: payload.description,
                amount: payload.amount,
                categoryId: payload.category,
                categoryName: selectedCategory?.name || "Uncategorized",
                categoryClientId: selectedCategory?.clientId || null,
                date: payload.date,
              });

              toast.success(
                hasPendingCategory
                  ? "Expense saved locally. It will sync after category sync"
                  : "Internet weak. Expense saved offline for sync"
              );
            } else {
              throw err;
            }
          }
        }
      }

      resetForm();
      await fetchData();
    } catch (err) {
      console.error("Expense save error:", err);
      toast.error(err?.response?.data?.error || "Error saving expense");
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
      const created = queueExpenseCategoryOffline(cleanName);

      setNewCategory("");
      setCategories(mergeExpenseCategoriesWithPending(getCachedExpenseCategories()));

      if (created?._id) {
        setForm((prev) => ({ ...prev, category: created._id }));
      }

      toast.success("Category saved offline and will sync automatically");
      return;
    }

    try {
      const res = await api.post("/expense-categories", {
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
      console.error("Expense category add error:", err);
      toast.error(err?.response?.data?.error || "Category exists or invalid");
    }
  };

  const editExpense = (item) => {
    if (item.isPendingSync) {
      toast.error("Offline pending record edit is not available here");
      return;
    }

    setEditing(item._id);
    setForm({
      description: item.description || "",
      amount: item.amount || "",
      category: item.category?._id || "",
      date: getExpenseDate(item)
        ? new Date(getExpenseDate(item)).toISOString().slice(0, 10)
        : todayInputValue(),
      note: "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteExpense = async (id, isPendingSync) => {
    if (isPendingSync) {
      toast.error("Offline pending delete is not available here");
      return;
    }

    const ok = window.confirm("Are you sure you want to delete this expense?");
    if (!ok) return;

    try {
      await api.delete(`/expenses/${id}`);
      toast.success("Expense deleted");
      await fetchData();
    } catch (err) {
      console.error("Expense delete error:", err);
      toast.error("Delete failed");
    }
  };

  const handleCategoryImagePick = async (categoryName, file) => {
    if (!file) return;

    try {
      const dataUrl = await fileToDataUrl(file);
      const nextImages = {
        ...categoryImages,
        [normalizeName(categoryName)]: dataUrl,
      };

      setCategoryImages(nextImages);
      writeCategoryImages(nextImages);
      toast.success("Category image updated");
    } catch (error) {
      console.error("Expense category image error:", error);
      toast.error("Could not load image");
    }
  };

  return (
    <div className="expense-premium-page">
      <section className="expense-farm-header">
        <img
          className="expense-header-image"
          src={farmPremiumHeader}
          alt=""
          aria-hidden="true"
        />
        <div className="expense-header-shade" />
        <div className="expense-header-glow" />

        <div className="expense-brand-row">
          <div className="expense-brand-left">
            <div className="expense-brand-logo-image expense-logo-no-ring">
              <img className="expense-app-logo" src={farmAppLogo} alt="Farm Expense Tracker" />
            </div>

            <div className="expense-brand-copy">
              <h1>Farm Expense Tracker</h1>
              <p>Expenses, workers, reports</p>
            </div>
          </div>

          <div className="expense-settings-wrap" ref={settingsMenuRef}>
            <button
              type="button"
              className="expense-settings-button"
              onClick={() => setSettingsOpen((prev) => !prev)}
              aria-label="Open settings menu"
              aria-expanded={settingsOpen}
              title="Settings"
            >
              <ExpenseSettingsIcon />
            </button>

            {settingsOpen && (
              <div className="premium-profile-dropdown expense-profile-dropdown">
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

        <div className="expense-page-title">
          <div className="expense-page-icon">
            <IoWalletOutline />
          </div>

          <div className="expense-page-copy">
            <h2>Expenses</h2>
          </div>
        </div>
      </section>

      <section className="expense-total-card">
        <div className="expense-total-copy">
          <p className="expense-total-label">Total Expenses</p>
          <h3 className="expense-total-value">{money(totalExpenseAmount)}</h3>

          <div className="expense-trend">
            <span>↗</span>
            <strong>{expenses.length}</strong>
            <small>saved records</small>
          </div>
        </div>

        <div className="expense-wallet-art expense-wallet-art-image" aria-hidden="true">
          <img src={cashWalletPkr} alt="" />
        </div>
      </section>

      <section className="expense-panel">
        <div className="expense-panel-heading">
          <span className="expense-heading-icon">
            <IoAddCircleOutline />
          </span>
          <h3>{editing ? "Edit Expense" : "Add Expense"}</h3>
        </div>

        <div className="expense-form-grid">
          <label className="expense-field-card">
            <span className="expense-field-icon">
              <IoPricetagOutline />
            </span>

            <span className="expense-field-content">
              <small>Category</small>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                <option value="">Select category</option>
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                    {c.isPendingSync ? " (pending sync)" : ""}
                  </option>
                ))}
              </select>
            </span>

            <IoChevronDown className="expense-field-chevron" />
          </label>

          <label className="expense-field-card">
            <span className="expense-field-icon">
              <IoDocumentTextOutline />
            </span>

            <span className="expense-field-content">
              <small>Description</small>
              <input
                type="text"
                placeholder="Enter description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </span>
          </label>

          <label className="expense-field-card">
            <span className="expense-field-icon">
              <IoCashOutline />
            </span>

            <span className="expense-field-content">
              <small>Amount (PKR)</small>
              <input
                type="number"
                placeholder="Enter amount"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </span>
          </label>

          <label className="expense-field-card">
            <span className="expense-field-icon">
              <IoCalendarClearOutline />
            </span>

            <span className="expense-field-content">
              <small>Date</small>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </span>
          </label>
        </div>

        <button type="button" className="expense-save-premium" onClick={saveExpense}>
          <IoSaveOutline />
          {editing ? "Update Expense" : "Save Expense"}
        </button>

        {editing && (
          <button type="button" className="expense-cancel-premium" onClick={resetForm}>
            Cancel editing
          </button>
        )}
      </section>

      <section className="expense-panel">
        <div className="expense-section-head">
          <div className="expense-title-row">
            <span className="expense-section-icon">
              <IoGridOutline />
            </span>
            <h3>Expense Categories</h3>
          </div>

          <button
            type="button"
            className="expense-view-link"
            onClick={() => setShowAllCategories((prev) => !prev)}
          >
            {showAllCategories ? "Done" : "Manage"}
            <IoChevronForward />
          </button>
        </div>

        {loading ? (
          <div className="expense-empty">Loading categories...</div>
        ) : visibleCategorySummary.length === 0 ? (
          <div className="expense-empty">No expense categories yet</div>
        ) : (
          <div className="expense-category-grid">
            {visibleCategorySummary.map((item, index) => {
              const meta = getCategoryMeta(item.name);
              const image = categoryImages[normalizeName(item.name)];

              return (
                <article key={`${item._id}-${index}`} className="expense-category-tile">
                  <CategoryIcon name={item.name} image={image} />

                  <div className="expense-category-copy">
                    <strong>{item.name}</strong>
                    <span>{meta.subtitle}</span>
                  </div>

                  {showAllCategories && (
                    <label className="expense-image-upload">
                      <IoImageOutline />
                      <span>Image</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) =>
                          handleCategoryImagePick(item.name, e.target.files?.[0])
                        }
                      />
                    </label>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {showAllCategories && (
          <div className="expense-manage-box">
            <div>
              <h4>Add Category</h4>
              <p>Create your own expense category.</p>
            </div>

            <div className="expense-add-row">
              <input
                type="text"
                placeholder="New category name"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
              />
              <button type="button" onClick={addCategory}>
                Add
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="expense-panel">
        <div className="expense-section-head">
          <div className="expense-title-row">
            <span className="expense-section-icon">
              <IoTimeOutline />
            </span>
            <h3>Recent Expenses</h3>
          </div>

          {filteredExpenses.length > 3 && (
            <button
              type="button"
              className="expense-view-link"
              onClick={() => setShowAllRecords((prev) => !prev)}
            >
              {showAllRecords ? "View less" : "View all"}
              <IoChevronForward />
            </button>
          )}
        </div>

        {(expenses.length > 3 || recordSearch.trim()) && (
          <div className="expense-search">
            <IoSearchOutline />
            <input
              type="text"
              placeholder="Search recent expenses"
              value={recordSearch}
              onChange={(e) => {
                setRecordSearch(e.target.value);
                setShowAllRecords(false);
              }}
            />
          </div>
        )}

        {loading ? (
          <div className="expense-empty">Loading saved expenses...</div>
        ) : visibleExpenseRecords.length === 0 ? (
          <div className="expense-empty">No expenses found</div>
        ) : (
          <div className="expense-recent-list">
            {visibleExpenseRecords.map((item) => {
              const categoryName = item.category?.name || "Uncategorized";
              const image = categoryImages[normalizeName(categoryName)];

              return (
                <article key={item._id} className="expense-recent-row">
                  <CategoryIcon name={categoryName} image={image} />

                  <div className="expense-recent-main">
                    <strong>{item.description || "Expense"}</strong>
                    <span>{categoryName}</span>
                  </div>

                  <div className="expense-recent-date">
                    <IoCalendarClearOutline />
                    {formatShortDate(getExpenseDate(item))}
                  </div>

                  <div className="expense-recent-side">
                    <b>-{money(item.amount)}</b>

                    <div className="expense-row-actions">
                      <button type="button" onClick={() => editExpense(item)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => deleteExpense(item._id, item.isPendingSync)}
                      >
                        Delete
                      </button>
                      <IoChevronForward />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="expense-bottom-space" />
    </div>
  );
}  