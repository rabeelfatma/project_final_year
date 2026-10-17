import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import InputField from "../../components/ui/InputField";
import Button from "../../components/ui/Button";
import Alert from "../../components/ui/Alert";
import { validateEmail } from "../../utils/validators";
import { getApiBaseUrl } from "../../utils/apiBase";

function messageForSignupConflict(data) {
  const code = data?.code;
  if (code === "PENDING_VERIFICATION") {
    return (
      data.message ||
      "A registration with this email is awaiting email verification. Use Resend Verification Email if you did not receive the link."
    );
  }
  if (code === "PENDING_APPROVAL") {
    return (
      data.message ||
      "A registration with this email is awaiting administrator approval."
    );
  }
  if (code === "ALREADY_REGISTERED") {
    return (
      data.message ||
      "An account with this email already exists. Sign in or use Forgot Password."
    );
  }
  if (code === "REGISTRATION_REJECTED") {
    return (
      data.message ||
      "This registration request was previously declined. Contact an administrator if you need help."
    );
  }
  return data?.message || "Unable to submit registration request.";
}

export default function PublicSignup() {
  const navigate = useNavigate();
  const submitLock = useRef(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "student",
  });
  const [msg, setMsg] = useState("");
  const [success, setSuccess] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [conflictCode, setConflictCode] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitLock.current || submitting || success) return;
    setMsg("");
    setConflictCode("");

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

    submitLock.current = true;
    setSubmitting(true);
    let created = false;
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
        setConflictCode(data.code || "");
        return setMsg(messageForSignupConflict(data));
      }

      created = true;
      setSuccess(true);
      setSubmittedEmail(form.email.trim());
      setMsg("");
    } catch {
      setMsg("Server unavailable. Check that the backend is running and try again.");
    } finally {
      setSubmitting(false);
      // Keep lock after success to prevent accidental resubmits.
      if (!created) submitLock.current = false;
    }
  };

  return (
    <div className="qc-auth-shell">
      <div className="qc-auth-card max-w-lg">
        <div className="text-center mb-7">
          <p className="qc-auth-brand">
            QuickCheck Hub
          </p>
          <h1 className="qc-auth-title">
            Create Account
          </h1>
          <p className="qc-auth-subtitle">
            Verify your email, then wait for Admin approval
          </p>
        </div>

        {msg && <Alert message={msg} />}

        {success ? (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text)] text-center font-semibold">
              Registration submitted.
            </p>
            <p className="text-sm text-[var(--text-faint)] text-center">
              A verification link was sent to{" "}
              <span className="text-sky-400 break-all">{submittedEmail}</span>.
              Open that email and click the link. After verifying, an administrator
              must approve your account before you can sign in.
            </p>
            <Button
              text="Resend Verification Email"
              type="button"
              onClick={() =>
                navigate(
                  `/verify-email?email=${encodeURIComponent(submittedEmail)}`
                )
              }
              aria-label="Resend verification email"
            />
            <Button
              text="Back to Login"
              type="button"
              onClick={() => navigate("/login")}
            />
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
              aria-label="Submit registration request"
            />

            {(conflictCode === "PENDING_VERIFICATION" ||
              conflictCode === "PENDING_APPROVAL" ||
              conflictCode === "ALREADY_REGISTERED") && (
              <div className="mt-4 flex flex-col gap-2">
                {conflictCode === "PENDING_VERIFICATION" && (
                  <Button
                    text="Open Resend Verification"
                    type="button"
                    onClick={() =>
                      navigate(
                        `/verify-email?email=${encodeURIComponent(form.email.trim())}`
                      )
                    }
                  />
                )}
                {(conflictCode === "ALREADY_REGISTERED" ||
                  conflictCode === "PENDING_APPROVAL") && (
                  <Button
                    text="Go to Login"
                    type="button"
                    onClick={() => navigate("/login")}
                  />
                )}
              </div>
            )}

            <p className="text-center text-[var(--text-faint)] mt-6 text-[11px] font-bold uppercase tracking-[0.2em]">
              Already have an account?{" "}
              <Link to="/login" className="text-sky-400 hover:underline">
                Log In
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
