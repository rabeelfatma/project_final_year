import { useState } from "react";
import { Link } from "react-router-dom";
import InputField from "../../components/ui/InputField";
import Button from "../../components/ui/Button";
import Alert from "../../components/ui/Alert";
import { validateEmail, validatePassword } from "../../utils/validators";
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
    if (!form.name || !form.email || !form.password || !form.confirmPassword) {
      return setMsg("All fields required ❌");
    }

    // 2. Email & Password Validation
    if (!validateEmail(form.email)) {
      return setMsg("Invalid Email ❌");
    }

    if (!validatePassword(form.password)) {
      return setMsg("Weak password ❌");
    }

    // 3. Confirm Password Match
    if (form.password !== form.confirmPassword) {
      return setMsg("Passwords do not match ❌");
    }

    const token = localStorage.getItem("token");
    if (!token) {
      return setMsg("Admin login required to add administrators ❌");
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
        return setMsg(data.message || data.error || "Unable to add admin ❌");
      }

      setMsg("Admin added successfully ✅");
      setForm({ name: "", email: "", password: "", confirmPassword: "" });

    } catch (err) {
      console.error("Signup Fetch Error:", err);
      setMsg("Server error ❌");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F172A]">
      <form className="bg-[#020617] p-8 w-96 border border-sky-400 rounded-xl" onSubmit={handleSubmit}>

        <h2 className="text-sky-400 text-center mb-5 text-xl font-bold">
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