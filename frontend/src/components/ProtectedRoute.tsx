import { Navigate, useLocation } from 'react-router-dom';
import { ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const token = localStorage.getItem('sgit_token');

  if (!user || !token) {
    // Se recuerda a dónde iba el usuario para devolverlo ahí tras iniciar sesión.
    // Sin esto, el técnico que escanea el QR de un equipo terminaba en el Dashboard
    // y tenía que buscar el activo a mano — justo lo que el QR viene a evitar.
    const destino = location.pathname + location.search;
    return <Navigate to="/login" replace state={{ from: destino }} />;
  }
  return <>{children}</>;
}
