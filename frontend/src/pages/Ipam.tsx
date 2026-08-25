import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import { EsqueletoTabla } from '../components/Esqueleto';
import { useAuth } from '../auth/AuthContext';
import BotonConMotivo from '../components/BotonConMotivo';
import { mensajeDeError, queFalta } from '../avisos';

/**
 * DIRECCIONAMIENTO IP
 *
 * La pantalla existe para contestar una pregunta que hoy nadie puede:
 * **«voy a instalar una cámara, ¿qué IP le pongo?»**
 *
 * Hoy se contesta con un Excel viejo o haciendo ping y usando la que no
 * responde. Eso funciona hasta el día que el equipo estaba apagado por
 * mantenimiento — y entonces hay dos con la misma IP, tumbándose a ratos.
 * Es el fallo más caro de diagnosticar de una red: como no falla siempre,
 * nadie lo reproduce y todos culpan a la cámara.
 */

const PROPOSITO: Record<string, string> = {
  CCTV: 'CCTV', GESTION: 'Gestión de equipos', CORPORATIVA: 'Corporativa',
  PROCESO: 'Proceso (PLC/HMI)', WIFI: 'WiFi', OTRO: 'Otro',
};
const TIPO: Record<string, string> = {
  ESTATICA: 'Estática', RESERVA_DHCP: 'Reserva DHCP', DHCP: 'DHCP',
  RESERVADA: 'Apartada', LIBRE: 'Libre',
};
const COLOR: Record<string, string> = {
  LIBRE: '#e7f7ee', EN_USO: '#eef2f9', RESERVADA: '#fff4e5',
  DUPLICADA: '#fdecec', GATEWAY: '#e8e3fb', POOL_DHCP: '#f1f3f7',
};

