import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, authLoading, authResolvedOnce } = useAuth();

  if (authLoading && !authResolvedOnce) {
    return (
      <div className="container">
        <div className="box">
          <div className="box-title">Opening your account...</div>
          <p className="small-text" style={{ marginTop: "10px" }}>
            Loading your saved session and local data.
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}