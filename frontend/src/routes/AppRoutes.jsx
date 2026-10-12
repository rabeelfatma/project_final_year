import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "../components/common/ProtectedRoute";
import ThemeSwitcher from "../components/common/ThemeSwitcher"; 

/* LANDING PAGES */
import LandingPage from "../pages/landing/LandingPage";
import LearnMore from "../pages/landing/LearnMore";
import Features from "../pages/landing/Features";
import About from "../pages/landing/About";

/* AUTH & ROLE SELECTION */
import Login from "../pages/authentication/Login";
import RoleSelection from "../pages/authentication/RoleSelection";
import ForgotPassword from "../pages/authentication/ForgotPassword";
import ResetPassword from "../pages/authentication/ResetPassword";

/* SIGNUP PAGES */
import StudentSignup from "../pages/signup/StudentSignup";
import TeacherSignup from "../pages/signup/TeacherSignup";
import AdminSignup from "../pages/signup/AdminSignup";

/* DASHBOARD PAGES */
import StudentDashboard from "../pages/dashboards/StudentDashboard";
import TeacherDashboard from "../pages/dashboards/TeacherDashboard";
import AdminDashboard from "../pages/dashboards/AdminDashboard";

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <ThemeSwitcher />
      <Routes>
        {/* --- PUBLIC ROUTES --- */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/home" element={<LandingPage />} />
        <Route path="/learn-more" element={<LearnMore />} />
        <Route path="/features" element={<Features />} />
        <Route path="/about" element={<About />} />

        {/* --- AUTH ROUTES --- */}
        <Route path="/login" element={<Login />} />
        <Route path="/role-selection" element={<RoleSelection />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* --- SIGNUP ROUTES --- */}
        <Route
          path="/signup/student"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <StudentSignup />
            </ProtectedRoute>
          }
        />
        <Route
          path="/signup/teacher"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <TeacherSignup />
            </ProtectedRoute>
          }
        />
        <Route path="/signup/admin" element={<AdminSignup />} />

        {/* --- ✅ PROTECTED DASHBOARD ROUTES --- */}
        
        {/* Student Access */}
        <Route 
          path="/dashboard/student" 
          element={
            <ProtectedRoute allowedRoles={["student"]}>
              <StudentDashboard />
            </ProtectedRoute>
          } 
        />

        {/* Teacher Access */}
        <Route 
          path="/dashboard/teacher" 
          element={
            <ProtectedRoute allowedRoles={["teacher"]}>
              <TeacherDashboard />
            </ProtectedRoute>
          } 
        />

        {/* Admin Access (Control Center) */}
        <Route 
          path="/dashboard/admin" 
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <AdminDashboard />
            </ProtectedRoute>
          } 
        />

        {/* --- 404 REDIRECT --- */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}