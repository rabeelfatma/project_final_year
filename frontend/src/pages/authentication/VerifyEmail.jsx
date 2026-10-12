import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Button from "../../components/ui/Button";
import Alert from "../../components/ui/Alert";
import InputField from "../../components/ui/InputField";
import { validateEmail } from "../../utils/validators";
import { getApiBaseUrl } from "../../utils/apiBase";

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const tokenFromQuery = String(searchParams.get("token") || "").trim();

  const [status, setStatus] = useState(tokenFromQuery ? "verifying" : "idle");
  const [msg, setMsg] = useState("");
  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!tokenFromQuery) return;

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
        setMsg(
          data.message ||
            "Email verified successfully. Your account is awaiting Admin approval."
        );
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
    if (resending) return;
    setMsg("");
    if (!resendEmail || !validateEmail(resendEmail)) {
      return setMsg("Enter a valid email address.");
    }
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
    }
  };

  return (
    <div className="bg-[var(--bg)] min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[var(--bg-secondary)] border border-sky-400/70 p-6 sm:p-8 rounded-2xl shadow-xl">
        <div className="text-center mb-8">
          <p className="text-sky-400 text-xs font-bold uppercase tracking-[0.25em] mb-2">
            QuickCheck Hub
          </p>
          <h1 className="text-[var(--text)] text-3xl font-black tracking-tight">
            Verify Email
          </h1>
          <p className="text-[var(--text-faint)] mt-2 text-sm">
            Confirm your email to continue registration review
          </p>
        </div>

        {msg && <Alert message={msg} />}

        {status === "verifying" && (
          <p className="text-center text-sm text-sky-400 font-bold uppercase tracking-widest animate-pulse">
            Verifying…
          </p>
        )}

        {status === "success" && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-faint)] text-center">
              Email verified successfully. Your account is awaiting Admin approval.
            </p>
            <Link to="/login">
              <Button text="Back to Login" type="button" />
            </Link>
          </div>
        )}

        {(status === "error" || status === "idle") && (
          <form onSubmit={handleResend} noValidate className="space-y-4">
            <p className="text-xs text-[var(--text-faint)] text-center">
              Need a new link? Enter the email you used to register.
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
