import { Navigate } from "react-router-dom";

const ProtectedRoute = ({ children, allowedRoles }) => {
  const token = localStorage.getItem("token");
  const userRole = String(localStorage.getItem("role") || "").toLowerCase();

  if (!token) {
    const loginPath = allowedRoles?.includes("admin") ? "/admin" : "/login";
    return <Navigate to={loginPath} replace />;
  }

  if (!allowedRoles.includes(userRole)) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;