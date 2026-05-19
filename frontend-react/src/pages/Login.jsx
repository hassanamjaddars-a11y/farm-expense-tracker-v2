import { useState } from "react";
import { Navigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";

const getDefaultMode = () => {
  const savedMode = localStorage.getItem("farm_auth_mode");

  if (savedMode === "login" || savedMode === "register") {
    return savedMode;
  }

  return "login";
};

export default function Login() {
  const { login, register, isAuthenticated, authLoading } = useAuth();

  const [mode, setMode] = useState(getDefaultMode);
  const [form, setForm] = useState({
    name: "",
    email: localStorage.getItem("farm_last_email") || "",
    password: "",
  });
  const [saving, setSaving] = useState(false);

  if (!authLoading && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((prev) => ({ ...prev, [name]: value }));

    if (name === "email") {
      localStorage.setItem("farm_last_email", value);
    }
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    localStorage.setItem("farm_auth_mode", nextMode);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setSaving(true);

      if (mode === "register") {
        await register(form);
        localStorage.setItem("farm_auth_mode", "login");
        localStorage.setItem("farm_last_email", form.email);
        toast.success("Account created successfully");
      } else {
        await login({
          email: form.email,
          password: form.password,
        });

        localStorage.setItem("farm_auth_mode", "login");
        localStorage.setItem("farm_last_email", form.email);
        toast.success("Login successful");
      }
    } catch (err) {
      console.error("Auth submit error:", err);
      toast.error(err?.response?.data?.error || "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="auth-shell">
      <section className="auth-panel">
        <div className="auth-hero">
          <div className="auth-kicker">🔐 Secure farm access</div>
          <h2 className="auth-title">
            {mode === "register"
              ? "Create your premium farm workspace"
              : "Welcome back to your farm workspace"}
          </h2>
          <p className="auth-text">
            Manage expenses, worker payments, categories, and reports in one cleaner,
            faster, more professional mobile experience.
          </p>

          <div className="auth-feature-grid">
            <div className="auth-feature-card">
              <strong>Private account access</strong>
              <p>Your farm data stays connected to your own secure login.</p>
            </div>

            <div className="auth-feature-card">
              <strong>Offline-friendly flow</strong>
              <p>Your saved session and local farm data can still help you open faster.</p>
            </div>

            <div className="auth-feature-card">
              <strong>Built for daily use</strong>
              <p>Quick entry, worker control, reports, and future PWA install support.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="auth-form-panel">
        <div className="auth-switch-row">
          <button
            type="button"
            className={`auth-switch-btn ${mode === "login" ? "active" : ""}`}
            onClick={() => switchMode("login")}
          >
            Login
          </button>

          <button
            type="button"
            className={`auth-switch-btn ${mode === "register" ? "active" : ""}`}
            onClick={() => switchMode("register")}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === "register" && (
            <div>
              <label className="form-label">Full name</label>
              <div className="input-shell">
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="Enter your full name"
                />
              </div>
            </div>
          )}

          <div>
            <label className="form-label">Email address</label>
            <div className="input-shell">
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="Enter your email"
              />
            </div>
          </div>

          <div>
            <label className="form-label">Password</label>
            <div className="input-shell">
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder={
                  mode === "register" ? "Create a strong password" : "Enter your password"
                }
              />
            </div>
          </div>

          <button type="submit" className="auth-submit" disabled={saving}>
            {saving
              ? mode === "register"
                ? "Creating account..."
                : "Logging in..."
              : mode === "register"
              ? "Create account"
              : "Login now"}
          </button>
        </form>

        <div className="auth-note">
          {mode === "register"
            ? "After account creation, the app will keep login as the default mode for future visits."
            : "Your last email stays saved to make future logins faster and easier."}
        </div>

        <p className="auth-footnote">
          This screen is now cleaner, more premium, and more practical for real users.
        </p>
      </section>
    </div>
  );
}