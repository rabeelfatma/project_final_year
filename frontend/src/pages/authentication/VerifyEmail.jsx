import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Button from "../../components/ui/Button";
import Alert from "../../components/ui/Alert";
import InputField from "../../components/ui/InputField";
import { validateEmail } from "../../utils/validators";
import { getApiBaseUrl } from "../../utils/apiBase";

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const tokenFromQuery = String(searchParams.get("token") || "").trim();
  const emailFromQuery = String(searchParams.get("email") || "").trim();

  const [status, setStatus] = useState(tokenFromQuery ? "verifying" : "idle");
  const [msg, setMsg] = useState("");
  const [resendEmail, setResendEmail] = useState(emailFromQuery);
  const [resending, setResending] = useState(false);
  const verifyStarted = useRef(false);
  const resendLock = useRef(false);

  useEffect(() => {
    if (!tokenFromQuery || verifyStarted.current) return;
    verifyStarted.current = true;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/auth/verify-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: tokenFromQuery }),
        });
        let data = {};
        try {
          data = await res.json();
        } catch {
          data = {};
        }
        if (cancelled) return;
        if (!res.ok) {
          setStatus("error");
          setMsg(data.message || "This verification link is invalid or has expired.");
          return;
        }
        setStatus("success");
        // Single success surface — do not also echo into Alert below.
        setMsg("");
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMsg("Server unavailable. Please try again later.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tokenFromQuery]);

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
      setMsg(
        data.message ||
          "If an unverified registration exists for that email, a new verification link will be sent shortly."
      );
      if (res.ok) setStatus("idle");
    } catch {
      setMsg("Server unavailable. Please try again later.");
    } finally {
      setResending(false);
      resendLock.current = false;
    }
  };

  return (
    <div className="qc-auth-shell">
      <div className="qc-auth-card">
        <div className="text-center mb-7">
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

        {(status === "error" || status === "idle") && (
          <form onSubmit={handleResend} noValidate className="space-y-4">
            <p className="text-xs text-[var(--text-faint)] text-center">
              {tokenFromQuery
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
