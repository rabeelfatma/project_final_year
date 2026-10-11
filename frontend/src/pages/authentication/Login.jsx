import { useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import InputField from "../../components/ui/InputField";
import Button from "../../components/ui/Button";
import Alert from "../../components/ui/Alert";
import { validateEmail } from "../../utils/validators";
import { getApiBaseUrl } from "../../utils/apiBase";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  
  const [role] = useState(location.state?.role || "student"); 
  
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
  });

  const [msg, setMsg] = useState("");
  const [showPass, setShowPass] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg("");

    // Common Validation
    if (!form.email) return setMsg("Email is required ❌");
    if (!validateEmail(form.email)) return setMsg("Invalid email format ❌");

    // Constructing Request Body dynamically
    const loginData = {
      email: form.email,
      role: role
    };

    // Dynamic Validation and Data assignment based on Role
    if (role === "admin") {
      if (!form.password) return setMsg("Admin Password is required ❌");
      loginData.password = form.password;
    } else {
      if (!form.name) return setMsg("Name is required for Login ❌");
      loginData.name = form.name;
      // Note: Student/Teacher ke liye password nahi bheja ja raha
    }

    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginData),
      });

      const data = await res.json();

      if (!res.ok) {
        return setMsg(data.message || "Login failed ❌");
      }

      setMsg("Login successful ✅");

      localStorage.setItem("token", data.token);
      localStorage.setItem("role", data.role);
      localStorage.setItem("userName", data.name);
      localStorage.setItem("userRegNo", data.regNo || ""); 

      setTimeout(() => {
        navigate(`/dashboard/${data.role}`);
      }, 1000);

    } catch (err) {
      setMsg("Server error ❌");
    }
  };

  return (
    <div className="bg-[var(--bg)] min-h-screen flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-[var(--bg-secondary)] border border-sky-400 p-6 sm:p-8 rounded-2xl shadow-xl transition-all duration-500"
      >
        <h2 className="text-sky-400 text-center text-3xl font-black mb-10 italic uppercase tracking-widest border-b border-sky-400/20 pb-4">
            {role} Login
        </h2>

        {msg && <Alert message={msg} />}

        {(role === "student" || role === "teacher") && (
          <div className="mb-4">
            <InputField
              name="name"
              type="text"
              placeholder="ENTER YOUR FULL NAME"
              value={form.name}
              onChange={handleChange}
            />
          </div>
        )}

        <div className="mb-4">
            <InputField
            name="email"
            type="email"
            placeholder="ENTER EMAIL ADDRESS"
            value={form.email}
            onChange={handleChange}
            />
        </div>

        {role === "admin" && (
          <div className="relative mb-2">
            <InputField
              name="password"
              type={showPass ? "text" : "password"}
              placeholder="ENTER ADMIN PASSWORD"
              value={form.password}
              onChange={handleChange}
            />
            <span
              onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-3 text-sky-400 cursor-pointer text-[10px] font-bold uppercase"
            >
              {showPass ? "Hide" : "Show"}
            </span>
          </div>
        )}

        {role === "admin" && (
          <div className="text-right mb-4">
            <Link to="/forgot-password" size="small" className="text-sky-400 text-[11px] font-bold hover:underline opacity-80">
              Forgot Password?
            </Link>
          </div>
        )}

        <div className="mt-8">
          <Button text={`Login as ${role}`} type="submit" />
        </div>

        <p className="text-center text-[var(--text-faint)] mt-8 text-[11px] font-bold uppercase tracking-[0.2em]">
          Wrong portal?{" "}
          <Link to="/role-selection" className="text-sky-400 hover:text-sky-300 transition-colors underline decoration-sky-400/30">
            Go Back
          </Link>
        </p>
      </form>
    </div>
  );
}