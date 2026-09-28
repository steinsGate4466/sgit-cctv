import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { inicioPara } from '../modulos';

/** La pantalla de entrada de cada uno (bloque 148). La regla vive en `inicioPara`. */
export default function Inicio() {
  const { can, user } = useAuth();
  return <Navigate to={inicioPara(can, user)} replace />;
}
