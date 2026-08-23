import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import FiltroAmbito, { Ambito, AMBITO_VACIO, AvisoAmbito } from '../components/FiltroAmbito';
import { plural } from '../formato';

/**
 * AVANCE DEL MAPEO.
 *
 * PARA QUÉ SIRVE
 * El levantamiento de más de 400 activos no lo hace una persona de una sentada.
 * Sin esta pantalla el avance es una sensación —"vamos como por la mitad"— y
 * nadie puede decir qué zona ya está cubierta ni a quién mandar dónde.
 *
 * La lista de pendientes viene ordenada por CRITICIDAD EFECTIVA (la que impone
 * la etapa del proceso, no la que alguien marcó a mano) y luego por lo menos
 * avanzado: es el orden en que conviene repartir el trabajo.
 */

const TIPO_ES: Record<string, string> = {
  CAMERA: 'Cámaras', NVR: 'Grabadores', SWITCH: 'Switches',
  WIRELESS: 'Antenas', DECODER: 'Decodificadores', PANTALLA: 'Pantallas',
  PC: 'PC de púlpito', ROUTER: 'Routers', FIREWALL: 'Firewalls',
  SERVER: 'Servidores', UPS: 'UPS', FIBER: 'Fibra', CABINET: 'Gabinetes',
  OTHER: 'Otros',
};

function Tarjeta({ titulo, valor, pie, color }: any) {
  return (
    <div className="card" style={{ flex: '1 1 170px', minWidth: 150, padding: '14px 16px' }}>
      <div className="muted" style={{ fontSize: 12 }}>{titulo}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || 'var(--text)' }}>{valor}</div>
      {pie && <div className="muted" style={{ fontSize: 11 }}>{pie}</div>}
    </div>
  );
}