export default function Ipam() {
  const { can } = useAuth();
  const puedeEditar = can('asset.update');

  const [subredes, setSubredes] = useState<any[]>([]);
  const [hallazgos, setHallazgos] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const [mapa, setMapa] = useState<any>(null);
  const [libres, setLibres] = useState<any>(null);
  const [nueva, setNueva] = useState<any>(null);
  const [reserva, setReserva] = useState<any>(null);
  const [busca, setBusca] = useState('');
  const [resultado, setResultado] = useState<any>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const [s, h] = await Promise.all([
      api.get('/ipam/subredes').then((r) => r.data).catch(() => []),
      api.get('/ipam/hallazgos').then((r) => r.data).catch(() => null),
    ]);
    setSubredes(s || []); setHallazgos(h);
  }, []);

  useEffect(() => { setCargando(true); cargar().finally(() => setCargando(false)); }, [cargar]);

  useEffect(() => {
    if (busca.trim().length < 2) { setResultado(null); return; }
    const t = setTimeout(() => {
      api.get('/ipam/buscar', { params: { q: busca } }).then((r) => setResultado(r.data)).catch(() => setResultado(null));
    }, 300);
    return () => clearTimeout(t);
  }, [busca]);

  async function verMapa(id: string) {
    setError('');
    try { setMapa(await api.get(`/ipam/subredes/${id}/mapa`).then((r) => r.data)); }
    catch (e: any) { setError(mensajeDeError(e, 'dibujar el mapa')); }
  }

  async function verLibres(id: string) {
    setError('');
    try { setLibres(await api.get(`/ipam/subredes/${id}/libres`, { params: { n: 10 } }).then((r) => r.data)); }
    catch (e: any) { setError(mensajeDeError(e, 'calcular')); }
  }

  async function guardarSubred() {
    setOcupado(true); setError('');
    try {
      await api.post('/ipam/subredes', nueva);
      setMsg('Subred declarada.'); setNueva(null); await cargar();
    } catch (e: any) { setError(mensajeDeError(e, 'guardar')); }
    finally { setOcupado(false); }
  }

  async function guardarReserva() {
    setOcupado(true); setError('');
    try {
      const r = await api.post('/ipam/reservas', reserva);
      setMsg(r.data.avisos?.length ? `Reservada ${r.data.ip}. ${r.data.avisos.join(' ')}` : `Reservada ${r.data.ip}.`);
      setReserva(null); await cargar();
      if (mapa) await verMapa(mapa.subred.id);
    } catch (e: any) { setError(mensajeDeError(e, 'reservar')); }
    finally { setOcupado(false); }
  }

  return (
    <div className="page">
      <div className="card explica">
        <b>«Voy a instalar una cámara. ¿Qué IP le pongo?»</b>
        <div style={{ marginTop: 8 }}>
          Hoy eso se contesta con un Excel viejo o haciendo ping y usando la que no
          responde. Funciona hasta el día que el equipo estaba <b>apagado por
          mantenimiento</b> — y entonces hay dos con la misma IP, cayéndose a ratos.
          Como no falla siempre, nadie lo reproduce y todos culpan a la cámara.
        </div>
        <div style={{ marginTop: 8 }}>
          La ocupación <b>no sale de una sola tabla</b>: se cruza lo declarado aquí
          con la IP que de verdad tiene cada activo. Las diferencias no se esconden,
          se sacan como hallazgos.
        </div>
      </div>

      {msg && <div role="status" className="aviso-ok aviso-cerrable" onClick={() => setMsg('')} title="Toca para cerrar este aviso">{msg}</div>}
      {error && <div role="alert" className="aviso-error aviso-cerrable" onClick={() => setError('')} title="Toca para cerrar este aviso">{error}</div>}

      {/* ---------- LO QUE ESTÁ MAL ---------- */}
      {hallazgos && (
        <div className={hallazgos.graves > 0 ? 'card peligro' : 'card'}>
          <div className="section-title" style={{ marginTop: 0 }}>Estado del direccionamiento</div>

          {hallazgos.duplicadas.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <b style={{ color: '#8c1414' }}>
                {hallazgos.duplicadas.length} dirección(es) DUPLICADA(S) — esto rompe la red
              </b>
              <ul style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.7 }}>
                {hallazgos.duplicadas.map((d: any) => (
                  <li key={d.ip}><code>{d.ip}</code> en <b>{d.equipos.join(', ')}</b></li>
                ))}
              </ul>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                Dos equipos con la misma IP se tumban entre ellos de forma intermitente.
              </div>
            </div>
          )}

          {hallazgos.enPoolDhcp.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <b style={{ color: '#9a5b00' }}>
                {hallazgos.enPoolDhcp.length} IP fija dentro del rango del DHCP — bomba de tiempo
              </b>
              <ul style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.7 }}>
                {hallazgos.enPoolDhcp.map((d: any) => (
                  <li key={d.ip}><code>{d.ip}</code> — {d.assetCode} <span className="muted">({d.subred})</span></li>
                ))}
              </ul>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                Válido hasta que el DHCP reasigne la dirección a otro equipo.
              </div>
            </div>
          )}

          {hallazgos.invalidas.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <b style={{ color: '#8c1414' }}>{hallazgos.invalidas.length} IP mal escrita en la ficha</b>
              <ul style={{ margin: '4px 0 0', fontSize: 13 }}>
                {hallazgos.invalidas.map((d: any) => <li key={d.assetCode}><code>{d.ip}</code> — {d.assetCode}</li>)}
              </ul>
            </div>
          )}

          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 8 }}>
            <div><b style={{ fontSize: 22 }}>{hallazgos.sinDeclarar.length}</b>
              <div className="muted" style={{ fontSize: 12 }}>en uso y sin declarar</div></div>
            <div><b style={{ fontSize: 22 }}>{hallazgos.fueraDeSubred.length}</b>
              <div className="muted" style={{ fontSize: 12 }}>fuera de toda subred</div></div>
            <div><b style={{ fontSize: 22 }}>{hallazgos.reservadasSinUso.length}</b>
              <div className="muted" style={{ fontSize: 12 }}>reservadas y sin usar</div></div>
          </div>

          {hallazgos.graves === 0 && (
            <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              Nada grave. Lo de arriba es limpieza, no urgencia.
            </div>
          )}
        </div>
      )}

      <div className="filters">
        <div><label>Buscar una IP o un nombre
            <input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="10.20.4.87   ·   ¿de quién es esta IP?" style={{ minWidth: 260 }} />
          </label></div>
        {puedeEditar && (
          <button className="btn-primary" onClick={() => {
            setError('');
            setNueva({ cidr: '', nombre: '', proposito: 'CCTV', vlan: '', gateway: '', dns1: '', tren: '', dhcpDesde: '', dhcpHasta: '', descripcion: '' });
          }}>+ Declarar subred</button>
        )}
      </div>

      {resultado && (resultado.activos.length > 0 || resultado.reservas.length > 0) && (
        <div className="card">
          <div className="section-title" style={{ marginTop: 0 }}>Resultado</div>
          {resultado.activos.map((a: any) => (
            <div key={a.id} style={{ fontSize: 13.5, padding: '4px 0' }}>
              <code>{a.ipAddress}</code> — <b>{a.assetCode}</b> <span className="muted">({a.type}
              {a.location?.name ? `, ${a.location.name}` : ''})</span>
            </div>
          ))}
          {resultado.reservas.map((r: any) => (
            <div key={r.id} style={{ fontSize: 13.5, padding: '4px 0' }}>
              <code>{r.ip}</code> — reservada
              {r.asset ? ` para ${r.asset.assetCode}` : ''}{r.hostname ? ` · ${r.hostname}` : ''}
              <span className="muted">{r.subred ? ` (${r.subred.cidr})` : ''}</span>
            </div>
          ))}
        </div>
      )}

      {cargando && !subredes.length ? <EsqueletoTabla filas={4} /> : subredes.length === 0 ? (
        <div className="card vacio">
          <h3>No hay subredes declaradas</h3>
          <p>
            Empieza por la red CCTV de cada tren: CIDR, gateway y rango DHCP.
          </p>
        </div>
      ) : (
        <table className="tabla">
          <thead><tr><th>Subred</th><th>Nombre</th><th>Propósito</th><th>VLAN</th>
            <th className="num">Útiles</th><th className="num">Ocupada</th><th></th></tr></thead>
          <tbody>
            {subredes.map((s) => (
              <tr key={s.id}>
                <td><strong style={{ fontFamily: 'monospace' }}>{s.cidr}</strong>
                  {s.gateway && <div className="muted" style={{ fontSize: 11.5 }}>gw {s.gateway}</div>}</td>
                <td>{s.nombre}{s.tren && <span className="muted"> · {s.tren}</span>}</td>
                <td>{PROPOSITO[s.proposito]}</td>
                <td className="num">{s.vlan ?? <span className="muted">—</span>}</td>
                <td className="num">{s.utiles}</td>
                <td className="num">
                  <b style={{ color: s.pctOcupada > 85 ? 'var(--crit)' : s.pctOcupada > 60 ? 'var(--warn)' : 'var(--ok)' }}>
                    {s.pctOcupada}%
                  </b>
                  <div className="muted" style={{ fontSize: 11 }}>{s.libres} libres</div>
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="btn-mini" onClick={() => verLibres(s.id)}>¿Qué IP le pongo?</button>
                  <button className="btn-mini" style={{ marginLeft: 4 }} onClick={() => verMapa(s.id)}>Mapa</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ---------- SIGUIENTE LIBRE ---------- */}
      {libres && (
        <Modal title={`IP libres en ${libres.subred}`} onClose={() => setLibres(null)}>
          {libres.aviso ? (
            <div className="card peligro" style={{ marginTop: 0 }}>{libres.aviso}</div>
          ) : (
            <>
              <p style={{ fontSize: 13.5 }}>
                Las primeras libres, <b>saltando el gateway, lo reservado, lo que ya está
                en uso y el rango del DHCP</b>. Sugerir una del pool sería plantar la
                bomba de tiempo que este módulo existe para evitar.
              </p>
              <ul style={{ fontSize: 16, lineHeight: 1.9, fontFamily: 'monospace' }}>
                {libres.libres.map((ip: string) => <li key={ip}><b>{ip}</b></li>)}
              </ul>
            </>
          )}
        </Modal>
      )}

      {/* ---------- MAPA ---------- */}
      {mapa && (
        <Modal title={`${mapa.subred.cidr} · ${mapa.subred.nombre}`} onClose={() => setMapa(null)} ancho>
          <div className="form-grid">
            <div><b style={{ fontSize: 12 }}>Rango útil</b>
              <div style={{ fontFamily: 'monospace' }}>{mapa.subred.rango.primera} – {mapa.subred.rango.ultima}</div></div>
            <div><b style={{ fontSize: 12 }}>Gateway</b><div>{mapa.subred.gateway || '—'}</div></div>
            <div><b style={{ fontSize: 12 }}>VLAN</b><div>{mapa.subred.vlan ?? '—'}</div></div>
            <div><b style={{ fontSize: 12 }}>Pool DHCP</b>
              <div>{mapa.subred.dhcpDesde ? `${mapa.subred.dhcpDesde} – ${mapa.subred.dhcpHasta}` : 'sin declarar'}</div></div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '12px 0', fontSize: 11.5 }}>
            {Object.entries(COLOR).map(([k, c]) => (
              <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 12, height: 12, background: c, border: '1px solid var(--border)', borderRadius: 3 }} />
                {k.replace('_', ' ').toLowerCase()}
              </span>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 4 }}>
            {mapa.filas.map((f: any) => (
              <div key={f.ip}
                title={f.activos.map((a: any) => a.assetCode).join(', ') || f.reserva?.descripcion || ''}
                style={{
                  background: COLOR[f.estado], border: '1px solid var(--border)',
                  borderRadius: 6, padding: '5px 7px', fontSize: 11.5, lineHeight: 1.35,
                  cursor: puedeEditar && f.estado === 'LIBRE' ? 'pointer' : 'default',
                }}
                onClick={() => {
                  if (!puedeEditar || f.estado !== 'LIBRE') return;
                  setError('');
                  setReserva({ ip: f.ip, tipo: 'ESTATICA', hostname: '', mac: '', descripcion: '' });
                }}>
                <div style={{ fontFamily: 'monospace', fontWeight: 700 }}>{f.ip}</div>
                <div className="muted" style={{ fontSize: 10.5 }}>
                  {f.activos.length > 0 ? f.activos.map((a: any) => a.assetCode).join(' + ')
                    : f.reserva ? (f.reserva.hostname || f.reserva.descripcion || TIPO[f.reserva.tipo])
                    : f.estado === 'GATEWAY' ? 'gateway'
                    : f.estado === 'POOL_DHCP' ? 'pool DHCP'
                    : 'libre'}
                </div>
              </div>
            ))}
          </div>
          {puedeEditar && (
            <div className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
              Pulsa una dirección libre para reservarla.
            </div>
          )}
        </Modal>
      )}

      {/* ---------- NUEVA SUBRED ---------- */}
      {nueva && (
        <Modal title="Declarar subred" onClose={() => setNueva(null)} ancho
          acciones={<>
            <button className="btn-mini" onClick={() => setNueva(null)}>Cancelar</button>
            <BotonConMotivo onClick={guardarSubred} ocupado={ocupado}
              falta={queFalta([!nueva.cidr.includes('/'), 'La red va con su máscara, por ejemplo 10.20.1.0/24.'])}>
              {ocupado ? 'Guardando…' : 'Guardar'}
            </BotonConMotivo>
          </>}>
          {error && <div role="alert" className="aviso-error">{error}</div>}
          <div className="form-grid">
            <label className="campo">
              <span>CIDR <b className="campo-req">*</b></span>
              <input value={nueva.cidr} autoComplete="off"
                onChange={(e) => setNueva({ ...nueva, cidr: e.target.value })} placeholder="10.20.4.0/24" />
              <small className="muted">
                Se guarda normalizado: si escribes 10.20.4.14/24 se guarda 10.20.4.0/24.
              </small>
            </label>
            <label className="campo"><span>Nombre</span>
              <input value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })}
                placeholder="CCTV Tren 2" /></label>
            <label className="campo"><span>Propósito</span>
              <select value={nueva.proposito} onChange={(e) => setNueva({ ...nueva, proposito: e.target.value })}>
                {Object.entries(PROPOSITO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
            <label className="campo"><span>VLAN</span>
              <input type="number" value={nueva.vlan} onChange={(e) => setNueva({ ...nueva, vlan: e.target.value })} /></label>
            <label className="campo"><span>Gateway</span>
              <input value={nueva.gateway} onChange={(e) => setNueva({ ...nueva, gateway: e.target.value })}
                placeholder="10.20.4.1" />
              <small className="muted">Se comprueba que caiga dentro de la subred.</small></label>
            <label className="campo"><span>DNS</span>
              <input value={nueva.dns1} onChange={(e) => setNueva({ ...nueva, dns1: e.target.value })} /></label>
            <label className="campo"><span>Tren</span>
              <select value={nueva.tren} onChange={(e) => setNueva({ ...nueva, tren: e.target.value })}>
                <option value="">No aplica</option>
                {['T1', 'T2', 'T3'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select></label>
            <label className="campo"><span>Pool DHCP · desde</span>
              <input value={nueva.dhcpDesde} onChange={(e) => setNueva({ ...nueva, dhcpDesde: e.target.value })}
                placeholder="10.20.4.100" /></label>
            <label className="campo"><span>Pool DHCP · hasta</span>
              <input value={nueva.dhcpHasta} onChange={(e) => setNueva({ ...nueva, dhcpHasta: e.target.value })}
                placeholder="10.20.4.200" />
              <small className="muted">
                Declararlo es lo que evita que alguien ponga una fija dentro del pool.
              </small></label>
            <label className="campo campo-ancho"><span>Descripción</span>
              <textarea value={nueva.descripcion} onChange={(e) => setNueva({ ...nueva, descripcion: e.target.value })} /></label>
          </div>
        </Modal>
      )}

      {/* ---------- RESERVAR ---------- */}
      {reserva && (
        <Modal title={`Reservar ${reserva.ip}`} onClose={() => setReserva(null)}
          acciones={<>
            <button className="btn-mini" onClick={() => setReserva(null)}>Cancelar</button>
            <button className="btn-primary" onClick={guardarReserva} disabled={ocupado}>
              {ocupado ? 'Guardando…' : 'Reservar'}
            </button>
          </>}>
          {error && <div role="alert" className="aviso-error">{error}</div>}
          <div className="form-grid">
            <label className="campo"><span>Tipo</span>
              <select value={reserva.tipo} onChange={(e) => setReserva({ ...reserva, tipo: e.target.value })}>
                {Object.entries(TIPO).filter(([k]) => k !== 'LIBRE').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
            <label className="campo"><span>Nombre del equipo</span>
              <input value={reserva.hostname} onChange={(e) => setReserva({ ...reserva, hostname: e.target.value })}
                placeholder="CAM-T2-LE-014" /></label>
            <label className="campo"><span>MAC</span>
              <input value={reserva.mac} onChange={(e) => setReserva({ ...reserva, mac: e.target.value })}
                placeholder="00:1A:2B:3C:4D:5E" />
              <small className="muted">
                A mano, igual que en Equipos conocidos: la MAC no llega al servidor.
              </small></label>
            <label className="campo campo-ancho"><span>Para qué</span>
              <input value={reserva.descripcion} onChange={(e) => setReserva({ ...reserva, descripcion: e.target.value })}
                placeholder="Cámara nueva del lecho de enfriamiento" /></label>
          </div>
        </Modal>
      )}
    </div>
  );
}
