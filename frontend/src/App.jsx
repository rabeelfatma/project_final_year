import { BrowserRouter, Routes, Route } from "react-router-dom";

/* LANDING PAGES */
import LandingPage from "./pages/landing/LandingPage";
import LearnMore from "./pages/landing/LearnMore";
import Features from "./pages/landing/Features";
import About from "./pages/landing/About";

/* AUTH */
import Login from "./pages/authentication/Login";
import AdminLogin from "./pages/authentication/AdminLogin";
import PublicSignup from "./pages/authentication/PublicSignup";
import VerifyEmail from "./pages/authentication/VerifyEmail";
import ForgotPassword from "./pages/authentication/ForgotPassword";
import ResetPassword from "./pages/authentication/ResetPassword";
import RoleSelection from "./pages/authentication/RoleSelection";

/* SIGNUP (Admin-managed create forms) */
import StudentSignup from "./pages/signup/StudentSignup";
import TeacherSignup from "./pages/signup/TeacherSignup";
import AdminSignup from "./pages/signup/AdminSignup";

/* DASHBOARDS */
import AdminDashboard from "./pages/dashboards/AdminDashboard"; 
import TeacherDashboard from "./pages/dashboards/TeacherDashboard"; 
import StudentDashboard from "./pages/dashboards/StudentDashboard";
import ProtectedRoute from "./components/common/ProtectedRoute"; 

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
        <Route path="/admin" element={<AdminLogin />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<PublicSignup />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* ROLE */}
        <Route path="/role-selection" element={<RoleSelection />} />

        {/* Admin-managed account create forms (authenticated admin workflows) */}
        <Route path="/signup/student" element={<StudentSignup />} />
        <Route path="/add-student" element={<StudentSignup />} /> 
        
        <Route path="/signup/teacher" element={<TeacherSignup />} />
        <Route path="/add-teacher" element={<TeacherSignup />} />

        <Route path="/signup/admin" element={<AdminSignup />} />

        {/* DASHBOARD ROUTES */}
        <Route
          path="/dashboard/admin"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/teacher"
          element={
            <ProtectedRoute allowedRoles={["teacher"]}>
              <TeacherDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/student"
          element={
            <ProtectedRoute allowedRoles={["student"]}>
              <StudentDashboard />
            </ProtectedRoute>
          }
        /> 

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;