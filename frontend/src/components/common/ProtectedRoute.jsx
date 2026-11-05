import { Navigate } from "react-router-dom";
import { getAuthToken, clearAuthSession } from "../../utils/authToken";

const ProtectedRoute = ({ children, allowedRoles }) => {
  const token = getAuthToken();
  const userRole = String(localStorage.getItem("role") || "").toLowerCase();

  if (!token) {
    clearAuthSession();
    const loginPath = allowedRoles?.includes("admin") ? "/admin" : "/login";
    return <Navigate to={loginPath} replace />;
  }

  if (!allowedRoles.includes(userRole)) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
