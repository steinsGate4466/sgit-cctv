import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { mensajeDeError } from '../avisos';

/**
 * ¿HAY QUE CAMBIAR ESTE EQUIPO? — bloque 108.
 *
 * =============================================================================
 *  EL AVISO VA ANTES QUE EL BOTÓN
 * =============================================================================
 *  Lo que pidió el usuario: poder decidir un reemplazo con un análisis detrás,
 *  y llevárselo en PDF a una reunión.
 *
 *  Pero el PDF no puede ser el único sitio donde aparezca la conclusión: nadie
 *  descarga un informe de un equipo que cree que está bien. Así que el veredicto
 *  se ve AQUÍ, en la ficha, y el PDF es para llevárselo.
 *
 *  Y cuando no hay motivo, este recuadro NO SALE. Un aviso que aparece siempre
 *  deja de ser un aviso a la semana.
 *
 * =============================================================================
 *  LO QUE ESTE RECUADRO NO HACE
 * =============================================================================
 *  No decide ni abre nada solo. Propone, con el número de correctivas delante,
 *  y la decisión la firma una persona. Es el norte del proyecto: automatizar el
 *  mantenimiento para que un ingeniero decida con el dato delante.
 */

/* LAS CLASES VAN ENTERAS, NO EN TROZOS, y no es cuestión de estilo.
   Escrito como `'card ' + tono.clase`, `verificar:clases` no ve la segunda
   mitad: sólo lee literales, y ahí `aviso` no aparece en ninguno. Se coló así
   la primera vez —el recuadro habría salido sin formato— y lo pilló una
   comprobación a mano, no el verificador.
   Con la cadena completa en el literal, el barrido del bloque 113 la ve: si
   una de las dos palabras existe en la hoja, exige que la otra también. */
const TONO: Record<string, { clase: string; etiqueta: string }> = {
  PROPONER_REEMPLAZO: { clase: 'card peligro', etiqueta: 'Se propone reemplazar' },
  MIRAR_AGUAS_ARRIBA: { clase: 'card aviso', etiqueta: 'El fallo no parece ser de este equipo' },
  OBSERVAR_EL_NUEVO: { clase: 'card aviso', etiqueta: 'Las fallas son del aparato anterior' },
  SEGUIR_OBSERVANDO: { clase: 'card aviso', etiqueta: 'Seguir observando' },
};

export default function ReemplazoDelActivo({ assetId, assetCode }: { assetId: string; assetCode: string }) {
  const { can } = useAuth();
  const [d, setD] = useState<any>(null);
  const [bajando, setBajando] = useState(false);
  const [error, setError] = useState('');

  /* La guardia del bloque 115: al cambiar de equipo en la ficha, la respuesta
     del anterior no puede quedarse pintada sobre el nuevo. */
  useEffect(() => {
    let vivo = true;
    setError('');
    api.get(`/assets/${assetId}/analisis-reemplazo`)
      .then((r) => { if (vivo) setD(r.data); })
      .catch(() => { if (vivo) setD(null); });
    return () => { vivo = false; };
  }, [assetId]);

  async function bajar() {
    setBajando(true); setError('');
    try {
      const r = await api.get(`/assets/${assetId}/informe-reemplazo`, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reemplazo-${assetCode}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(mensajeDeError(e, 'generar el informe'));
    } finally { setBajando(false); }
  }

  const v = d?.veredicto;
  // Sin motivo no se pinta nada: un aviso que sale siempre deja de avisar.
  if (!v || v.veredicto === 'SIN_MOTIVO') return null;

  const tono = TONO[v.veredicto] || TONO.SEGUIR_OBSERVANDO;

  return (
    <div className={tono.clase} style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{tono.etiqueta}</div>
      <p style={{ margin: '0 0 8px', fontSize: 13 }}>{v.frase}</p>
      <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
        {v.correctivasDelAparato} correctiva(s) del aparato instalado ·{' '}
        {v.correctivasDelSitio} de este punto en total
        {d?.historial?.resumen?.minutosSinVision > 0
          && ` · ${d.historial.resumen.minutosSinVision} min sin vista en el púlpito`}
      </div>
      {/* Una fecha estimada no se disimula: quien lee decide con eso. */}
      {v.apoyadoEnFechaEstimada && (
        <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>
          Fecha de instalación estimada: el reparto de fallas puede variar.
        </div>
      )}
      {error && <div className="muted" style={{ fontSize: 12 }}>{error}</div>}
      {can('asset.read') && (
        <button type="button" className="btn-mini" onClick={bajar} disabled={bajando}>
          {bajando ? 'Generando…' : 'Descargar informe de reemplazo (PDF)'}
        </button>
      )}
    </div>
  );
}
