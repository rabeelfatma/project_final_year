import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import InputField from "../../components/ui/InputField";
import Button from "../../components/ui/Button";
import Alert from "../../components/ui/Alert";
import { getApiBaseUrl } from "../../utils/apiBase";

function readTokenFromHash() {
  const raw = typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
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
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg("");

    if (linkInvalid || !token) {
      return setMsg("This reset link is invalid or expired.");
    }

    if (!password || password.length < 6) {
      return setMsg("Password must be at least 6 characters");
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
    <div className="bg-[var(--bg)] min-h-screen flex justify-center items-center p-4">
      <form
        className="bg-[var(--bg-secondary)] p-6 sm:p-8 w-full max-w-md border border-sky-400 rounded-xl"
        onSubmit={handleSubmit}
      >
        <h2 className="text-sky-400 text-center mb-5 text-xl font-bold">
          Reset Password
        </h2>

        {msg && <Alert message={msg} />}

        {!success && !linkInvalid && (
          <>
            <div className="relative">
              <InputField
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="New Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
              <span
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-sky-400 cursor-pointer text-sm"
              >
                {showPassword ? "Hide" : "Show"}
              </span>
            </div>

            <div className="relative">
              <InputField
                name="confirmPassword"
                type={showConfirm ? "text" : "password"}
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={busy}
              />
              <span
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-3 text-sky-400 cursor-pointer text-sm"
              >
                {showConfirm ? "Hide" : "Show"}
              </span>
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
