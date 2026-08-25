import { useEffect, useState } from 'react';
import { api } from '../api/client';
import Icono from '../components/Iconos';
import { useAuth } from '../auth/AuthContext';

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
  red: 'asset.read',
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
      const r = await api.get(`/exportacion/${clave}`, { responseType: 'blob' });
      const nombre =
        /filename="?([^";]+)"?/.exec(r.headers['content-disposition'] || '')?.[1] ||
        `sgit_${clave}.xlsx`;
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setFallo('No se pudo generar el archivo. Vuelve a intentarlo; si sigue, avisa qué tema fallaba.');
    } finally {
      setBajando('');
    }
  }

  const visibles = temas.filter((t) => can(PERMISO[t.clave] || 'dashboard.read'));

  return (
    <div className="page">
      <p className="page-sub">
        Una hoja de cálculo por tema, con los mismos datos que su pantalla.
      </p>

      {fallo && <div className="card aviso-error">{fallo}</div>}

      <div className="export-grid">
        {visibles.map((t) => (
          <button
            key={t.clave}
            className="export-card"
            disabled={!!bajando}
            onClick={() => bajar(t.clave)}
          >
            <div className="ec-nombre">
              <Icono n="bandeja" size={16} /> {t.nombre}
            </div>
            <div className="ec-detalle">{t.detalle}</div>
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
            <p style={{ marginTop: 0 }}>
              Todas las hojas en un solo archivo, con una portada que explica
              qué es. Es la copia que conviene <b>guardar fuera</b> y mandarle
              al ingeniero cada cierto tiempo.
            </p>
            <p className="muted" style={{ fontSize: 12.5 }}>
              Aviso honesto: volver a subir estas hojas <b>no reconstruye el
              sistema</b> — los datos están enlazados entre sí por
              identificadores. La restauración se hace desde los respaldos de la base.
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
