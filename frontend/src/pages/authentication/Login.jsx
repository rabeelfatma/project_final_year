import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link, useLocation, useSearchParams } from "react-router-dom";
import { BookOpen, GraduationCap, Eye, EyeOff, ArrowLeft } from "lucide-react";
import InputField from "../../components/ui/InputField";
import Button from "../../components/ui/Button";
import Alert from "../../components/ui/Alert";
import { validateEmail } from "../../utils/validators";
import { getApiBaseUrl } from "../../utils/apiBase";

const ROLES = [
  {
    id: "teacher",
    title: "Teacher",
    description: "Manage assignments and grading",
    Icon: BookOpen,
  },
  {
    id: "student",
    title: "Student",
    description: "Submit and track assignments",
    Icon: GraduationCap,
  },
];

function normalizeRole(value) {
  const role = String(value || "").trim().toLowerCase();
  if (role === "admin") return "admin";
  return ROLES.some((item) => item.id === role) ? role : "";
}

function roleLabel(role) {
  const found = ROLES.find((item) => item.id === role);
  return found ? found.title : "User";
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const initialRole = useMemo(() => {
    return (
      normalizeRole(location.state?.role) ||
      normalizeRole(searchParams.get("role")) ||
      ""
    );
  }, [location.state, searchParams]);

  // Legacy Admin login hints move to dedicated /admin portal.
  useEffect(() => {
    if (initialRole === "admin") {
      navigate("/admin", { replace: true });
    }
  }, [initialRole, navigate]);

  const [selectedRole, setSelectedRole] = useState(
    initialRole === "admin" ? "" : initialRole
  );
  const [form, setForm] = useState({ email: "", password: "" });
  const [msg, setMsg] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const showForm = Boolean(selectedRole);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const selectRole = (roleId) => {
    setSelectedRole(roleId);
    setMsg("");
    setForm({ email: "", password: "" });
    setShowPass(false);
  };

  const backToRoles = () => {
    setSelectedRole("");
    setMsg("");
    setForm({ email: "", password: "" });
    setShowPass(false);
    if (searchParams.get("role")) {
      navigate("/login", { replace: true });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setMsg("");

    if (!selectedRole || selectedRole === "admin") {
      return setMsg("Select Teacher or Student to continue.");
    }
    if (!form.email) return setMsg("Email address is required.");
    if (!validateEmail(form.email)) return setMsg("Enter a valid email address.");
    if (!form.password) return setMsg("Password is required.");

    setSubmitting(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password,
          role: selectedRole,
        }),
      });

      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (!res.ok) {
        return setMsg(data.message || "Invalid email or password.");
      }

      const authenticatedRole = String(data.role || "").toLowerCase();
      if (authenticatedRole !== "teacher" && authenticatedRole !== "student") {
        localStorage.clear();
        return setMsg("Use the Administration Portal for administrator access.");
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("role", authenticatedRole);
      localStorage.setItem("userName", data.name || "");
      localStorage.setItem("userRegNo", data.regNo || "");

      setMsg("Login successful.");
      navigate(`/dashboard/${authenticatedRole}`);
    } catch {
      setMsg("Server unavailable. Check that the backend is running and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-[var(--bg)] min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[var(--bg-secondary)] border border-sky-400/70 p-6 sm:p-8 rounded-2xl shadow-xl">
        <div className="text-center mb-8">
          <p className="text-sky-400 text-xs font-bold uppercase tracking-[0.25em] mb-2">
            QuickCheck Hub
          </p>
          <h1 className="text-[var(--text)] text-3xl font-black tracking-tight">
            Welcome Back
          </h1>
          <p className="text-[var(--text-faint)] mt-2 text-sm">
            {showForm
              ? `${roleLabel(selectedRole)} login — email and password only`
              : "Select your role to continue"}
          </p>
        </div>

        {msg && <Alert message={msg} />}

        {!showForm && (
          <>
            <div className="grid gap-3" role="listbox" aria-label="Select login role">
              {ROLES.map(({ id, title, description, Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="option"
                  aria-selected={selectedRole === id}
                  onClick={() => selectRole(id)}
                  className="group w-full text-left rounded-xl border border-slate-700/80 bg-slate-900/40 px-4 py-4 transition-all hover:border-sky-400 hover:bg-sky-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                >
                  <div className="flex items-start gap-4">
                    <span className="mt-0.5 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400 group-hover:bg-sky-500 group-hover:text-white transition-colors">
                      <Icon size={22} aria-hidden="true" />
                    </span>
                    <span>
                      <span className="block text-sky-300 font-black uppercase tracking-widest text-sm">
                        {title}
                      </span>
                      <span className="block text-[var(--text-faint)] text-sm mt-1">
                        {description}
                      </span>
                    </span>
                  </div>
                </button>
              ))}
            </div>
            <p className="text-center text-[var(--text-faint)] mt-6 text-[11px] font-bold uppercase tracking-[0.2em]">
              Don&apos;t have an account?{" "}
              <Link to="/signup" className="text-sky-400 hover:underline">
                Sign Up
              </Link>
            </p>
          </>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-4">
              <label className="sr-only" htmlFor="login-email">
                Email Address
              </label>
              <InputField
                name="email"
                type="email"
                placeholder="EMAIL ADDRESS"
                value={form.email}
                onChange={handleChange}
              />
            </div>

            <div className="relative mb-2">
              <label className="sr-only" htmlFor="login-password">
                Password
              </label>
              <InputField
                name="password"
                type={showPass ? "text" : "password"}
                placeholder="PASSWORD"
                value={form.password}
                onChange={handleChange}
              />
              <button
                type="button"
                onClick={() => setShowPass((value) => !value)}
                className="absolute right-3 top-2.5 text-sky-400 hover:text-sky-300 text-[10px] font-bold uppercase inline-flex items-center gap-1"
                aria-label={showPass ? "Hide password" : "Show password"}
              >
                {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                {showPass ? "Hide" : "Show"}
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 mb-6 text-[11px] font-bold">
              <p className="text-[var(--text-faint)] uppercase tracking-widest">
                Don&apos;t have an account?{" "}
                <Link to="/signup" className="text-sky-400 hover:underline">
                  Sign Up
                </Link>
              </p>
              <Link
                to="/forgot-password"
                className="text-sky-400 hover:underline opacity-90"
              >
                Forgot Password?
              </Link>
            </div>

            <Button
              text={
                submitting
                  ? "Signing in…"
                  : `Sign in as ${roleLabel(selectedRole)}`
              }
              type="submit"
              disabled={submitting}
            />

            <button
              type="button"
              onClick={backToRoles}
              className="mt-6 w-full inline-flex items-center justify-center gap-2 text-[var(--text-faint)] text-[11px] font-bold uppercase tracking-[0.2em] hover:text-sky-400 transition-colors"
            >
              <ArrowLeft size={14} aria-hidden="true" />
              Change Role
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
