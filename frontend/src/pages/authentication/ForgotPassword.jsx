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
    <div className="bg-[var(--bg)] min-h-screen flex justify-center items-center p-4">
      <form
        className="bg-[var(--bg-secondary)] p-6 sm:p-8 w-full max-w-md border border-sky-400 rounded-xl"
        onSubmit={handleSubmit}
      >
        <h2 className="text-sky-400 text-center mb-5 text-xl font-bold">
          Forgot Password
        </h2>

        <p className="text-[var(--text)] text-sm opacity-80 mb-4 text-center">
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
          className="w-full mt-4 text-center text-sky-400 text-[11px] font-bold uppercase tracking-[0.2em] hover:underline"
        >
          Back to Login
        </button>
      </form>
    </div>
  );
}
