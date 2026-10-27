import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { getSafeReturnTo } from '../../services/auth';
import { AuthLoading } from './AuthStatus';
import Login from '../../pages/Login';

export default function LoginRoute() {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <AuthLoading />;
  if (status === 'authenticated' && user) {
    const returnTo = getSafeReturnTo(location.state?.from, window.location.origin);
    return <Navigate to={returnTo ?? '/files'} replace />;
  }

  return <Login />;
}
