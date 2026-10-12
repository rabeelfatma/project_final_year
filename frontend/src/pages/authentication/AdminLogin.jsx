import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Shield } from "lucide-react";
import InputField from "../../components/ui/InputField";
import Button from "../../components/ui/Button";
import Alert from "../../components/ui/Alert";
import { validateEmail } from "../../utils/validators";
import { getApiBaseUrl } from "../../utils/apiBase";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [msg, setMsg] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const role = String(localStorage.getItem("role") || "").toLowerCase();
    if (token && role === "admin") {
      navigate("/dashboard/admin", { replace: true });
    }
  }, [navigate]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setMsg("");

    if (!form.email) return setMsg("Email address is required.");
    if (!validateEmail(form.email)) return setMsg("Enter a valid email address.");
    if (!form.password) return setMsg("Password is required.");

    setSubmitting(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password,
          role: "admin",
        }),
      });

      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (!res.ok) {
        return setMsg(data.message || "Invalid email or password.");
      }

      const authenticatedRole = String(data.role || "").toLowerCase();
      if (authenticatedRole !== "admin") {
        localStorage.clear();
        return setMsg("Admin access denied for this account.");
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("role", "admin");
      localStorage.setItem("userName", data.name || "");
      localStorage.setItem("userRegNo", data.regNo || "");

      navigate("/dashboard/admin", { replace: true });
    } catch {
      setMsg("Server unavailable. Check that the backend is running and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-[var(--bg)] min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[var(--bg-secondary)] border border-sky-400/70 p-6 sm:p-8 rounded-2xl shadow-xl">
        <div className="text-center mb-8">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400 mb-4">
            <Shield size={24} aria-hidden="true" />
          </span>
          <h1 className="text-[var(--text)] text-3xl font-black tracking-tight">
            QuickCheck Hub
          </h1>
          <p className="text-sky-400 text-sm font-bold uppercase tracking-[0.2em] mt-2">
            Administration Portal
          </p>
          <p className="text-[var(--text-faint)] mt-2 text-sm">
            Sign in with your administrator credentials
          </p>
        </div>

        {msg && <Alert message={msg} />}

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-4">
            <label className="sr-only" htmlFor="admin-email">
              Email Address
            </label>
            <InputField
              name="email"
              type="email"
              placeholder="EMAIL ADDRESS"
              value={form.email}
              onChange={handleChange}
            />
          </div>

          <div className="relative mb-2">
            <label className="sr-only" htmlFor="admin-password">
              Password
            </label>
            <InputField
              name="password"
              type={showPass ? "text" : "password"}
              placeholder="PASSWORD"
              value={form.password}
              onChange={handleChange}
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-3 top-2.5 text-sky-400 hover:text-sky-300 text-[10px] font-bold uppercase inline-flex items-center gap-1"
              aria-label={showPass ? "Hide password" : "Show password"}
            >
              {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
              {showPass ? "Hide" : "Show"}
            </button>
          </div>

          <div className="text-right mb-6">
            <Link
              to="/forgot-password"
              className="text-sky-400 text-[11px] font-bold hover:underline opacity-90"
            >
              Forgot Password?
            </Link>
          </div>

          <Button
            text={submitting ? "Signing in…" : "Sign In as Admin"}
            type="submit"
            disabled={submitting}
          />
        </form>
      </div>
    </div>
  );
}
