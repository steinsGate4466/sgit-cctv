import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useDialogos } from './Dialogos';
import { mensajeDeError } from '../avisos';

/**
 * CARGAR / BORRAR LA DEMOSTRACIÓN DESDE LA APP — bloque 166.
 *
 * En Railway el Mapa salía vacío: `npm run demo:plano` en el PC carga la base
 * y el almacén LOCALES. Este botón le pide al SERVIDOR que ejecute los mismos
 * scripts, con su base y su almacén. Todo lo que crea lleva DEMO- y se borra
 * con «Borrar la demostración» (sólo lo DEMO-; lo real no se toca).
 */
export default function CargaDeDemo() {
  const { confirmar } = useDialogos();
  const [ocupado, setOcupado] = useState<'' | 'cargar' | 'borrar'>('');
  const [salida, setSalida] = useState<string[]>([]);
  const [ok, setOk] = useState<boolean | null>(null);

  async function ejecutar(accion: 'cargar' | 'borrar') {
    const pregunta = accion === 'cargar'
      ? '¿Cargar la demostración? Crea cámaras, órdenes, incidencias, red y planos de ejemplo (todo DEMO-). Tarda hasta un minuto.'
      : '¿Borrar la demostración? Se borra SÓLO lo que empieza por DEMO-.';
    if (!(await confirmar(pregunta))) return;
    setOcupado(accion); setSalida([]); setOk(null);
    try {
      const r = await api.post(`/purga/demo/${accion}`, { confirmacion: 'DEMO' }, { timeout: 5 * 60 * 1000 });
      setOk(!!r.data?.ok); setSalida(r.data?.salida || []);
    } catch (e) {
      setOk(false); setSalida([mensajeDeError(e, accion === 'cargar' ? 'cargar la demostración' : 'borrar la demostración')]);
    } finally { setOcupado(''); }
  }

  return (
    <div className="card">
      <div className="section-title" style={{ marginTop: 0 }}>Demostración</div>
      <p className="muted" style={{ marginTop: 0 }}>
        Mapas del Tren 1 y Tren 2 con zonas y sala eléctrica, más equipos y órdenes de ejemplo (todo DEMO-).
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn-primary" disabled={!!ocupado} onClick={() => ejecutar('cargar')}>
          {ocupado === 'cargar' ? 'Cargando… (hasta un minuto)' : 'Cargar la demostración'}
        </button>
        <button type="button" className="btn-mini" disabled={!!ocupado} onClick={() => ejecutar('borrar')}>
          {ocupado === 'borrar' ? 'Borrando…' : 'Borrar la demostración'}
        </button>
        {ok && <Link className="btn-mini" to="/mapa">Ver el mapa</Link>}
      </div>
      {ok !== null && (
        <pre className={'demo-salida' + (ok ? '' : ' mal')}>{salida.join('\n') || (ok ? 'Hecho.' : 'Falló sin mensaje.')}</pre>
      )}
    </div>
  );
}
