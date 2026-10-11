import { useState } from "react";
import { useNavigate } from "react-router-dom";
import InputField from "../../components/ui/InputField";
import Button from "../../components/ui/Button";
import Alert from "../../components/ui/Alert";
import { validateEmail } from "../../utils/validators";
import { getApiBaseUrl } from "../../utils/apiBase";

export default function ForgotPassword() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [msg, setMsg] = useState("");

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.email || !form.password || !form.confirmPassword) {
      return setMsg("All fields required ❌");
    }

    if (!validateEmail(form.email)) {
      return setMsg("Invalid Email ❌");
    }

    if (form.password.length < 6) {
      return setMsg("Password must be at least 6 characters ❌");
    }

    if (form.password !== form.confirmPassword) {
      return setMsg("Passwords do not match ❌");
    }

    try {
      // 🔥 FIX: direct backend URL (NO 404 ISSUE)
      const res = await fetch(`${getApiBaseUrl()}/auth/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: form.email,
          newPassword: form.password
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        return setMsg(data.message || "Error ❌");
      }

      setMsg("Password changed successfully ✅");

      setForm({
        email: "",
        password: "",
        confirmPassword: "",
      });

    } catch (err) {
      console.log(err);
      setMsg("Server error ❌");
    }
  };

  const goBackToAdminLogin = () => {
    navigate("/login", { state: { role: "admin" } });
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

        {msg && <Alert message={msg} />}

        {/* EMAIL */}
        <InputField
          name="email"
          placeholder="Enter Email"
          value={form.email}
          onChange={handleChange}
        />

        {/* NEW PASSWORD */}
        <div className="relative">
          <InputField
            name="password"
            type={showPassword ? "text" : "password"}
            placeholder="New Password"
            value={form.password}
            onChange={handleChange}
          />

          <span
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-3 text-sky-400 cursor-pointer text-sm"
          >
            {showPassword ? "Hide" : "Show"}
          </span>
        </div>

        {/* CONFIRM PASSWORD */}
        <div className="relative">
          <InputField
            name="confirmPassword"
            type={showConfirm ? "text" : "password"}
            placeholder="Confirm Password"
            value={form.confirmPassword}
            onChange={handleChange}
          />

          <span
            onClick={() => setShowConfirm(!showConfirm)}
            className="absolute right-3 top-3 text-sky-400 cursor-pointer text-sm"
          >
            {showConfirm ? "Hide" : "Show"}
          </span>
        </div>

        <Button text="Change Password" type="submit" />

        <button
          type="button"
          onClick={goBackToAdminLogin}
          className="w-full mt-4 text-center text-sky-400 text-[11px] font-bold uppercase tracking-[0.2em] hover:underline"
        >
          Go Back
        </button>

      </form>
    </div>
  );
}