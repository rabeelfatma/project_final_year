import { useState } from "react";
import { Link } from "react-router-dom";
import InputField from "../../components/ui/InputField";
import Button from "../../components/ui/Button";
import Alert from "../../components/ui/Alert";
import {
  emailValidationMessage,
  passwordValidationMessage,
  confirmPasswordMessage,
  PASSWORD_HINT,
} from "../../utils/validators";
import { getApiBaseUrl } from "../../utils/apiBase";

export default function AdminSignup() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [msg, setMsg] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // 1. Basic Fields Validation
    if (!form.name.trim()) return setMsg("Full name is required.");
    const emailMessage = emailValidationMessage(form.email);
    if (emailMessage) return setMsg(emailMessage);
    const passwordMessage = passwordValidationMessage(form.password);
    if (passwordMessage) return setMsg(passwordMessage);
    const confirmMessage = confirmPasswordMessage(form.password, form.confirmPassword);
    if (confirmMessage) return setMsg(confirmMessage);

    const token = localStorage.getItem("token");
    if (!token) {
      return setMsg("Admin login is required.");
    }

    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          role: "admin",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        return setMsg(
          res.status >= 500
            ? "Something went wrong. Please try again."
            : data.message || "Something went wrong. Please try again."
        );
      }

      setMsg("Account created successfully.");
      setForm({ name: "", email: "", password: "", confirmPassword: "" });

    } catch (err) {
      console.error("Signup Fetch Error:", err);
      setMsg("Something went wrong. Please try again.");
    }
  };

  return (
    <div className="qc-auth-shell">
      <form className="qc-auth-card" onSubmit={handleSubmit}>

        <h2 className="qc-auth-title text-center mb-5">
          Add Admin
        </h2>

        {msg && <Alert message={msg} />}

        <InputField 
          name="name" 
          value={form.name} 
          placeholder="Name" 
          onChange={handleChange} 
        />
        <InputField 
          name="email" 
          value={form.email} 
          placeholder="Email" 
          onChange={handleChange} 
        />

        {/* PASSWORD */}
        <div className="relative">
          <InputField
            name="password"
            value={form.password}
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            onChange={handleChange}
          />
          <span
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-3 text-sky-400 cursor-pointer text-sm"
          >
            {showPassword ? "Hide" : "Show"}
          </span>
        </div>
        <p className="qc-auth-password-hint">{PASSWORD_HINT}</p>

        {/* CONFIRM PASSWORD */}
        <div className="relative">
          <InputField
            name="confirmPassword"
            value={form.confirmPassword}
            type={showConfirm ? "text" : "password"}
            placeholder="Confirm Password"
            onChange={handleChange}
          />
          <span
            onClick={() => setShowConfirm(!showConfirm)}
            className="absolute right-3 top-3 text-sky-400 cursor-pointer text-sm"
          >
            {showConfirm ? "Hide" : "Show"}
          </span>
        </div>

        <Button text="Add Admin" type="submit" />

        <p className="text-center text-gray-400 mt-4 text-sm">
          <Link to="/dashboard/admin" className="text-sky-400 font-bold">
            Back to Admin Dashboard
          </Link>
        </p>
      </form>
    </div>
  );
}