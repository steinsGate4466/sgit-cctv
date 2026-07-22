import { Navigate } from 'react-router-dom';
import { ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const token = localStorage.getItem('sgit_token');
  if (!user || !token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
