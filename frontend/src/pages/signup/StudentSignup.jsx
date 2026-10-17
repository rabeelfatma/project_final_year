import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import InputField from "../../components/ui/InputField";
import Button from "../../components/ui/Button";
import Alert from "../../components/ui/Alert";
import { validateEmail, validatePassword } from "../../utils/validators";
import { getApiBaseUrl } from "../../utils/apiBase";

export default function StudentSignup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    department: "CS",
    program: "Computer Science"
  });

  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [regNo, setRegNo] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg("");
    setRegNo("");

    if (!form.name || !form.email || !form.password) {
      return setMsg("Name, Email and Password are required ❌");
    }

    if (!validateEmail(form.email)) {
      return setMsg("Invalid Email ❌");
    }

    if (!validatePassword(form.password)) {
      return setMsg("Weak password ❌");
    }

    const token = localStorage.getItem("token");
    if (!token) {
      return setMsg("Admin login required to add students ❌");
    }

    setLoading(true);

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
          role: "student",
          department: form.department,
          program: form.program,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setLoading(false);
        return setMsg(data.message || "Failed to register ❌");
      }

      setRegNo(data.regNo);
      setMsg("Student Registered Successfully ✅");

      setForm({
        name: "",
        email: "",
        password: "",
        department: "CS",
        program: "Computer Science"
      });

    } catch (err) {
      setMsg("Server connection error ❌");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="qc-auth-shell items-start sm:items-center py-6 sm:py-10 overflow-y-auto">

      <form
        onSubmit={handleSubmit}
        className="qc-auth-card"
      >

        <button type="button" onClick={() => navigate("/dashboard/admin")} className="mb-5 flex items-center gap-2 text-slate-400 hover:text-sky-400 text-xs font-black uppercase tracking-widest transition-colors">
          <ArrowLeft size={16}/> Back to Admin Dashboard
        </button>

        <h2 className="text-sky-400 text-center mb-6 text-2xl font-black italic uppercase tracking-tighter">
          Add New Student
        </h2>

        {msg && <Alert message={msg} />}

        {regNo && (
          <div className="mb-4 p-3 bg-sky-500/10 border border-sky-500 text-sky-400 rounded-xl text-center font-black">
            Registration No: {regNo}
          </div>
        )}

        <div className="space-y-4">

          <InputField
            name="name"
            placeholder="Full Name"
            value={form.name}
            onChange={handleChange}
          />

          <InputField
            name="email"
            placeholder="Email Address"
            value={form.email}
            onChange={handleChange}
          />

          <div className="relative">
            <InputField
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="Password"
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

          <div className="flex flex-col gap-1">
            <label className="text-sky-500 text-[10px] font-bold uppercase ml-3">
              Select Department
            </label>
            <select
              name="department"
              value={form.department}
              onChange={handleChange}
              className="w-full p-4 bg-[#0F172A] border border-slate-800 rounded-2xl text-slate-300"
            >
              <option value="CS">Computer Science (CS)</option>
              <option value="SE">Software Engineering (SE)</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sky-500 text-[10px] font-bold uppercase ml-3">
              Select Program
            </label>
            <select
              name="program"
              value={form.program}
              onChange={handleChange}
              className="w-full p-4 bg-[#0F172A] border border-slate-800 rounded-2xl text-slate-300"
            >
              <option value="Computer Science">BS Computer Science</option>
              <option value="Software Engineering">BS Software Engineering</option>
            </select>
          </div>

          <Button
            text={loading ? "Generating Registration ID..." : "ADD STUDENT"}
            type="submit"
            className="w-full bg-sky-500 hover:bg-sky-400 text-black font-black py-4 rounded-2xl mt-4"
          />
        </div>

        <p className="text-center text-slate-600 mt-6 text-[10px] font-bold uppercase tracking-widest">
          QuickCheck HQ Auto-ID System
        </p>

      </form>
    </div>
  );
}
