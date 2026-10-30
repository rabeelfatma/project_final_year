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
} from "../../utils/validators";
import { getApiBaseUrl } from "../../utils/apiBase";

const PASSWORD_HELPER =
  "Minimum 8 characters, including at least one uppercase letter, one lowercase letter, one number, and one special character.";

/** Conflict codes that replace the registration form with a status panel. */
const BLOCKING_STATUS_CODES = new Set([
  "PENDING_VERIFICATION",
  "PENDING_APPROVAL",
  "ALREADY_REGISTERED",
  "REGISTRATION_PERMANENTLY_REJECTED",
]);

function messageForSignupConflict(data) {
  const code = data?.code;
  if (code === "EMAIL_NOT_CONFIGURED" || code === "EMAIL_UNAVAILABLE") {
    return (
      data.message ||
      "Registration email verification is temporarily unavailable. Please try again later."
    );
  }
  if (code === "VERIFICATION_EMAIL_FAILED" || code === "EMAIL_PROVIDER_ERROR") {
    return (
      data.message ||
      "Your registration was saved, but the verification email could not be sent. Use Resend verification later or contact an administrator."
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
  if (code === "REGISTRATION_PERMANENTLY_REJECTED") {
    return (
      data.message ||
      "Reapplication is unavailable for this registration. Contact an administrator if you need help."
    );
  }
  if (code === "EMAIL_IN_USE") {
    return (
      data.message ||
      "That email address is already associated with another account."
    );
  }
  if (code === "PASSWORD_MISMATCH" || code === "PASSWORD_CONFIRM_REQUIRED") {
    return data.message || "Password confirmation does not match.";
  }
  if (code === "ADMIN_ROLE_FORBIDDEN" || code === "INVALID_ROLE") {
    return (
      data.message ||
      "Only Teacher or Student registration requests are accepted."
    );
  }
  if (code === "ACCOUNT_EMAIL_REQUIRED" || code === "NOT_FOUND") {
    return (
      data.message ||
      "Could not locate your declined registration. Start again using your original registered email, then resubmit."
    );
  }
  return data?.message || "Unable to submit registration request.";
}

function fieldErrorClass(hasError) {
  return hasError ? "qc-field-error" : "";
}

function StatusPanel({ title, children, tone = "info" }) {
  const toneClass =
    tone === "danger"
      ? "border-rose-500/30 bg-rose-500/10"
      : tone === "warning"
        ? "border-amber-500/30 bg-amber-500/10"
        : "border-sky-500/30 bg-sky-500/10";
  const titleClass =
    tone === "danger"
      ? "text-rose-300"
      : tone === "warning"
        ? "text-amber-300"
        : "text-sky-300";

  return (
    <div
      className={`rounded-xl border px-4 py-3 space-y-2 ${toneClass}`}
      role="status"
      aria-label={title}
    >
      <p className={`text-sm font-bold tracking-wide uppercase ${titleClass}`}>
        {title}
      </p>
      {children}
    </div>
  );
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
  const [reapplication, setReapplication] = useState(null);
  const [reapplyMode, setReapplyMode] = useState(false);
  const [resubmitted, setResubmitted] = useState(false);
  const [showReapplyForm, setShowReapplyForm] = useState(false);
  // Locked identity from the rejected account — never overwritten by editable form fields.
  const [lockedAccountEmail, setLockedAccountEmail] = useState("");
  const [lockedAccountId, setLockedAccountId] = useState("");

  const clearBlockingStatus = () => {
    if (BLOCKING_STATUS_CODES.has(conflictCode)) {
      setConflictCode("");
      setMsg("");
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
    if (fieldErrors[name]) {
      setFieldErrors({ ...fieldErrors, [name]: "" });
    }
    // Changing identity fields after a blocking status returns the user to a fresh attempt.
    if (name === "email" || name === "name" || name === "role") {
      clearBlockingStatus();
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

  const enterReapplyMode = (info) => {
    const originalEmail = typeof info?.email === "string" ? info.email.trim() : "";
    const originalId =
      info?.accountId != null && String(info.accountId).trim() !== ""
        ? String(info.accountId).trim()
        : "";
    setReapplication(info);
    setLockedAccountEmail(originalEmail);
    setLockedAccountId(originalId);
    setReapplyMode(true);
    setShowReapplyForm(false);
    setForm((prev) => ({
      ...prev,
      name: info?.name || prev.name,
      email: originalEmail || prev.email,
      role: info?.role === "teacher" || info?.role === "student" ? info.role : prev.role,
      password: "",
      confirmPassword: "",
    }));
    setMsg("");
    setConflictCode("REAPPLICATION_AVAILABLE");
    setFieldErrors({});
  };

  const resetToFreshSignup = () => {
    setConflictCode("");
    setMsg("");
    setReapplyMode(false);
    setReapplication(null);
    setLockedAccountEmail("");
    setLockedAccountId("");
    setShowReapplyForm(false);
    setFieldErrors({});
    submitLock.current = false;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitLock.current || submitting || success || resubmitted) return;
    if (BLOCKING_STATUS_CODES.has(conflictCode)) return;
    setMsg("");
    setConflictCode("");

    if (!validateFields()) return;

    submitLock.current = true;
    setSubmitting(true);
    let created = false;
    try {
      const endpoint = reapplyMode ? "/auth/reapply" : "/auth/register-request";
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        confirmPassword: form.confirmPassword,
        role: form.role,
      };
      if (reapplyMode) {
        // Always identify the rejected account by locked original identity —
        // never by the editable form email (which may have changed).
        payload.accountEmail =
          lockedAccountEmail || reapplication?.email || "";
        if (lockedAccountId || reapplication?.accountId) {
          payload.accountId = lockedAccountId || reapplication.accountId;
        }
      }

      const res = await fetch(`${getApiBaseUrl()}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (!res.ok) {
        if (data.code === "REAPPLICATION_AVAILABLE" && data.reapplication) {
          enterReapplyMode(data.reapplication);
          return;
        }
        setConflictCode(data.code || "");
        return setMsg(messageForSignupConflict(data));
      }

      created = true;
      setSubmittedEmail(form.email.trim());
      setEmailSent(data.verificationEmailSent !== false);
      setMsg("");

      if (reapplyMode) {
        setResubmitted(true);
        setSuccess(false);
      } else {
        setSuccess(true);
      }
    } catch {
      setMsg("Server unavailable. Check that the backend is running and try again.");
    } finally {
      setSubmitting(false);
      if (!created) submitLock.current = false;
    }
  };

  const showDeclinePanel =
    reapplyMode && reapplication && !showReapplyForm && !success && !resubmitted;
  const showBlockingStatusPanel =
    !success &&
    !resubmitted &&
    !reapplyMode &&
    BLOCKING_STATUS_CODES.has(conflictCode);
  const statusEmail = form.email.trim() || submittedEmail;

  return (
    <div className="qc-auth-shell">
      <div className="qc-auth-card">
        <div className="text-center mb-3">
          <p className="qc-auth-brand">QuickCheck Hub</p>
          <h1 className="qc-auth-title">
            {reapplyMode ? "Resubmit Registration" : "Create Account"}
          </h1>
          <p className="qc-auth-subtitle">
            {reapplyMode
              ? "Correct your information and request approval again"
              : showBlockingStatusPanel
                ? "Review your registration status"
                : "Verify your email, then wait for Admin approval"}
          </p>
        </div>

        {msg && !showBlockingStatusPanel && <Alert message={msg} />}

        {resubmitted ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--text)] text-center font-semibold">
              Your application has been resubmitted successfully. It is now
              pending administrator review.
            </p>
            {emailSent ? (
              <p className="text-sm text-[var(--text-faint)] text-center">
                A verification link was sent to{" "}
                <span className="text-sky-400 break-words">{submittedEmail}</span>.
                Verify your email, then wait for Admin approval before signing
                in.
              </p>
            ) : (
              <p className="text-sm text-[var(--text-faint)] text-center">
                Your resubmission for{" "}
                <span className="text-sky-400 break-words">{submittedEmail}</span>{" "}
                was saved, but the verification email could not be sent. Use
                Resend Verification Email when email delivery is available.
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
        ) : success ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--text)] text-center font-semibold">
              Registration submitted.
            </p>
            {emailSent ? (
              <p className="text-sm text-[var(--text-faint)] text-center">
                A verification link was sent to{" "}
                <span className="text-sky-400 break-words">{submittedEmail}</span>.
                Open that email and click the link. After verifying, an
                administrator must approve your account before you can sign in.
              </p>
            ) : (
              <p className="text-sm text-[var(--text-faint)] text-center">
                Your registration for{" "}
                <span className="text-sky-400 break-words">{submittedEmail}</span>{" "}
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
        ) : showDeclinePanel ? (
          <div className="space-y-4">
            <StatusPanel title="Registration Request Declined" tone="danger">
              <p className="text-sm text-[var(--text-faint)]">
                Your previous application was declined. You can review your
                information, make the necessary corrections, and submit a new
                request for approval.
              </p>
              {reapplication.rejectionReason ? (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                    Previous rejection reason
                  </p>
                  <p className="text-sm text-[var(--text)] whitespace-pre-wrap">
                    {reapplication.rejectionReason}
                  </p>
                </div>
              ) : null}
              <dl className="grid grid-cols-1 gap-1.5 text-sm">
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                    Registered email
                  </dt>
                  <dd className="text-sky-400 break-words">
                    {lockedAccountEmail || reapplication.email}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                    Requested role
                  </dt>
                  <dd className="uppercase tracking-wide text-[var(--text)] font-semibold">
                    {reapplication.role}
                  </dd>
                </div>
              </dl>
            </StatusPanel>

            <Button
              text="Resubmit Registration Request"
              type="button"
              onClick={() => setShowReapplyForm(true)}
              aria-label="Resubmit registration request"
            />
            <Button
              text="Back to Login"
              type="button"
              onClick={() => navigate("/login")}
            />
          </div>
        ) : showBlockingStatusPanel ? (
          <div className="space-y-4" data-signup-status={conflictCode}>
            {conflictCode === "PENDING_VERIFICATION" && (
              <StatusPanel title="Email Verification Required" tone="warning">
                <p className="text-sm text-[var(--text-faint)]">
                  A registration with this email is awaiting email verification.
                  Use Resend Verification Email if you did not receive the link.
                  You cannot submit another registration request for this email.
                </p>
                {statusEmail ? (
                  <p className="text-sm">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500 block mb-1">
                      Registered email
                    </span>
                    <span className="text-sky-400 break-words">{statusEmail}</span>
                  </p>
                ) : null}
              </StatusPanel>
            )}

            {conflictCode === "PENDING_APPROVAL" && (
              <StatusPanel title="Awaiting Administrator Approval" tone="info">
                <p className="text-sm text-[var(--text-faint)]">
                  A registration with this email is awaiting administrator
                  approval. You will be notified when a decision is made. Do not
                  submit another registration request.
                </p>
                {statusEmail ? (
                  <p className="text-sm">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500 block mb-1">
                      Registered email
                    </span>
                    <span className="text-sky-400 break-words">{statusEmail}</span>
                  </p>
                ) : null}
              </StatusPanel>
            )}

            {conflictCode === "ALREADY_REGISTERED" && (
              <StatusPanel title="Account Already Exists" tone="info">
                <p className="text-sm text-[var(--text-faint)]">
                  An account with this email already exists. Sign in or use
                  Forgot Password if you need access. Registration and
                  reapplication are not available for approved accounts.
                </p>
              </StatusPanel>
            )}

            {conflictCode === "REGISTRATION_PERMANENTLY_REJECTED" && (
              <StatusPanel title="Reapplication Unavailable" tone="danger">
                <p className="text-sm text-[var(--text-faint)]">
                  Reapplication is unavailable for this registration. Contact an
                  administrator if you need help.
                </p>
              </StatusPanel>
            )}

            {conflictCode === "PENDING_VERIFICATION" && (
              <Button
                text="Resend Verification Email"
                type="button"
                onClick={() =>
                  navigate(
                    `/verify-email?email=${encodeURIComponent(statusEmail)}`
                  )
                }
                aria-label="Resend verification email"
              />
            )}

            {(conflictCode === "ALREADY_REGISTERED" ||
              conflictCode === "PENDING_APPROVAL" ||
              conflictCode === "REGISTRATION_PERMANENTLY_REJECTED" ||
              conflictCode === "PENDING_VERIFICATION") && (
              <Button
                text="Back to Login"
                type="button"
                onClick={() => navigate("/login")}
              />
            )}

            <button
              type="button"
              className="w-full text-center text-[11px] font-bold uppercase tracking-[0.2em] text-sky-400 hover:underline"
              onClick={resetToFreshSignup}
            >
              Try a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-0">
            {reapplyMode && reapplication?.rejectionReason && (
              <div className="mb-3 rounded-xl border border-rose-500/25 bg-rose-500/8 px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">
                  Previous rejection reason
                </p>
                <p className="text-sm text-[var(--text)] whitespace-pre-wrap">
                  {reapplication.rejectionReason}
                </p>
              </div>
            )}

            <div className={`mb-0.5 ${fieldErrorClass(Boolean(fieldErrors.name))}`}>
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
              <p className="qc-field-error-text" role="alert">
                {fieldErrors.name}
              </p>
            )}

            <div className={`mb-0.5 ${fieldErrorClass(Boolean(fieldErrors.email))}`}>
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
              <p className="qc-field-error-text" role="alert">
                {fieldErrors.email}
              </p>
            )}
            {reapplyMode && (
              <p className="mb-2 text-[11px] text-[var(--text-faint)] leading-snug">
                Your original account (
                <span className="text-sky-400 break-words">
                  {lockedAccountEmail || reapplication?.email}
                </span>
                ) will be updated. A changed email stays pending until verified.
              </p>
            )}

            <div className="relative mb-0.5">
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
              <p className="qc-field-error-text" role="alert">
                {fieldErrors.password}
              </p>
            )}
            <p
              className="mb-2 text-[11px] text-[var(--text-faint)] leading-snug break-words"
              aria-label="Password requirements"
            >
              {PASSWORD_HELPER}
            </p>

            <div className={`mb-0.5 ${fieldErrorClass(Boolean(fieldErrors.confirmPassword))}`}>
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
              <p className="qc-field-error-text" role="alert">
                {fieldErrors.confirmPassword}
              </p>
            )}

            <fieldset className="mb-3 mt-1">
              <legend className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                Requested Role *
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {["teacher", "student"].map((role) => (
                  <label
                    key={role}
                    className={`cursor-pointer rounded-xl border px-3 py-2 text-center text-xs font-black uppercase tracking-widest transition-all ${
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
              {reapplyMode && (
                <p className="mt-1.5 text-[11px] text-[var(--text-faint)] leading-snug">
                  You may switch between Teacher and Student when resubmitting.
                </p>
              )}
              {fieldErrors.role && (
                <p className="qc-field-error-text mt-1.5" role="alert">
                  {fieldErrors.role}
                </p>
              )}
            </fieldset>

            <div className="qc-auth-submit">
              <Button
                text={
                  submitting
                    ? reapplyMode
                      ? "Resubmitting…"
                      : "Submitting…"
                    : reapplyMode
                      ? "Resubmit Registration Request"
                      : "Submit Registration Request"
                }
                type="submit"
                disabled={submitting}
                aria-label={
                  reapplyMode
                    ? "Resubmit registration request"
                    : "Submit registration request"
                }
              />
            </div>

            {(conflictCode === "EMAIL_NOT_CONFIGURED" ||
              conflictCode === "EMAIL_UNAVAILABLE" ||
              conflictCode === "EMAIL_PROVIDER_ERROR") && (
              <div className="mt-3">
                <p className="text-xs text-[var(--text-faint)] text-center">
                  Email verification is temporarily unavailable. Try again later.
                </p>
              </div>
            )}

            <p className="text-center text-[var(--text-faint)] mt-3 text-[11px] font-bold uppercase tracking-[0.2em]">
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
