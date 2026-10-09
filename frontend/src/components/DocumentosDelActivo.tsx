import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { fecha } from '../fechas';
import { useDialogos } from './Dialogos';
import Icono from './Iconos';

const CATEGORIA_ES: Record<string, string> = {
  MANUAL: 'Manual', DIAGRAMA: 'Diagrama', PLANO: 'Plano', FOTO: 'Foto', CONFIG: 'Configuración', BACKUP: 'Respaldo',
};

/**
 * LOS PAPELES DE ESTE EQUIPO — bloque 171 (ficha única, plan 150).
 *
 * Manuales, planos y respaldos de configuración guardados contra el equipo. Antes
 * había que salir de la ficha, ir a «Manuales y planos» y filtrar. Se sube
 * desde allí (con el equipo ya elegido); aquí se consulta y se descarga.
 */
export default function DocumentosDelActivo({ assetId, assetCode }: { assetId: string; assetCode: string }) {
  const { can } = useAuth();
  const { avisar } = useDialogos();
  const [docs, setDocs] = useState<any[] | null>(null);
  const puede = can('document.read');

  useEffect(() => {
    if (!puede) return;
    let vivo = true;
    api.get('/documentos', { params: { assetId } })
      .then((r) => { if (vivo) setDocs(Array.isArray(r.data) ? r.data : []); })
      .catch(() => { if (vivo) setDocs([]); });
    return () => { vivo = false; };
  }, [assetId, puede]);

  async function descargar(id: string, titulo: string) {
    try {
      const r = await api.get(`/documentos/${id}/descargar`, { responseType: 'blob' });
      const nombre = /filename="?([^";]+)"?/.exec(r.headers['content-disposition'] || '')?.[1] || titulo;
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url; a.download = nombre; a.click();
      URL.revokeObjectURL(url);
    } catch { await avisar('No se pudo descargar.'); }
  }

  if (!puede) return <p className="muted">{'Los documentos los ve quien tiene permiso de documentos.'}</p>;
  if (docs === null) return <p className="muted">{'Buscando documentos…'}</p>;
  return (
    <div>
      {docs.length === 0 ? (
        <div className="ficha-vacia">
          <Icono n="pdf" size={22} />
          <div>
            <b>{`${assetCode} no tiene documentos todavía.`}</b>
            <p className="muted">{'Manual, plano o respaldo de configuración: se suben en «Manuales y planos» eligiendo este equipo.'}</p>
          </div>
        </div>
      ) : docs.map((d) => (
        <div key={d.id} className="frow">
          <span className="v">
            <b>{d.title}</b>{' '}
            <span className="muted">{`· ${CATEGORIA_ES[d.category] || d.category} · v${d.version} · ${fecha(d.createdAt)}`}</span>
          </span>
          <button className="btn-mini" onClick={() => descargar(d.id, d.title)}>{'Descargar'}</button>
        </div>
      ))}
      {can('document.manage') && (
        <Link className="btn-mini" style={{ marginTop: 10 }} to="/documentos">{'Subir un documento'}</Link>
      )}
    </div>
  );
}
