import { BrowserRouter, Routes, Route } from "react-router-dom";

/* LANDING PAGES */
import LandingPage from "./pages/landing/LandingPage";
import LearnMore from "./pages/landing/LearnMore";
import Features from "./pages/landing/Features";
import About from "./pages/landing/About";

/* AUTH */
import Login from "./pages/authentication/Login";
import ForgotPassword from "./pages/authentication/ForgotPassword";
import ResetPassword from "./pages/authentication/ResetPassword";
import RoleSelection from "./pages/authentication/RoleSelection";

/* SIGNUP */
import StudentSignup from "./pages/signup/StudentSignup";
import TeacherSignup from "./pages/signup/TeacherSignup";
import AdminSignup from "./pages/signup/AdminSignup";

/* DASHBOARDS */
import AdminDashboard from "./pages/dashboards/AdminDashboard"; 
import TeacherDashboard from "./pages/dashboards/TeacherDashboard"; 
import StudentDashboard from "./pages/dashboards/StudentDashboard"; 

/* 404 */
function NotFound() {
  return (
    <div className="bg-[#0F172A] text-white min-h-screen flex items-center justify-center">
      <h1 className="text-2xl text-red-400">404 - Page Not Found ❌</h1>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* LANDING */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/home" element={<LandingPage />} />
        <Route path="/learn-more" element={<LearnMore />} />
        <Route path="/features" element={<Features />} />
        <Route path="/about" element={<About />} />

        {/* AUTH */}
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* ROLE */}
        <Route path="/role-selection" element={<RoleSelection />} />

        {/* SIGNUP & ADD USER ROUTES */}
        <Route path="/signup/student" element={<StudentSignup />} />
        <Route path="/add-student" element={<StudentSignup />} /> 
        
        <Route path="/signup/teacher" element={<TeacherSignup />} />
        <Route path="/add-teacher" element={<TeacherSignup />} />

        <Route path="/signup/admin" element={<AdminSignup />} />

        {/* DASHBOARD ROUTES */}
        <Route path="/dashboard/admin" element={<AdminDashboard />} /> 
        <Route path="/dashboard/teacher" element={<TeacherDashboard />} /> 
        <Route path="/dashboard/student" element={<StudentDashboard />} /> 

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;