export default function Mapeo() {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [fTipo, setFTipo] = useState('');
  const [fCrit, setFCrit] = useState('');
  const [ambito, setAmbito] = useState<Ambito>(AMBITO_VACIO);

  const [rein, setRein] = useState<any>(null);

  // El avance se recalcula al cambiar el ámbito: filtrar en el navegador daría
  // porcentajes sobre el total de la PLANTA, no sobre el del tren, que es
  // justo el número que se quiere ver.
  const cargar = useCallback(async () => {
    const params: any = {};
    if (ambito.tren) params.tren = ambito.tren;
    if (ambito.etapa) params.etapa = ambito.etapa;
    const [a, r] = await Promise.all([
      api.get('/assets/avance-mapeo', { params }).then((x) => x.data).catch(() => null),
      // Reincidencia: aparece sola. Si hubiera que ir a buscarla activo por
      // activo, nadie la miraría y el problema seguiría invisible.
      api.get('/assets/reincidentes').then((x) => x.data).catch(() => null),
    ]);
    setD(a);
    setRein(r);
  }, [ambito]);

  useEffect(() => { cargar().finally(() => setLoading(false)); }, [cargar]);

  if (loading) return <div className="loading">Calculando el avance…</div>;
  if (!d) return <div className="loading">No se pudo obtener el avance del mapeo.</div>;

  const pendientes = (d.pendientes || []).filter((p: any) =>
    (!fTipo || p.type === fTipo) && (!fCrit || p.criticidad === fCrit));

  return (
    <div>
      <h1 className="page-title">Avance del mapeo</h1>
      <p className="page-sub">
        Estado del levantamiento de activos en planta. La lista de pendientes está
        ordenada por criticidad: es el orden en que conviene mandar a los técnicos.
      </p>

      {/* --------------------------------------------------- reincidencia */}
      {rein && rein.total > 0 && (
        <div style={{
          background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8,
          padding: '12px 14px', margin: '16px 0', color: '#991b1b',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            {rein.confirmadas > 0
              ? `${plural(rein.confirmadas, 'equipo')} con reincidencia CONFIRMADA`
              : `${plural(rein.total, 'equipo')} con posible reincidencia`}
            <span style={{ fontWeight: 400, fontSize: 12 }}> · últimos {rein.ventanaDias} días</span>
          </div>
          <div style={{ fontSize: 12, marginBottom: 8 }}>
            Son los que se arreglan y vuelven a fallar. Revisar la causa de fondo
            antes de volver a intervenir.
          </div>
          <table style={{ fontSize: 12 }}>
            <thead><tr><th>Equipo</th><th>Nombre en grabador</th><th>Ubicación</th><th>Qué se detectó</th></tr></thead>
            <tbody>
              {rein.items.slice(0, 10).map((r: any) => (
                <tr key={r.assetId}>
                  <td style={{ fontWeight: 600 }}>
                    {r.assetCode}
                    {r.severidad === 'CONFIRMADA' && (
                      <div style={{ fontSize: 10 }}>confirmada</div>
                    )}
                  </td>
                  <td>{r.nombreEnGrabador || '—'}</td>
                  <td>{r.ubicacion || '—'}</td>
                  <td>
                    {r.senales.map((sn: any, i: number) => (
                      <div key={i}>· {sn.mensaje}</div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rein.total > 10 && (
            <div style={{ fontSize: 11, marginTop: 6 }}>y {rein.total - 10} más.</div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------- resumen */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '16px 0' }}>
        <Tarjeta titulo="Activos registrados" valor={d.total} />
        <Tarjeta titulo="Ficha completa" valor={d.completos}
          pie={`${d.porcentaje}% del total`}
          color={d.porcentaje >= 80 ? '#16a34a' : d.porcentaje >= 40 ? '#d97706' : '#dc2626'} />
        <Tarjeta titulo="Fichas incompletas" valor={d.incompletos}
          color={d.incompletos ? '#dc2626' : '#16a34a'} />
        <Tarjeta titulo="Sin fotografía" valor={d.sinFoto}
          pie="Nadie podrá encontrarlos"
          color={d.sinFoto ? '#d97706' : '#16a34a'} />
        <Tarjeta titulo="Sin etapa asignada" valor={d.sinEtapa}
          pie="Sin intervalo ni criticidad derivada"
          color={d.sinEtapa ? '#d97706' : '#16a34a'} />
      </div>

      {/* Barra de avance general */}
      <div className="card" style={{ padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
          <span style={{ fontWeight: 600 }}>Avance general</span>
          <span className="muted">{d.completos} de {d.total} con ficha completa</span>
        </div>
        <div style={{ background: '#e5e7eb', borderRadius: 6, height: 14, overflow: 'hidden' }}>
          <div style={{
            width: `${d.porcentaje}%`, height: '100%',
            background: d.porcentaje >= 80 ? '#16a34a' : d.porcentaje >= 40 ? '#f59e0b' : '#dc2626',
            transition: 'width .3s',
          }} />
        </div>
      </div>

      {/* -------------------------------------------------------- por tipo */}
      <div className="card" style={{ marginBottom: 16 }}>
        <table>
          <thead><tr><th>Tipo de activo</th><th>Registrados</th><th>Con ficha completa</th><th>Avance</th></tr></thead>
          <tbody>
            {Object.entries(d.porTipo || {}).map(([tipo, v]: any) => {
              const pct = v.total ? Math.round((v.completos / v.total) * 100) : 0;
              return (
                <tr key={tipo}>
                  <td style={{ fontWeight: 600 }}>{TIPO_ES[tipo] || tipo}</td>
                  <td>{v.total}</td>
                  <td>{v.completos}</td>
                  <td style={{ minWidth: 130 }}>
                    <div style={{ background: '#e5e7eb', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                      <div style={{
                        width: `${pct}%`, height: '100%',
                        background: pct >= 80 ? '#16a34a' : pct >= 40 ? '#f59e0b' : '#dc2626',
                      }} />
                    </div>
                    <div className="muted" style={{ fontSize: 11 }}>{pct}%</div>
                  </td>
                </tr>
              );
            })}
            {!Object.keys(d.porTipo || {}).length && (
              <tr><td colSpan={4} className="muted" style={{ textAlign: 'center', padding: 24 }}>
                Todavía no hay activos registrados.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ----------------------------------------------------- pendientes */}
      <h2 style={{ fontSize: 16, margin: '18px 0 8px' }}>
        Fichas por completar ({pendientes.length})
      </h2>

      <div className="filters">
        <FiltroAmbito valor={ambito} onChange={setAmbito} />
        <div><label>Tipo
            <select value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
            <option value="">Todos</option>
            {Object.keys(d.porTipo || {}).map((t) => (
              <option key={t} value={t}>{TIPO_ES[t] || t}</option>
            ))}
          </select>
          </label>
        </div>
        <div><label>Criticidad
            <select value={fCrit} onChange={(e) => setFCrit(e.target.value)}>
            <option value="">Todas</option>
            {['CRITICA', 'ALTA', 'MEDIA', 'BAJA'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          </label>
        </div>
        <button className="btn-mini" onClick={() => { setFTipo(''); setFCrit(''); }}>Limpiar</button>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr><th>Código</th><th>Tipo</th><th>Criticidad</th><th>Tren / Etapa</th><th>Avance</th><th>Qué falta</th></tr>
          </thead>
          <tbody>
            {pendientes.map((p: any) => (
              <tr key={p.id}>
                <td style={{ fontWeight: 600 }}>{p.assetCode}</td>
                <td className="muted" style={{ fontSize: 12 }}>{TIPO_ES[p.type] || p.type}</td>
                <td><span className={'badge ' + p.criticidad}>{p.criticidad}</span></td>
                <td className="muted" style={{ fontSize: 12 }}>
                  {p.tren || <em>Sin tren</em>}
                  <div style={{ fontSize: 11 }}>{p.etapa || <em>falta etapa</em>}</div>
                </td>
                <td style={{ minWidth: 90 }}>
                  <div style={{ background: '#e5e7eb', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                    <div style={{
                      width: `${p.porcentaje}%`, height: '100%',
                      background: p.porcentaje >= 60 ? '#f59e0b' : '#dc2626',
                    }} />
                  </div>
                  <div className="muted" style={{ fontSize: 11 }}>{p.porcentaje}%</div>
                </td>
                <td style={{ fontSize: 12 }}>{p.faltan.join(' · ')}</td>
              </tr>
            ))}
            {!pendientes.length && (
              <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 30 }}>
                {d.total
                  ? 'Todas las fichas de este filtro están completas.'
                  : 'Todavía no hay activos registrados.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
