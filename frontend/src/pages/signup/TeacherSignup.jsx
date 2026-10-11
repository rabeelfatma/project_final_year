import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import InputField from "../../components/ui/InputField";
import Button from "../../components/ui/Button";
import Alert from "../../components/ui/Alert";
import { getApiBaseUrl } from "../../utils/apiBase";

export default function TeacherSignup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    subject: "",
    department: "CS", 
  });

  const [msg, setMsg] = useState("");

  const subjects = [
    // --- 20 Computer Science (CS) Subjects ---
    { name: "Programming Fundamentals", dept: "CS" },
    { name: "Object Oriented Programming", dept: "CS" },
    { name: "Data Structures", dept: "CS" },
    { name: "Operating Systems", dept: "CS" },
    { name: "Database Systems", dept: "CS" },
    { name: "Artificial Intelligence", dept: "CS" },
    { name: "Computer Networks", dept: "CS" },
    { name: "Theory of Automata", dept: "CS" },
    { name: "Compiler Construction", dept: "CS" },
    { name: "Machine Learning", dept: "CS" },
    { name: "Data Science", dept: "CS" },
    { name: "Computer Architecture", dept: "CS" },
    { name: "Analysis of Algorithms", dept: "CS" },
    { name: "Digital Logic Design", dept: "CS" },
    { name: "Cyber Security", dept: "CS" },
    { name: "Parallel Computing", dept: "CS" },
    { name: "Natural Language Processing", dept: "CS" },
    { name: "Computer Graphics", dept: "CS" },
    { name: "Distributed Systems", dept: "CS" },
    { name: "Internet of Things (IoT)", dept: "CS" },

    // --- 20 Software Engineering (SE) Subjects ---
    { name: "Software Engineering", dept: "SE" },
    { name: "Software Requirement Eng", dept: "SE" },
    { name: "Software Design & Architecture", dept: "SE" },
    { name: "Software Quality Assurance", dept: "SE" },
    { name: "Software Project Management", dept: "SE" },
    { name: "Web Engineering", dept: "SE" },
    { name: "Mobile App Development", dept: "SE" },
    { name: "Human Computer Interaction", dept: "SE" },
    { name: "Software Re-Engineering", dept: "SE" },
    { name: "Cloud Computing", dept: "SE" },
    { name: "Software Construction", dept: "SE" },
    { name: "Software Testing", dept: "SE" },
    { name: "DevOps", dept: "SE" },
    { name: "User Interface Design", dept: "SE" },
    { name: "Component Based SE", dept: "SE" },
    { name: "Formal Methods in SE", dept: "SE" },
    { name: "Agile Software Development", dept: "SE" },
    { name: "Big Data Analytics", dept: "SE" },
    { name: "Enterprise Systems", dept: "SE" },
    { name: "Software Metrics", dept: "SE" },
  ];

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.name || !form.email || !form.subject) {
      return setMsg("Please fill all fields ❌");
    }

    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          ...form, 
          role: "teacher",
          password: "defaultPassword123" 
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setMsg("Teacher Added Successfully ✅");
        setForm({ name: "", email: "", subject: "", department: "CS" });
      } else {
        setMsg(data.message || "Failed to add teacher ❌");
      }
    } catch (err) {
      setMsg("Server error ❌");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F172A] p-4">
      <form className="bg-[#020617] p-8 w-full max-w-md border border-sky-400 rounded-xl shadow-lg" onSubmit={handleSubmit}>
        <button type="button" onClick={() => navigate("/dashboard/admin")} className="mb-5 flex items-center gap-2 text-slate-400 hover:text-sky-400 text-xs font-black uppercase tracking-widest transition-colors">
          <ArrowLeft size={16}/> Back to Admin Dashboard
        </button>
        <h2 className="text-sky-400 text-center mb-6 text-2xl font-bold">Add Teacher</h2>

        {msg && <Alert message={msg} />}

        <div className="space-y-4">
          <InputField 
            name="name" 
            placeholder="Full Name" 
            onChange={handleChange} 
            value={form.name} 
          />
          
          <InputField 
            name="email" 
            type="email" 
            placeholder="Email (example@gmail.com)" 
            onChange={handleChange} 
            value={form.email} 
          />

          {/* Department Selection */}
          <div>
            <label className="text-sky-400 text-sm mb-1 block">Select Department</label>
            <select
              name="department"
              onChange={handleChange}
              className="w-full p-3 bg-[#0F172A] text-white border border-sky-400 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none cursor-pointer"
              value={form.department}
            >
              <option value="CS">Computer Science (CS)</option>
              <option value="SE">Software Engineering (SE)</option>
            </select>
          </div>

          {/* Subject Dropdown */}
          <div>
            <label className="text-sky-400 text-sm mb-1 block">Select Subject</label>
            <select
              name="subject"
              onChange={handleChange}
              className="w-full p-3 bg-[#0F172A] text-white border border-sky-400 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none cursor-pointer"
              value={form.subject}
            >
              <option value="">-- Choose Subject --</option>
              {subjects.map((sub, index) => (
                <option key={index} value={sub.name}>
                  {sub.name} ({sub.dept})
                </option>
              ))}
            </select>
          </div>

          <div className="pt-4">
            <Button text="Add Teacher" type="submit" />
          </div>
        </div>
      </form>
    </div>
  );
}