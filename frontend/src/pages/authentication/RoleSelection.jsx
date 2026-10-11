import { useNavigate } from "react-router-dom";

export default function RoleSelection() {
  const navigate = useNavigate();

  // Function to handle navigation with state
  const selectRole = (selectedRole) => {
    navigate("/login", { state: { role: selectedRole } });
  };

  return (
    <div className="bg-[var(--bg)] min-h-screen flex flex-col justify-center items-center">
      <h1 className="text-sky-400 text-4xl mb-10 font-bold uppercase italic tracking-tighter">
        Select Role
      </h1>

      <div className="flex gap-5">
        <button
          onClick={() => selectRole("student")}
          className="bg-sky-500 px-8 py-4 rounded-xl text-white font-black uppercase tracking-widest hover:bg-sky-600 transition-all shadow-lg active:scale-95"
        >
          Student
        </button>

        <button
          onClick={() => selectRole("teacher")}
          className="bg-sky-500 px-8 py-4 rounded-xl text-white font-black uppercase tracking-widest hover:bg-sky-600 transition-all shadow-lg active:scale-95"
        >
          Teacher
        </button>

        <button
          onClick={() => selectRole("admin")}
          className="bg-sky-500 px-8 py-4 rounded-xl text-white font-black uppercase tracking-widest hover:bg-sky-600 transition-all shadow-lg active:scale-95"
        >
          Admin
        </button>
      </div>

      <button
        onClick={() => navigate("/")}
        className="fixed bottom-6 right-6 text-sky-400 text-[11px] font-bold uppercase tracking-[0.2em] hover:underline"
      >
        Go Back
      </button>
    </div>
  );
}