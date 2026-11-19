import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import InputField from "../../components/ui/InputField";
import Button from "../../components/ui/Button";
import Alert from "../../components/ui/Alert";
import {
  passwordValidationMessage,
  confirmPasswordMessage,
  PASSWORD_HINT,
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

function captureResetToken() {
  const token = readTokenFromHash();
  if (!token || token.length < 32) {
    return {
      token: "",
      linkInvalid: true,
      msg: "Reset link is invalid or expired.",
    };
  }
  return { token, linkInvalid: false, msg: "" };
}

export default function ResetPassword() {
  const navigate = useNavigate();

  // Read the fragment during the first render only. The effect below deletes it,
  // and Strict Mode runs that effect again — do not re-read the hash there.
  const [captured] = useState(captureResetToken);
  const capturedTokenRef = useRef(captured.token);

  const [token, setToken] = useState(captured.token);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [msg, setMsg] = useState(captured.msg);
  const [linkInvalid, setLinkInvalid] = useState(captured.linkInvalid);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const already = capturedTokenRef.current;
    if (!already || already.length < 32) return;
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
      return setMsg("Reset link is invalid or expired.");
    }

    const passwordMessage = passwordValidationMessage(password);
    if (passwordMessage) return setMsg(passwordMessage);
    const confirmMessage = confirmPasswordMessage(password, confirmPassword);
    if (confirmMessage) return setMsg(confirmMessage);

    setBusy(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/password-reset/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password, confirmPassword }),
      });

      const data = await res.json().catch(() => ({}));

      // Rate limit is temporary — keep the form usable; do not treat as a bad link.
      if (res.status === 429) {
        return setMsg(
          data.message || "Too many requests. Please try again later."
        );
      }

      if (!res.ok) {
        if (res.status >= 500) {
          return setMsg("Something went wrong. Please try again.");
        }
        if (
          data.code === "PASSWORD_POLICY" ||
          data.code === "PASSWORD_MISMATCH" ||
          data.code === "PASSWORD_CONFIRM_REQUIRED"
        ) {
          return setMsg(data.message || "Enter a valid password.");
        }
        setLinkInvalid(true);
        return setMsg(data.message || "Reset link is invalid or expired.");
      }

      setSuccess(true);
      setPassword("");
      setConfirmPassword("");
      setToken("");
      setMsg(
        data.message || "Password reset successfully."
      );
    } catch (_) {
      setMsg("Something went wrong. Please try again.");
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

            <p className="qc-auth-password-hint" aria-label="Password requirements">
              {PASSWORD_HINT}
            </p>

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
