import { Navigate, useLocation } from "react-router-dom";

/**
 * Historical /role-selection route.
 * QC-16D: primary experience lives on /login; keep this path as a compatible entry.
 */
export default function RoleSelection() {
  const location = useLocation();
  return <Navigate to="/login" replace state={location.state} />;
}
