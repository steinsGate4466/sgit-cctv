import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import Icono from '../components/Iconos';
import { useAuth } from '../auth/AuthContext';
import { EsqueletoTablero } from '../components/Esqueleto';

/**
 * MONITOREO — estado observado de la red (bloque 8).
 *
 * ESTÁ MONTADO Y APAGADO, y la pantalla lo dice sin rodeos. Mientras no haya
 * un agente instalado en planta no llega ni un dato, y enseñar ceros o
 * gráficas vacías haría creer que todo está bien. Prefiero una pantalla que
 * explique por qué no hay nada que una que finja.
 *
 * Lo OBSERVADO va aparte de lo DECLARADO: una cámara marcada OPERATIVO que
 * no responde no es una contradicción, es la información que hoy falta.
 */
export default function Monitoreo() {
  const { can } = useAuth();
  const [resumen, setResumen] = useState<any>(null);
  const [agentes, setAgentes] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [nuevo, setNuevo] = useState(false);
  const [nombre, setNombre] = useState('');
  const [creado, setCreado] = useState<any>(null);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    const [r, a] = await Promise.all([
      api.get('/monitoreo/resumen').then((x) => x.data).catch(() => null),
      can('monitor.manage')
        ? api.get('/monitoreo/agentes').then((x) => x.data).catch(() => [])
        : Promise.resolve([]),
    ]);
    setResumen(r);
    setAgentes(a || []);
  }, [can]);

  useEffect(() => { cargar().finally(() => setCargando(false)); }, [cargar]);

  async function crear() {
    setError('');
    try {
      const { data } = await api.post('/monitoreo/agentes', { nombre });
      setCreado(data);
      setNuevo(false);
      setNombre('');
      await cargar();
    } catch (e: any) {
      const m = e?.response?.data?.message;
      setError(Array.isArray(m) ? m.join(', ') : m || 'No se pudo crear el agente.');
    }
  }

  if (cargando) return <EsqueletoTablero kpis={4} paneles={1} />;

  const apagado = !resumen?.monitoreoActivo;

  return (
    <div>
      <h1 className="page-title">Monitoreo de red</h1>
      <p className="page-sub">
        Lo que se ve en la red, aparte de lo que dice el sistema.
      </p>

      {apagado ? (
        <div className="card vacio">
          <Icono n="alerta" size={40} />
          <h3>El monitoreo está montado, pero apagado</h3>
          <p>
            Todo está listo: la base de datos, la puerta de entrada y el
            programa que hace las comprobaciones. Falta una sola cosa —
            <b> instalar el agente en una máquina de planta</b>, y para eso
            hace falta el visto bueno de TI.
          </p>
          <p style={{ marginTop: 12 }}>
            El agente <b>no abre ningún puerto</b>: se conecta él hacia fuera,
            por HTTPS. La red industrial no queda expuesta.
          </p>
        </div>
      ) : (
        <div className="kpi-grid">
          <Kpi label="Responden" v={resumen.RESPONDE} cls="ok" hint="Comprobados hace menos de 15 minutos" />
          <Kpi label="No responden" v={resumen.CAIDO} cls="crit" hint="Tres comprobaciones seguidas fallidas" />
          <Kpi label="Inestables" v={resumen.INESTABLE} cls="warn" hint="Pérdidas sueltas o respuesta lenta" />
          <Kpi label="Sin dato" v={resumen.SIN_DATO} hint="Nunca comprobados, o el dato ya caducó" />
        </div>
      )}

      {can('monitor.manage') && (
        <>
          <div className="section-title">Agentes de planta</div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <button className="btn-primary" onClick={() => { setNuevo(true); setError(''); }}>
              + Nuevo agente
            </button>
          </div>

          {agentes.length === 0 ? (
            <div className="card vacio">
              <h3>Todavía no hay ningún agente</h3>
              <p>
                Cuando TI autorice, crea uno aquí, copia su token y arranca el
                programa <code>agente/agente-planta.js</code> en una máquina de
                planta con Node.js.
              </p>
            </div>
          ) : (
            <div className="card">
              <table>
                <thead>
                  <tr><th>Agente</th><th>Última vez que reportó</th><th>Desde</th><th>Estado</th></tr>
                </thead>
                <tbody>
                  {agentes.map((a) => (
                    <tr key={a.id}>
                      <td>{a.name}</td>
                      <td className="muted">{a.lastIp || '—'}</td>
                      <td>{a.desde}</td>
                      <td>
                        {/* Un agente callado es tan grave como una cámara
                            caída: deja de haber información y nadie se entera,
                            porque no hay nada que mirar. */}
                        <span className={'badge ' + (a.silencioso ? 'FUERA_SERVICIO' : 'OPERATIVO')}>
                          {a.silencioso ? 'sin reportar' : 'reportando'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {nuevo && (
        <Modal title="Nuevo agente de planta" onClose={() => setNuevo(false)}>
          <p className="muted" style={{ fontSize: 13, margin: '0 0 12px', lineHeight: 1.55 }}>
            Nombre del punto de instalación, por ejemplo «PC del púlpito Tren 2».
          </p>
          <label>Nombre
            <input value={nombre} onChange={(e) => setNombre(e.target.value)}
                 placeholder="PC del púlpito Tren 2" />
          </label>
          {error && <div className="error">{error}</div>}
          <button className="btn" onClick={crear} disabled={nombre.trim().length < 3}>
            Crear y generar token
          </button>
        </Modal>
      )}

      {creado && (
        <Modal title="Token del agente" onClose={() => setCreado(null)}>
          <div className="error">
            Cópialo ahora. <b>No se vuelve a mostrar.</b> En la base sólo queda
            su huella, así que ni yo ni nadie puede recuperarlo: si se pierde,
            se genera otro.
          </div>
          <div style={{
            fontFamily: 'monospace', fontSize: 12, background: '#f4f6fa',
            border: '1px solid var(--border)', borderRadius: 8, padding: 12,
            margin: '12px 0', wordBreak: 'break-all',
          }}>
            {creado.token}
          </div>
          <button className="btn-mini" onClick={() => navigator.clipboard?.writeText(creado.token)}>
            Copiar
          </button>
          <div className="detail-sec">
            <h4>En la máquina de planta</h4>
            <div style={{ fontFamily: 'monospace', fontSize: 11.5, lineHeight: 1.9 }}>
              set SGIT_URL=https://…up.railway.app<br />
              set SGIT_AGENT_TOKEN=…<br />
              node agente-planta.js --simular
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              La primera vez, con <b>--simular</b>: hace las comprobaciones y
              enseña el resultado sin enviar nada. Es lo que conviene mostrarle
              a TI antes de dejarlo suelto.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Kpi({ label, v, cls, hint }: { label: string; v: number; cls?: string; hint: string }) {
  return (
    <div className={'kpi ' + (cls || '')}>
      <div className="label">{label}</div>
      <div className="value">{v ?? 0}</div>
      <div className="hint">{hint}</div>
    </div>
  );
}
