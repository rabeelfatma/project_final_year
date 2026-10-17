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
    <div className="qc-auth-shell">
      <div className="qc-auth-card">
        <div className="text-center mb-7">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-qc accent-soft accent-text mb-4">
            <Shield size={24} aria-hidden="true" />
          </span>
          <p className="qc-auth-brand">Administration Portal</p>
          <h1 className="qc-auth-title">QuickCheck Hub</h1>
          <p className="qc-auth-subtitle">
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
              className="absolute right-3 top-2.5 accent-text text-[10px] font-bold uppercase inline-flex items-center gap-1"
              aria-label={showPass ? "Hide password" : "Show password"}
            >
              {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
              {showPass ? "Hide" : "Show"}
            </button>
          </div>

          <div className="text-right mb-6">
            <Link
              to="/forgot-password"
              className="accent-text text-[11px] font-bold hover:underline opacity-90"
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
