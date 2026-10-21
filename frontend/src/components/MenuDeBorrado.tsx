import { ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';

/**
 * AUDITORÍA 20/10 · LO IRREVERSIBLE NO VA SUELTO EN LA FILA.
 *
 * «Eliminar» quedaba a cuatro píxeles de «Editar» en Cableado, Campañas,
 * Gabinetes y Ubicaciones. El error real no es pulsar el botón equivocado: es
 * pulsarlo en la FILA de al lado (bloques 80 y 91). Va dentro del menú «⋯»,
 * como en Órdenes e Incidencias, y el menú sólo aparece para quien puede
 * borrar: un «⋯» vacío es un botón que no hace nada.
 */
export default function MenuDeBorrado({ children }: { children: ReactNode }) {
  const { can } = useAuth();
  if (!can('purga.definitiva')) return null;
  return (
    <details className="acciones-fila" style={{ marginLeft: 4 }}>
      <summary className="btn-mini" style={{ cursor: 'pointer' }}
        aria-label="Más acciones de esta fila" title="Más acciones">⋯</summary>
      <div className="acciones-fila-menu">{children}</div>
    </details>
  );
}
