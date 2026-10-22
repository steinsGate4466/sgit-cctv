import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import Modal from '../components/Modal';
import Icono from '../components/Iconos';
import FiltroAmbito, { Ambito, AMBITO_VACIO, conAmbito } from '../components/FiltroAmbito';
import { EsqueletoTabla } from '../components/Esqueleto';
import { useAuth } from '../auth/AuthContext';
import { useDialogos } from '../components/Dialogos';
import BotonConMotivo from '../components/BotonConMotivo';
import { mensajeDeError, queFalta } from '../avisos';
import { TarjetaSwitch } from '../components/SwitchYPuertos';
import { ComoSeCalcula } from '../components/Patron';

/**
 * CONEXIONES DE RED (bloque 12.1).
 *
 * LA PANTALLA QUE FALTABA.
 * El mapa y el análisis de impacto llevaban semanas construidos, pero no
 * había dónde decir qué está conectado con qué. Aquí se declara, y todo lo
 * demás empieza a funcionar solo.
 *
 * DOS PESTAÑAS, PORQUE SON DOS COSAS DISTINTAS
 *   · PUERTOS — el switch dibujado puerto por puerto. Es el dato bueno,
 *     el que se anota al cablear.
 *   · ENLACES — lo que no pasa por un puerto numerado: el anillo de fibra,
 *     un radioenlace entre naves.
 */

const TIPO: Record<string, string> = {
  CAMERA: 'Cámara', NVR: 'NVR', SWITCH: 'Switch', WIRELESS: 'Enlace', ROUTER: 'Router',
  FIREWALL: 'Firewall', SERVER: 'Servidor', UPS: 'UPS', CABINET: 'Gabinete',
  DECODER: 'Decodificador', PC: 'PC / iVMS', OTHER: 'Otro',
};
const MEDIO: Record<string, string> = {
  FIBRA: 'Fibra', COBRE: 'Cobre', INALAMBRICO: 'Radioenlace',
};

/** Bloque 172 · qué equipos pueden ser extremo según el medio del enlace. */
export function aptoPara(medio: string, tipo: string): boolean {
  if (medio === 'INALAMBRICO') return tipo === 'WIRELESS';
  if (medio === 'FIBRA') return tipo !== 'WIRELESS';
  return true;
}

