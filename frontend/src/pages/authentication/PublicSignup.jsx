import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import InputField from "../../components/ui/InputField";
import Button from "../../components/ui/Button";
import Alert from "../../components/ui/Alert";
import { validateEmail } from "../../utils/validators";
import { getApiBaseUrl } from "../../utils/apiBase";

export default function PublicSignup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "student",
  });
  const [msg, setMsg] = useState("");
  const [success, setSuccess] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting || success) return;
    setMsg("");

    if (!form.name.trim() || form.name.trim().length < 2) {
      return setMsg("Full name is required.");
    }
    if (!form.email) return setMsg("Email address is required.");
    if (!validateEmail(form.email)) return setMsg("Enter a valid email address.");
    if (!form.password) return setMsg("Password is required.");
    if (form.password.length < 6) {
      return setMsg("Password must be at least 6 characters.");
    }
    if (form.password !== form.confirmPassword) {
      return setMsg("Password confirmation does not match.");
    }
    if (form.role !== "teacher" && form.role !== "student") {
      return setMsg("Select Teacher or Student.");
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/register-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
        }),
      });

      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (!res.ok) {
        return setMsg(data.message || "Unable to submit registration request.");
      }

      setSuccess(true);
      setMsg(
        data.message ||
          "Your registration request has been submitted. Please verify your email, then wait for Admin approval before logging in."
      );
    } catch {
      setMsg("Server unavailable. Check that the backend is running and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-[var(--bg)] min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[var(--bg-secondary)] border border-sky-400/70 p-6 sm:p-8 rounded-2xl shadow-xl">
        <div className="text-center mb-8">
          <p className="text-sky-400 text-xs font-bold uppercase tracking-[0.25em] mb-2">
            QuickCheck Hub
          </p>
          <h1 className="text-[var(--text)] text-3xl font-black tracking-tight">
            Create Account
          </h1>
          <p className="text-[var(--text-faint)] mt-2 text-sm">
            Verify your email, then wait for Admin approval
          </p>
        </div>

        {msg && <Alert message={msg} />}

        {success ? (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-faint)] text-center">
              Check your inbox for a verification link. After verifying, an administrator
              must approve your account before you can sign in.
            </p>
            <Button
              text="Open Verify Email Page"
              type="button"
              onClick={() => navigate("/verify-email")}
            />
            <Button text="Back to Login" type="button" onClick={() => navigate("/login")} />
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <InputField
              name="name"
              type="text"
              placeholder="FULL NAME"
              value={form.name}
              onChange={handleChange}
            />
            <InputField
              name="email"
              type="email"
              placeholder="EMAIL ADDRESS"
              value={form.email}
              onChange={handleChange}
            />

            <div className="relative">
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

            <InputField
              name="confirmPassword"
              type={showPass ? "text" : "password"}
              placeholder="CONFIRM PASSWORD"
              value={form.confirmPassword}
              onChange={handleChange}
            />

            <fieldset className="mb-6">
              <legend className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                Requested Role
              </legend>
              <div className="grid grid-cols-2 gap-3">
                {["teacher", "student"].map((role) => (
                  <label
                    key={role}
                    className={`cursor-pointer rounded-xl border px-3 py-3 text-center text-xs font-black uppercase tracking-widest transition-all ${
                      form.role === role
                        ? "border-sky-400 bg-sky-500/15 text-sky-300"
                        : "border-slate-700 text-slate-400 hover:border-sky-500/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={role}
                      checked={form.role === role}
                      onChange={handleChange}
                      className="sr-only"
                    />
                    {role}
                  </label>
                ))}
              </div>
            </fieldset>

            <Button
              text={submitting ? "Submitting…" : "Submit Registration Request"}
              type="submit"
              disabled={submitting}
            />

            <p className="text-center text-[var(--text-faint)] mt-6 text-[11px] font-bold uppercase tracking-[0.2em]">
              Already registered?{" "}
              <Link to="/login" className="text-sky-400 hover:underline">
                Back to Login
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
