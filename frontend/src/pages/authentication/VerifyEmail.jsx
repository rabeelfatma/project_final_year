import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Button from "../../components/ui/Button";
import Alert from "../../components/ui/Alert";
import InputField from "../../components/ui/InputField";
import { validateEmail } from "../../utils/validators";
import { getApiBaseUrl } from "../../utils/apiBase";

function statusFromQueryParam(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "success") return "success";
  if (value === "expired") return "expired";
  if (value === "used" || value === "invalid" || value === "error") {
    return "error";
  }
  return null;
}

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const redirectStatus = statusFromQueryParam(searchParams.get("status"));
  const tokenFromQuery = String(searchParams.get("token") || "").trim();
  const emailFromQuery = String(searchParams.get("email") || "").trim();

  const [status, setStatus] = useState(() => {
    if (redirectStatus === "success") return "success";
    if (redirectStatus === "expired") return "expired";
    if (redirectStatus === "error") return "error";
    if (tokenFromQuery) return "verifying";
    return "idle";
  });
  const [msg, setMsg] = useState(() => {
    if (redirectStatus === "expired") {
      return "This verification link has expired. Request a new verification email below.";
    }
    if (redirectStatus === "error") {
      return "This verification link is invalid or has expired.";
    }
    return "";
  });
  const [resendEmail, setResendEmail] = useState(emailFromQuery);
  const [resending, setResending] = useState(false);
  // Tracks in-flight token only; reset on cleanup so React Strict Mode remounts retry.
  const verifyStarted = useRef(null);
  const resendLock = useRef(false);

  useEffect(() => {
    // Server-owned email flow redirects here with ?status= — no token, no API call.
    if (redirectStatus) return;
    if (!tokenFromQuery) return;
    if (verifyStarted.current === tokenFromQuery) return;
    verifyStarted.current = tokenFromQuery;

    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      try {
        // Legacy FE links (?token=) still POST to the API. Prefer new email links
        // that hit GET /api/auth/verify-email on the backend (no client secret).
        const res = await fetch(`${getApiBaseUrl()}/auth/verify-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: tokenFromQuery }),
          signal: controller.signal,
        });
        let data = {};
        try {
          data = await res.json();
        } catch {
          data = {};
        }
        if (cancelled) return;
        if (!res.ok) {
          if (data.code === "TOKEN_EXPIRED") {
            setStatus("expired");
          } else {
            setStatus("error");
          }
          setMsg(
            data.message ||
              "This verification link is invalid or has expired."
          );
          return;
        }
        setStatus("success");
        // Single success surface — do not also echo into Alert below.
        setMsg("");
      } catch (err) {
        if (cancelled || err?.name === "AbortError") return;
        setStatus("error");
        setMsg("Server unavailable. Please try again later.");
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      // Allow Strict Mode remount to start a fresh request; backend is idempotent.
      if (verifyStarted.current === tokenFromQuery) {
        verifyStarted.current = null;
      }
    };
  }, [tokenFromQuery, redirectStatus]);

  const handleResend = async (e) => {
    e.preventDefault();
    if (resendLock.current || resending) return;
    setMsg("");
    if (!resendEmail || !validateEmail(resendEmail)) {
      return setMsg("Enter a valid email address.");
    }
    resendLock.current = true;
    setResending(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resendEmail.trim() }),
      });
      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }
      if (!res.ok) {
        if (
          data.code === "EMAIL_NOT_CONFIGURED" ||
          data.code === "EMAIL_UNAVAILABLE"
        ) {
          setMsg(
            data.message ||
              "Email verification is temporarily unavailable. Please try again later."
          );
        } else if (
          data.code === "EMAIL_PROVIDER_ERROR" ||
          data.code === "VERIFICATION_EMAIL_FAILED"
        ) {
          setMsg(
            data.message ||
              "Email verification is temporarily unavailable. Please try again later."
          );
        } else {
          setMsg(
            data.message ||
              "Unable to resend verification email. Please try again later."
          );
        }
      } else {
        setMsg(
          data.message ||
            "If an unverified registration exists for that email, a new verification link will be sent shortly."
        );
        setStatus("idle");
      }
    } catch {
      setMsg("Server unavailable. Please try again later.");
    } finally {
      setResending(false);
      resendLock.current = false;
    }
  };

  const showResendForm =
    status === "error" || status === "idle" || status === "expired";

  return (
    <div className="qc-auth-shell">
      <div className="qc-auth-card">
        <div className="text-center mb-4">
          <p className="qc-auth-brand">
            QuickCheck Hub
          </p>
          <h1 className="qc-auth-title">
            Verify Email
          </h1>
          <p className="qc-auth-subtitle">
            Confirm your email to continue registration review
          </p>
        </div>

        {msg && status !== "success" && <Alert message={msg} />}

        {status === "verifying" && (
          <p className="text-center text-sm text-sky-400 font-bold uppercase tracking-widest animate-pulse">
            Verifying…
          </p>
        )}

        {status === "success" && (
          <div className="space-y-4">
            <p className="text-sm text-emerald-400 text-center font-semibold">
              Email verified successfully.
            </p>
            <p className="text-sm text-[var(--text-faint)] text-center">
              Your account is awaiting Admin approval. You will be able to sign in
              after an administrator approves your request.
            </p>
            <Link to="/login">
              <Button text="Back to Login" type="button" />
            </Link>
          </div>
        )}

        {status === "expired" && (
          <p className="text-sm text-amber-400 text-center font-semibold mb-4">
            This verification link has expired. Request a new link below.
          </p>
        )}

        {showResendForm && (
          <form onSubmit={handleResend} noValidate className="space-y-4">
            <p className="text-xs text-[var(--text-faint)] text-center">
              {tokenFromQuery || redirectStatus
                ? "Need a new link? Enter the email you used to register."
                : "Enter the email you used to register to resend the verification link."}
            </p>
            <InputField
              name="email"
              type="email"
              placeholder="EMAIL ADDRESS"
              value={resendEmail}
              onChange={(e) => setResendEmail(e.target.value)}
            />
            <Button
              text={resending ? "Sending…" : "Resend Verification Email"}
              type="submit"
              disabled={resending}
              aria-label="Resend verification email"
            />
            <p className="text-center text-[11px] font-bold uppercase tracking-widest text-[var(--text-faint)]">
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
