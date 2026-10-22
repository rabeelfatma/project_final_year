import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import InputField from "../../components/ui/InputField";
import Button from "../../components/ui/Button";
import Alert from "../../components/ui/Alert";
import {
  validatePassword,
  passwordValidationMessage,
  PASSWORD_REQUIREMENTS,
} from "../../utils/validators";
import { getApiBaseUrl } from "../../utils/apiBase";

function readTokenFromHash() {
  const raw =
    typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
  if (!raw) return "";
  try {
    return decodeURIComponent(raw).trim();
  } catch (_) {
    return raw.trim();
  }
}

export default function ResetPassword() {
  const navigate = useNavigate();

  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [msg, setMsg] = useState("");
  const [linkInvalid, setLinkInvalid] = useState(false);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = readTokenFromHash();
    if (!t || t.length < 32) {
      setLinkInvalid(true);
      setMsg("This reset link is invalid or incomplete.");
      return;
    }
    setToken(t);
    // Remove token from the address bar so it is less likely to linger in history/referrers.
    if (typeof window !== "undefined" && window.history?.replaceState) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search
      );
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setMsg("");

    if (linkInvalid || !token) {
      return setMsg("This reset link is invalid or expired.");
    }

    if (!password || !validatePassword(password)) {
      return setMsg(passwordValidationMessage(password));
    }

    if (password !== confirmPassword) {
      return setMsg("Passwords do not match");
    }

    setBusy(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/password-reset/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });

      const data = await res.json().catch(() => ({}));

      // Rate limit is temporary — keep the form usable; do not treat as a bad link.
      if (res.status === 429) {
        return setMsg(
          data.message || "Too many requests. Please try again later."
        );
      }

      if (!res.ok) {
        setLinkInvalid(true);
        return setMsg(data.message || "Invalid or expired reset link.");
      }

      setSuccess(true);
      setPassword("");
      setConfirmPassword("");
      setToken("");
      setMsg(
        data.message ||
          "Password updated successfully. You can sign in with your new password."
      );
    } catch (_) {
      setMsg("Server error. Please try again later.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="qc-auth-shell">
      <form className="qc-auth-card" onSubmit={handleSubmit} noValidate>
        <p className="qc-auth-brand text-center">QuickCheck Hub</p>
        <h2 className="qc-auth-title text-center mb-5">Reset Password</h2>

        {msg && <Alert message={msg} />}

        {!success && !linkInvalid && (
          <>
            <div className="relative">
              <label className="sr-only" htmlFor="password">
                New password
              </label>
              <InputField
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="New Password *"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-sky-400 hover:text-sky-300 text-[10px] font-bold uppercase inline-flex items-center gap-1"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            <ul
              className="mb-4 text-[11px] text-[var(--text-faint)] space-y-0.5 list-disc list-inside"
              aria-label="Password requirements"
            >
              {PASSWORD_REQUIREMENTS.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>

            <div className="relative">
              <label className="sr-only" htmlFor="confirmPassword">
                Confirm new password
              </label>
              <InputField
                name="confirmPassword"
                type={showConfirm ? "text" : "password"}
                placeholder="Confirm Password *"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={busy}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-2.5 text-sky-400 hover:text-sky-300 text-[10px] font-bold uppercase inline-flex items-center gap-1"
                aria-label={
                  showConfirm ? "Hide confirm password" : "Show confirm password"
                }
              >
                {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
                {showConfirm ? "Hide" : "Show"}
              </button>
            </div>

            <Button
              text={busy ? "Updating…" : "Update Password"}
              type="submit"
              disabled={busy}
            />
          </>
        )}

        {(success || linkInvalid) && (
          <Button
            text="Return to Login"
            type="button"
            onClick={() => navigate("/login")}
          />
        )}

        {!success && !linkInvalid && (
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="w-full mt-4 text-center text-sky-400 text-[11px] font-bold uppercase tracking-[0.2em] hover:underline"
          >
            Back to Login
          </button>
        )}
      </form>
    </div>
  );
}
