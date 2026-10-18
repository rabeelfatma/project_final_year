import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import InputField from "../../components/ui/InputField";
import Button from "../../components/ui/Button";
import Alert from "../../components/ui/Alert";
import {
  validateEmail,
  validatePassword,
  passwordValidationMessage,
  PASSWORD_REQUIREMENTS,
} from "../../utils/validators";
import { getApiBaseUrl } from "../../utils/apiBase";

function messageForSignupConflict(data) {
  const code = data?.code;
  if (code === "EMAIL_NOT_CONFIGURED") {
    return (
      data.message ||
      "Registration email verification is temporarily unavailable. Please try again later."
    );
  }
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

function fieldErrorClass(hasError) {
  return hasError ? "ring-1 ring-rose-400/80 rounded-qc" : "";
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
  const [fieldErrors, setFieldErrors] = useState({});
  const [msg, setMsg] = useState("");
  const [success, setSuccess] = useState(false);
  const [emailSent, setEmailSent] = useState(true);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [conflictCode, setConflictCode] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
    if (fieldErrors[name]) {
      setFieldErrors({ ...fieldErrors, [name]: "" });
    }
  };

  const validateFields = () => {
    const next = {};
    if (!form.name.trim() || form.name.trim().length < 2) {
      next.name = "Full name is required (at least 2 characters).";
    }
    if (!form.email.trim()) {
      next.email = "Email address is required.";
    } else if (!validateEmail(form.email)) {
      next.email = "Enter a valid email address.";
    }
    if (!form.password) {
      next.password = "Password is required.";
    } else if (!validatePassword(form.password)) {
      next.password = passwordValidationMessage(form.password);
    }
    if (!form.confirmPassword) {
      next.confirmPassword = "Confirm your password.";
    } else if (form.password !== form.confirmPassword) {
      next.confirmPassword = "Password confirmation does not match.";
    }
    if (form.role !== "teacher" && form.role !== "student") {
      next.role = "Select Teacher or Student.";
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitLock.current || submitting || success) return;
    setMsg("");
    setConflictCode("");

    if (!validateFields()) return;

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
      setEmailSent(data.verificationEmailSent !== false);
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
          <p className="qc-auth-brand">QuickCheck Hub</p>
          <h1 className="qc-auth-title">Create Account</h1>
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
            {emailSent ? (
              <p className="text-sm text-[var(--text-faint)] text-center">
                A verification link was sent to{" "}
                <span className="text-sky-400 break-all">{submittedEmail}</span>.
                Open that email and click the link. After verifying, an
                administrator must approve your account before you can sign in.
              </p>
            ) : (
              <p className="text-sm text-[var(--text-faint)] text-center">
                Your registration for{" "}
                <span className="text-sky-400 break-all">{submittedEmail}</span>{" "}
                was saved, but the verification email could not be sent. Use
                Resend Verification Email when email delivery is available, or
                contact an administrator.
              </p>
            )}
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
            <div className={`mb-1 ${fieldErrorClass(Boolean(fieldErrors.name))}`}>
              <label className="sr-only" htmlFor="name">
                Full name (required)
              </label>
              <InputField
                name="name"
                type="text"
                placeholder="FULL NAME *"
                value={form.name}
                onChange={handleChange}
                autoComplete="name"
              />
            </div>
            {fieldErrors.name && (
              <p className="mb-3 text-xs text-rose-400" role="alert">
                {fieldErrors.name}
              </p>
            )}

            <div className={`mb-1 ${fieldErrorClass(Boolean(fieldErrors.email))}`}>
              <label className="sr-only" htmlFor="email">
                Email address (required)
              </label>
              <InputField
                name="email"
                type="email"
                placeholder="EMAIL ADDRESS *"
                value={form.email}
                onChange={handleChange}
                autoComplete="email"
              />
            </div>
            {fieldErrors.email && (
              <p className="mb-3 text-xs text-rose-400" role="alert">
                {fieldErrors.email}
              </p>
            )}

            <div className="relative mb-1">
              <div className={fieldErrorClass(Boolean(fieldErrors.password))}>
                <label className="sr-only" htmlFor="password">
                  Password (required)
                </label>
                <InputField
                  name="password"
                  type={showPass ? "text" : "password"}
                  placeholder="PASSWORD *"
                  value={form.password}
                  onChange={handleChange}
                  autoComplete="new-password"
                />
              </div>
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
            {fieldErrors.password && (
              <p className="mb-2 text-xs text-rose-400" role="alert">
                {fieldErrors.password}
              </p>
            )}
            <ul
              className="mb-4 text-[11px] text-[var(--text-faint)] space-y-0.5 list-disc list-inside"
              aria-label="Password requirements"
            >
              {PASSWORD_REQUIREMENTS.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>

            <div className={`mb-1 ${fieldErrorClass(Boolean(fieldErrors.confirmPassword))}`}>
              <label className="sr-only" htmlFor="confirmPassword">
                Confirm password (required)
              </label>
              <InputField
                name="confirmPassword"
                type={showPass ? "text" : "password"}
                placeholder="CONFIRM PASSWORD *"
                value={form.confirmPassword}
                onChange={handleChange}
                autoComplete="new-password"
              />
            </div>
            {fieldErrors.confirmPassword && (
              <p className="mb-4 text-xs text-rose-400" role="alert">
                {fieldErrors.confirmPassword}
              </p>
            )}

            <fieldset className="mb-6">
              <legend className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                Requested Role *
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
              {fieldErrors.role && (
                <p className="mt-2 text-xs text-rose-400" role="alert">
                  {fieldErrors.role}
                </p>
              )}
            </fieldset>

            <Button
              text={submitting ? "Submitting…" : "Submit Registration Request"}
              type="submit"
              disabled={submitting}
              aria-label="Submit registration request"
            />

            {(conflictCode === "PENDING_VERIFICATION" ||
              conflictCode === "PENDING_APPROVAL" ||
              conflictCode === "ALREADY_REGISTERED" ||
              conflictCode === "EMAIL_NOT_CONFIGURED") && (
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
