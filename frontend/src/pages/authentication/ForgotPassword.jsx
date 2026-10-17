import { useState } from "react";
import { useNavigate } from "react-router-dom";
import InputField from "../../components/ui/InputField";
import Button from "../../components/ui/Button";
import Alert from "../../components/ui/Alert";
import { validateEmail } from "../../utils/validators";
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

    if (!email) {
      return setMsg("Email is required");
    }

    if (!validateEmail(email)) {
      return setMsg("Invalid email format");
    }

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
        return setMsg(data.message || "Unable to process request");
      }

      // Generic confirmation regardless of whether the account exists.
      setSent(true);
      setMsg(
        data.message ||
          "If an account exists for that email, password reset instructions will be sent shortly."
      );
    } catch (_) {
      setMsg("Server error. Please try again later.");
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
          Enter your registered email. If an account exists, we will send a reset link.
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
