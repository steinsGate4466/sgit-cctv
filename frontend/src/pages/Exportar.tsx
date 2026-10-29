import { useEffect, useState } from 'react';
import { api } from '../api/client';
import Icono from '../components/Iconos';
import { useAuth } from '../auth/AuthContext';
import { descargarDeApi } from '../descargar';

/**
 * EXPORTAR A EXCEL (bloque 11.1).
 *
 * Una pantalla, no un botón escondido en cada tabla: así se encuentra, se
 * explica una sola vez lo que el Excel puede y NO puede hacer, y queda un
 * sitio natural para el libro completo.
 *
 * La descarga usa blob + enlace temporal: el axios de la app ya mete el
 * token en la cabecera, cosa que un <a href> normal no haría (y devolvería
 * 401 con cara de "no descarga nada").
 */

// El permiso de cada tema es EL MISMO de su pantalla: el Excel enseña
// exactamente lo que esa pantalla ya enseña, ni más ni menos.
const PERMISO: Record<string, string> = {
  activos: 'asset.read', gabinetes: 'asset.read', ubicaciones: 'location.read',
  ordenes: 'wo.read', incidencias: 'incident.read', repuestos: 'inventory.read',
  red: 'red.read', // la topología: lo mismo que pide «Mapa de red»
};

export default function Exportar() {
  const { can } = useAuth();
  const [temas, setTemas] = useState<any[]>([]);
  const [bajando, setBajando] = useState('');
  const [fallo, setFallo] = useState('');

  useEffect(() => {
    api.get('/exportacion').then((r) => setTemas(r.data || [])).catch(() => setTemas([]));
  }, []);

  async function bajar(clave: string) {
    setBajando(clave);
    setFallo('');
    try {
      await descargarDeApi(`/exportacion/${clave}`, `sgit_${clave}.xlsx`);
    } catch {
      setFallo('No se pudo generar el archivo. Vuelve a intentarlo; si sigue, avisa qué tema fallaba.');
    } finally {
      setBajando('');
    }
  }

  const visibles = temas.filter((t) => can(PERMISO[t.clave] || 'dashboard.read'));

  return (
    <div className="page">
      <p className="page-sub">Un Excel por tema.</p>

      {fallo && <div className="card aviso-error">{fallo}</div>}

      <div className="export-grid">
        {visibles.map((t) => (
          /* Síntesis 21/10: el detalle de cada hoja, al `title`. */
          <button
            key={t.clave}
            className="export-card"
            disabled={!!bajando}
            onClick={() => bajar(t.clave)}
            title={t.detalle}
          >
            <div className="ec-nombre">
              <Icono n="bandeja" size={16} /> {t.nombre}
            </div>
            <div className="ec-accion">
              {bajando === t.clave ? 'Generando…' : 'Descargar .xlsx'}
            </div>
          </button>
        ))}
      </div>

      {can('audit.read') && (
        <>
          <div className="section-title">Libro completo</div>
          <div className="card">
            <p style={{ marginTop: 0 }}
              title="Volver a subir estas hojas no reconstruye el sistema: la restauración se hace desde los respaldos de la base.">
              Todas las hojas en un archivo: la copia para <b>guardar fuera</b>.
            </p>
            <button className="btn-primary" disabled={!!bajando} onClick={() => bajar('todo')}>
              {bajando === 'todo' ? 'Generando el libro…' : 'Descargar el libro completo'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
