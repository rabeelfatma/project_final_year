import { useState } from "react";
import { useNavigate } from "react-router-dom";
import InputField from "../../components/ui/InputField";
import Button from "../../components/ui/Button";
import Alert from "../../components/ui/Alert";
import { emailValidationMessage } from "../../utils/validators";
import { getApiBaseUrl } from "../../utils/apiBase";

export default function ForgotPassword() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg("");

    const emailMessage = emailValidationMessage(email);
    if (emailMessage) return setMsg(emailMessage);

    setBusy(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/password-reset/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 429) {
        return setMsg(data.message || "Too many requests. Please try again later.");
      }

      if (res.status === 503) {
        return setMsg(
          data.message ||
            "Password recovery is temporarily unavailable. Please try again later."
        );
      }

      if (!res.ok && res.status !== 200) {
        if (res.status >= 500) {
          return setMsg("Something went wrong. Please try again.");
        }
        return setMsg(data.message || "Enter a valid email.");
      }

      // Generic confirmation regardless of whether the account exists.
      setSent(true);
      setMsg(
        data.message || "If the account exists, a reset link has been sent."
      );
    } catch (_) {
      setMsg("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="qc-auth-shell">
      <form
        className="qc-auth-card"
        onSubmit={handleSubmit}
      >
        <p className="qc-auth-brand text-center">QuickCheck Hub</p>
        <h2 className="qc-auth-title text-center mb-2">
          Forgot Password
        </h2>

        <p className="qc-auth-subtitle text-center mb-5">
          Enter your email. If the account exists, a reset link will be sent.
        </p>

        {msg && <Alert message={msg} />}

        {!sent && (
          <>
            <InputField
              name="email"
              type="email"
              placeholder="Enter Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />

            <Button
              text={busy ? "Sending…" : "Send Reset Link"}
              type="submit"
              disabled={busy}
            />
          </>
        )}

        <button
          type="button"
          onClick={() => navigate("/login")}
          className="w-full mt-4 text-center accent-text text-[11px] font-bold uppercase tracking-[0.2em] hover:underline"
        >
          Back to Login
        </button>
      </form>
    </div>
  );
}