export default function Conexiones() {
  const { confirmar, avisar } = useDialogos();
  const { can } = useAuth();
  const puedeEditar = can('asset.update');

  const [pestana, setPestana] = useState<'puertos' | 'enlaces'>('puertos');
  const [ambito, setAmbito] = useState<Ambito>(AMBITO_VACIO);
  const [switches, setSwitches] = useState<any[]>([]);
  const [enlaces, setEnlaces] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState('');

  /* Bloque 173 · `?switch=<id>` llega desde la ficha de un equipo («ver en
     Conexiones»): se abre ese switch y se lleva la vista hasta él. */
  const [params] = useSearchParams();
  const switchPedido = params.get('switch');
  const [buscaSw, setBuscaSw] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errorModal, setErrorModal] = useState('');

  // Alta de enlace
  const [nuevoEnlace, setNuevoEnlace] = useState(false);
  const [ladoA, setLadoA] = useState('');
  const [ladoB, setLadoB] = useState('');
  const [medio, setMedio] = useState('FIBRA');
  const [anillo, setAnillo] = useState(false);
  const [descripcion, setDescripcion] = useState('');
  const [todos, setTodos] = useState<any[]>([]);

  const cargar = useCallback(async () => {
    try {
      const [sw, en] = await Promise.all([
        api.get('/conexiones/switches', { params: conAmbito({}, ambito) }).then((r) => r.data),
        api.get('/conexiones/enlaces', { params: conAmbito({}, ambito) }).then((r) => r.data),
      ]);
      setSwitches(sw || []);
      setEnlaces(en || []);
      setFallo('');
    } catch (e: any) {
      setFallo(e?.response?.status === 403
        ? 'Tu usuario no tiene permiso para ver la red.'
        : 'No se pudieron cargar las conexiones. Vuelve a intentarlo.');
    }
  }, [ambito]);

  useEffect(() => { setCargando(true); cargar().finally(() => setCargando(false)); }, [cargar]);

  async function abrirNuevoEnlace() {
    setNuevoEnlace(true);
    setLadoA(''); setLadoB(''); setMedio('FIBRA'); setAnillo(false);
    setDescripcion(''); setErrorModal('');
    try {
      const r = await api.get('/conexiones/candidatos');
      setTodos(r.data || []);
    } catch { setTodos([]); }
  }

  async function guardarEnlace() {
    setGuardando(true);
    setErrorModal('');
    try {
      await api.post('/conexiones/enlaces', {
        endpointAId: ladoA, endpointBId: ladoB, medium: medio,
        isRing: anillo, description: descripcion.trim() || undefined,
      });
      setNuevoEnlace(false);
      await cargar();
    } catch (e: any) {
      setErrorModal(mensajeDeError(e, 'crear el enlace'));
    } finally { setGuardando(false); }
  }

  async function borrarEnlace(id: string, texto: string) {
    if (!(await confirmar(`¿Borrar el enlace ${texto}?`))) return;
    try { await api.delete(`/conexiones/enlaces/${id}`); await cargar(); }
    catch (e) { await avisar(mensajeDeError(e, 'borrar el enlace')); }
  }

  return (
    <div className="page">
      <div className="page-head">
        <FiltroAmbito valor={ambito} onChange={setAmbito} />
      </div>

      {/* Síntesis 21/10: una línea arriba; el resto, plegado al final. */}
      <p className="page-sub">Qué está conectado con qué.</p>

      <div className="pestanas">
        <button className={pestana === 'puertos' ? 'act' : ''} onClick={() => setPestana('puertos')}>
          Puertos de switch ({switches.length})
        </button>
        <button className={pestana === 'enlaces' ? 'act' : ''} onClick={() => setPestana('enlaces')}>
          Enlaces declarados ({enlaces.length})
        </button>
      </div>

      {fallo && <div className="card aviso-error">{fallo}</div>}
      {cargando && <EsqueletoTabla filas={4} />}

      {/* ---------- PUERTOS ---------- */}
      {!cargando && pestana === 'puertos' && (
        switches.length === 0 ? (
          <div className="card vacio">
            <h3>No hay switches registrados</h3>
            <p>Se dan de alta en <Link to="/assets">Activos</Link> como tipo Switch.</p>
          </div>
        ) : (
          <>
            <div className="sw-barra">
              <label className="campo" style={{ flex: 1, minWidth: 200, margin: 0 }}>
                <span>Buscar switch</span>
                <input value={buscaSw} onChange={(e) => setBuscaSw(e.target.value)} placeholder="Código, modelo o sitio" />
              </label>
              <div className="sw-leyenda" aria-label="Leyenda">
                <span><i className="ley libre" /> libre</span>
                <span><i className="ley ocupado" /> ocupado</span>
                <span><span className="p-poe">PoE</span> da corriente</span>
                <span><span className="p-vlan">V10</span> VLAN</span>
                <span>↔ enlace</span>
              </div>
            </div>
            {switches
              .filter((sw) => !switchPedido || sw.id === switchPedido || buscaSw)
              .filter((sw) => {
                const t = buscaSw.trim().toLowerCase();
                return !t || [sw.code, sw.modelo, sw.lugar, sw.tren].some((x) => String(x || '').toLowerCase().includes(t));
              })
              .map((sw) => (
                <TarjetaSwitch key={sw.id} sw={sw} puedeEditar={puedeEditar}
                  resaltado={sw.id === switchPedido} onCambio={cargar} />
              ))}
            {switchPedido && !buscaSw && switches.length > 1 && (
              <Link className="btn-mini" to="/conexiones">Ver todos los switches ({switches.length})</Link>
            )}
          </>
        )
      )}

      {/* ---------- ENLACES ---------- */}
      {!cargando && pestana === 'enlaces' && (
        <>
          {puedeEditar && (
            <button className="btn-primary" style={{ marginBottom: 12 }} onClick={abrirNuevoEnlace}>
              <Icono n="cableado" size={16} /> Declarar un enlace
            </button>
          )}
          {enlaces.length === 0 ? (
            <div className="card vacio">
              <h3>No hay enlaces declarados</h3>
              <p>Fibra del anillo y radioenlaces entre naves.</p>
            </div>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th>Medio</th><th>Extremo A</th><th>Extremo B</th>
                  <th>Anillo</th><th>Detalle</th>{puedeEditar && <th></th>}
                </tr>
              </thead>
              <tbody>
                {enlaces.map((e) => (
                  <tr key={e.id}>
                    <td>{MEDIO[e.medio] || e.medio}</td>
                    <td><strong>{e.a.code}</strong></td>
                    <td><strong>{e.b.code}</strong></td>
                    <td>{e.esAnillo ? 'Sí' : '—'}</td>
                    <td>{e.descripcion || '—'}</td>
                    {puedeEditar && (
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn-mini" onClick={() => borrarEnlace(e.id, `${e.a.code} ↔ ${e.b.code}`)}>
                          Borrar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {/* ---------- MODAL: ENLACE ---------- */}
      {nuevoEnlace && (
        <Modal
          title="Declarar un enlace"
          onClose={() => setNuevoEnlace(false)}
          acciones={
            <>
              <button className="btn-mini" onClick={() => setNuevoEnlace(false)}>Cancelar</button>
              <BotonConMotivo onClick={guardarEnlace} ocupado={guardando}
                falta={queFalta(
                  [!ladoA, 'Elige el equipo del lado A.'],
                  [!ladoB, 'Elige el equipo del lado B.'],
                )}>
                {guardando ? 'Guardando…' : 'Crear enlace'}
              </BotonConMotivo>
            </>
          }
        >
          {errorModal && <div role="alert" className="aviso-error" style={{ marginBottom: 10 }}>{errorModal}</div>}

          {/* Bloque 172 · el medio va PRIMERO y decide qué extremos tienen
              sentido: un radioenlace es de antena a antena; la fibra no llega
              a una antena. Antes se podía declarar «inalámbrico» entre dos
              switches y el mapa de red dibujaba un enlace que no existe. */}
          <label className="campo">
            <span>Medio</span>
            <select value={medio} onChange={(e) => {
              const m = e.target.value;
              setMedio(m);
              const vale = (id: string) => !id || todos.some((c) => c.id === id && aptoPara(m, c.tipo));
              if (!vale(ladoA)) setLadoA('');
              if (!vale(ladoB)) setLadoB('');
              if (m !== 'FIBRA') setAnillo(false);
            }}>
              <option value="FIBRA">Fibra</option>
              <option value="COBRE">Cobre</option>
              <option value="INALAMBRICO">Radioenlace</option>
            </select>
          </label>

          <label className="campo">
            <span>Extremo A</span>
            <select value={ladoA} onChange={(e) => setLadoA(e.target.value)}>
              <option value="">— elegir —</option>
              {todos.filter((c) => aptoPara(medio, c.tipo)).map((c) => <option key={c.id} value={c.id}>{c.code} ({TIPO[c.tipo] || c.tipo})</option>)}
            </select>
          </label>

          <label className="campo">
            <span>Extremo B</span>
            <select value={ladoB} onChange={(e) => setLadoB(e.target.value)}>
              <option value="">— elegir —</option>
              {todos.filter((c) => c.id !== ladoA && aptoPara(medio, c.tipo)).map((c) => (
                <option key={c.id} value={c.id}>{c.code} ({TIPO[c.tipo] || c.tipo})</option>
              ))}
            </select>
          </label>


          {medio === 'FIBRA' && (
          <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 13, margin: '10px 0' }}
            title="Marcarlo permite detectar camino alternativo: un anillo declarado da impacto cero.">
            <input type="checkbox" checked={anillo} onChange={(e) => setAnillo(e.target.checked)} />
            Es un tramo del anillo de fibra
          </label>
          )}

          <label className="campo">
            <span>Detalle (opcional)</span>
            <input
              value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej: tramo Púlpito T1 → Sala de servidores" maxLength={200}
            />
          </label>
        </Modal>
      )}

      <ComoSeCalcula>
        <p>
          De aquí salen el mapa de la red y qué se deja de ver si un equipo cae.
          <b> Puertos</b>: lo que va a un puerto numerado del switch (el dato bueno).
          <b> Enlaces</b>: fibra del anillo y radioenlaces.
        </p>
        <p>
          Un tramo marcado como <b>anillo</b> le dice al análisis que hay camino
          alternativo: un anillo bien montado da impacto cero. Las cámaras se
          enlazan a su grabador en <b>Grabadores</b>.
        </p>
      </ComoSeCalcula>
    </div>
  );
}
