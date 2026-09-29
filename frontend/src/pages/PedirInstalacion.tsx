import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { TIPOS_ACTIVO, NOMBRE_DE_TIPO } from '../tipos-de-equipo';
import { fecha } from '../fechas';
import { mensajeDeError } from '../avisos';

/**
 * PEDIR UNA INSTALACIÓN — bloque 137. La puerta de Producción.
 *
 * Producción no tiene acceso a la infraestructura (`asset.read`), así que las
 * cámaras nuevas se pedían por WhatsApp y se perdían. Aquí pide con cinco
 * datos —qué, cuántos, dónde, un punto de referencia y para qué— y ve en qué
 * quedó lo suyo. Todo lo técnico (energía, cable, canalización, manlift) lo
 * mide el técnico en la visita, desde «Instalaciones».
 */

const SITIO_ES: Record<string, string> = {
  NAVE: 'Nave de laminación', PULPITO: 'Púlpito', GRUA: 'Grúa puente', PATIO: 'Patio / intemperie',
  ALMACEN: 'Almacén', OFICINA: 'Oficina', CASETA: 'Caseta', SALA_ELECTRICA: 'Sala eléctrica / MCC',
  SUBESTACION: 'Subestación', LABORATORIO: 'Laboratorio', OTRO: 'Otro',
};
const ESTADO_ES: Record<string, string> = {
  SOLICITADA: 'Pedida', EN_EVALUACION: 'En visita', EVALUADA: 'Visitada, falta aprobar',
  APROBADA: 'Aprobada', RECHAZADA: 'No aprobada', EN_EJECUCION: 'Instalando',
  INSTALADA: 'Instalada', CANCELADA: 'Cancelada',
};
const VACIO = { tipoEquipo: 'CAMERA', cantidad: '1', tipoSitio: 'NAVE', locationId: '', referenciaSitio: '', justificacion: '' };

export default function PedirInstalacion() {
  const { user } = useAuth();
  const [f, setF] = useState<any>(VACIO);
  const [ubicaciones, setUbicaciones] = useState<any[]>([]);
  const [mias, setMias] = useState<any[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    const r = await api.get('/instalaciones/mias').then((x) => x.data).catch(() => []);
    setMias(Array.isArray(r) ? r : []);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    let vivo = true;
    api.get('/locations')
      .then((r) => { if (vivo) setUbicaciones(r.data?.items || r.data || []); })
      .catch(() => { if (vivo) setUbicaciones([]); });
    return () => { vivo = false; };
  }, []);

  /* Sólo las ubicaciones de SU tren. El servidor lo vuelve a comprobar: esto
     es para que no elija algo que le van a rechazar. */
  const suyas = useMemo(() => {
    const trenes: string[] = (user as any)?.ambitoTrenes ?? [];
    const lista = trenes.length
      ? ubicaciones.filter((u) => trenes.some((t) => String(u.code || '').startsWith(t)))
      : ubicaciones;
    return [...lista].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [ubicaciones, user]);

  async function pedir(e: FormEvent) {
    e.preventDefault();
    setGuardando(true); setError(''); setAviso('');
    try {
      const r = await api.post('/instalaciones/solicitud', {
        tipoEquipo: f.tipoEquipo,
        cantidad: Number(f.cantidad) || 1,
        tipoSitio: f.tipoSitio,
        locationId: f.locationId,
        referenciaSitio: f.referenciaSitio.trim() || undefined,
        justificacion: f.justificacion.trim(),
      });
      setAviso(`Pedido ${r.data?.codigo} registrado. El técnico irá a medir.`);
      setF(VACIO);
      await cargar();
    } catch (err) { setError(mensajeDeError(err, 'registrar')); }
    finally { setGuardando(false); }
  }

  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="page">
      <h1 className="page-title">Pedir instalación</h1>
      <p className="muted" style={{ margin: '0 0 12px' }}>Qué necesitas y dónde. El técnico mide el resto.</p>

      {aviso && <div className="card" style={{ marginBottom: 12, borderLeft: '4px solid var(--ok)' }}>{aviso}</div>}
      {error && <div className="card peligro" style={{ marginBottom: 12 }}>{error}</div>}

      <form className="card" onSubmit={pedir} style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ flex: '2 1 200px' }}>Qué equipo
            <select value={f.tipoEquipo} onChange={set('tipoEquipo')}>
              {TIPOS_ACTIVO.map((t) => <option key={t.valor} value={t.valor}>{t.nombre}</option>)}
            </select>
          </label>
          <label style={{ flex: '1 1 90px' }}>Cuántos
            <input type="number" min={1} max={50} value={f.cantidad} onChange={set('cantidad')} />
          </label>
          <label style={{ flex: '2 1 200px' }}>Tipo de sitio
            <select value={f.tipoSitio} onChange={set('tipoSitio')}>
              {Object.entries(SITIO_ES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>
        <label>Dónde
          <select required value={f.locationId} onChange={set('locationId')}>
            <option value="">— elige la zona —</option>
            {suyas.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        <label>Punto de referencia
          <input value={f.referenciaSitio} maxLength={200} onChange={set('referenciaSitio')}
            placeholder="Ej.: poste junto a la mesa de enfriamiento" />
        </label>
        <label>Para qué
          <textarea required minLength={10} maxLength={800} rows={3} value={f.justificacion}
            onChange={set('justificacion')} placeholder="Ej.: no se ve la salida de barras desde el púlpito" />
        </label>
        <button className="btn-primary" disabled={guardando}>{guardando ? 'Enviando…' : 'Pedir'}</button>
      </form>

      <div className="section-title">Mis pedidos</div>
      {mias.length === 0 ? (
        <div className="card vacio"><p>Todavía no has pedido nada.</p></div>
      ) : (
        <table className="tabla">
          <thead><tr><th>Código</th><th>Qué</th><th>Dónde</th><th>Pedido</th><th>Estado</th></tr></thead>
          <tbody>
            {mias.map((i) => (
              <tr key={i.id}>
                <td><strong>{i.codigo}</strong></td>
                <td>{i.cantidad > 1 ? `${i.cantidad} × ` : ''}{NOMBRE_DE_TIPO[i.tipoEquipo] || i.tipoEquipo}</td>
                <td>{i.location?.name || '—'}{i.referenciaSitio ? <div className="muted" style={{ fontSize: 12 }}>{i.referenciaSitio}</div> : null}</td>
                <td>{fecha(i.creadoEn)}</td>
                <td>
                  {ESTADO_ES[i.estado] || i.estado}
                  {i.estado === 'RECHAZADA' && i.motivoRechazo && <div className="muted" style={{ fontSize: 12 }}>{i.motivoRechazo}</div>}
                  {i.workOrder?.code && <div className="muted" style={{ fontSize: 12 }}>Orden {i.workOrder.code}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
