import { Navigate } from 'react-router-dom';
import { isTokenValid } from '../utils/auth';

/**
 * Wraps a route: if token is missing/expired → redirect to /login
 */
export default function ProtectedRoute({ children }) {
  if (!isTokenValid()) {
    return <Navigate to="/login" replace />;
  }
  return children;
}
