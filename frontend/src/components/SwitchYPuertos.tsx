import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import Modal from './Modal';
import { useDialogos } from './Dialogos';
import { mensajeDeError } from '../avisos';
import { NOMBRE_DE_TIPO } from '../tipos-de-equipo';

/* =============================================================================
   UN SWITCH Y SUS PUERTOS — bloque 173
   -----------------------------------------------------------------------------
   El usuario: «en el switch no se está guardando qué puertos se ha
   seleccionado». SÍ se guardaba: la rejilla buscaba `x.número` (con tilde) y
   el servidor manda `numero`, así que ningún puerto aparecía ocupado nunca.

   Al rehacerla se cerró lo demás que un técnico de red echa en falta delante
   de un switch:
   · La VLAN de cada puerto se VE en la rejilla (antes sólo dentro del modal).
   · PoE con su cuenta: «PoE 3 de 8». No se marca un 9.º si la ficha dice 8.
   · Un switch plano (sin VLAN) no deja escribir una VLAN que no puede tener.
   · Un switch/router en un puerto se marca ENLACE: es la subida, y si cae,
     cae todo lo de detrás.
   · Cámara o antena en un puerto sin PoE → aviso: necesita inyector o fuente.
   · Si falta «cuántos puertos tiene», se declara AQUÍ (antes mandaba a otra
     pantalla y la rejilla no salía).
   · Cada casilla es un botón de verdad: se abre con teclado y con el dedo.
============================================================================= */

export interface Puerto {
  id: string; numero: number; poe: boolean; vlan: number | null;
  enlace?: boolean; aviso?: string | null;
  equipo: null | { id: string; code: string; tipo: string; estado: string; lugar?: string | null; modelo?: string | null };
}

const CAPA: Record<string, string> = { CAPA_2: 'Capa 2', CAPA_3: 'Capa 3' };
const ESTADO: Record<string, string> = {
  OPERATIVO: 'Operativo', FUERA_SERVICIO: 'Fuera de servicio', MANTENIMIENTO: 'En mantenimiento', STOCK: 'En stock',
};

/** Qué dice la ficha sobre cómo se configura este switch, en una línea. */
function comoEs(sw: any): string[] {
  const t: string[] = [];
  if (sw.capa) t.push(CAPA[sw.capa] || sw.capa);
  if (sw.gestionable === false) t.push('no gestionable');
  if (sw.gestionable === true) t.push('gestionable');
  if (sw.soportaVlan === false) t.push('sin VLAN');
  if (sw.fabricante) t.push(sw.fabricante);
  return t;
}

export function TarjetaSwitch({ sw, puedeEditar, resaltado, onCambio }: {
  sw: any; puedeEditar: boolean; resaltado?: boolean; onCambio: () => Promise<void> | void;
}) {
  const { confirmar, avisar } = useDialogos();
  const [abierto, setAbierto] = useState<{ numero: number; puerto: Puerto | null } | null>(null);
  const [recien, setRecien] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (resaltado) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [resaltado]);

  const porNumero = new Map<number, Puerto>((sw.puertos as Puerto[]).map((p) => [p.numero, p]));
  const total = Math.max(sw.capacidad || 0, ...(sw.puertos as Puerto[]).map((p) => p.numero), 0);
  const ficha = comoEs(sw);

  async function desenchufar(p: Puerto) {
    if (!p.equipo) return;
    if (!(await confirmar(`¿Desenchufar ${p.equipo.code} del puerto ${p.numero}?\n\nEl equipo NO se borra. La VLAN y el PoE del puerto se quedan como están.`))) return;
    try { await api.delete(`/conexiones/puertos/${p.id}`); await onCambio(); }
    catch (e) { await avisar(mensajeDeError(e, 'desenchufar')); }
  }

  return (
    <div ref={ref} className={'card sw-tarjeta' + (resaltado ? ' resaltado' : '')} id={'sw-' + sw.id}>
      <div className="sw-cabecera">
        <div>
          <strong>{sw.code}</strong>
          <span className={`chip est-${sw.estado}`} style={{ marginLeft: 8 }}>{ESTADO[sw.estado] || sw.estado}</span>
          <div className="muted" style={{ fontSize: 12.5 }}>
            {[sw.lugar || sw.modelo, sw.tren].filter(Boolean).join(' · ') || '—'}
          </div>
          {ficha.length > 0 && <div className="sw-ficha">{ficha.map((f) => <span key={f}>{f}</span>)}</div>}
        </div>
        <div className="sw-cifras">
          <div><b>{sw.ocupados}</b><span>ocupados</span></div>
          <div className={sw.libres === 0 ? 'lleno' : ''}><b>{sw.libres ?? '?'}</b><span>libres</span></div>
          <div title="Puertos marcados con PoE, contra los que dice la ficha">
            <b>{sw.poeUsados}{sw.poePuertos != null ? `/${sw.poePuertos}` : ''}</b><span>PoE</span>
          </div>
        </div>
      </div>

      {sw.capacidad == null && (
        <DeclararPuertos sw={sw} puedeEditar={puedeEditar} onHecho={onCambio} />
      )}

      {total > 0 && (
        <div className="rejilla-puertos" role="list" aria-label={`Puertos de ${sw.code}`}>
          {Array.from({ length: total }, (_, i) => i + 1).map((n) => {
            const p = porNumero.get(n) || null;
            const eq = p?.equipo;
            const clases = ['puerto', eq ? 'ocupado' : 'libre'];
            if (p?.enlace) clases.push('enlace');
            if (eq && eq.estado !== 'OPERATIVO') clases.push('con-falla');
            if (recien === n) clases.push('recien');
            /* En un switch sin VLAN, una VLAN guardada es un resto: no se pinta. */
            const vlan = sw.soportaVlan === false ? null : p?.vlan ?? null;
            const etiqueta = `Puerto ${n}${p?.poe ? ', con PoE' : ''}${vlan != null ? `, VLAN ${vlan}` : ''}: ${eq ? `${eq.code}` : 'libre'}`;
            return (
              <div key={n} className={clases.join(' ')} role="listitem">
                <button type="button" className="puerto-abrir" disabled={!puedeEditar}
                  aria-label={etiqueta} title={p?.aviso || etiqueta}
                  onClick={() => setAbierto({ numero: n, puerto: p })}>
                  <span className="p-num">
                    {n}
                    {p?.poe && <span className="p-poe" title="Este puerto da corriente (PoE)">PoE</span>}
                    {vlan != null && <span className="p-vlan" title={`VLAN ${vlan}`}>V{vlan}</span>}
                  </span>
                  {eq ? (
                    <>
                      <span className="p-code">{eq.code}</span>
                      <span className="p-tipo">
                        {p?.enlace ? '↔ enlace · ' : ''}{NOMBRE_DE_TIPO[eq.tipo] || eq.tipo}
                        {p?.aviso ? ' ⚠' : ''}
                      </span>
                    </>
                  ) : (
                    <span className="p-libre">{puedeEditar ? '+ enchufar' : 'libre'}</span>
                  )}
                </button>
                {eq && puedeEditar && (
                  <button type="button" className="canal-quitar" aria-label={`Desenchufar ${eq.code} del puerto ${n}`}
                    title="Desenchufar" onClick={() => desenchufar(p!)}>×</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {abierto && (
        <ModalPuerto sw={sw} numero={abierto.numero} puerto={abierto.puerto}
          onCerrar={() => setAbierto(null)}
          onGuardado={async () => {
            const n = abierto.numero;
            setAbierto(null);
            await onCambio();
            setRecien(n);
            setTimeout(() => setRecien((x) => (x === n ? null : x)), 2500);
          }} />
      )}
    </div>
  );
}

/** Falta la cantidad de puertos: se declara aquí mismo, con la etiqueta del frontal. */
function DeclararPuertos({ sw, puedeEditar, onHecho }: { sw: any; puedeEditar: boolean; onHecho: () => Promise<void> | void }) {
  const [puertos, setPuertos] = useState('');
  const [poe, setPoe] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  if (!puedeEditar) {
    return (
      <div className="tg-aviso" style={{ marginTop: 8 }}>
        Falta el número de puertos del switch. Sin ese dato no se dibuja la rejilla ni se calculan los libres.
      </div>
    );
  }
  async function guardar() {
    if (guardando) return;
    setError('');
    if (!puertos.trim()) { setError('Escribe cuántos puertos tiene (mira la etiqueta del frontal).'); return; }
    setGuardando(true);
    try {
      await api.patch(`/conexiones/switches/${sw.id}/puertos`, {
        puertos: Number(puertos), poe: poe.trim() === '' ? null : Number(poe),
      });
      await onHecho();
    } catch (e) { setError(mensajeDeError(e, 'guardar')); }
    finally { setGuardando(false); }
  }
  return (
    <div className="sw-declarar">
      <b>¿Cuántos puertos tiene?</b> Sin este dato no hay rejilla.
      <div className="sw-declarar-campos">
        <label>Puertos<input type="number" min={1} max={96} value={puertos} onChange={(e) => setPuertos(e.target.value)} placeholder="Ej: 24" /></label>
        <label>Con PoE<input type="number" min={0} max={96} value={poe} onChange={(e) => setPoe(e.target.value)} placeholder="Ej: 16" /></label>
        <button type="button" className="btn-primary" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
      {error && <div role="alert" className="aviso-error" style={{ marginTop: 6 }}>{error}</div>}
    </div>
  );
}

const FILTROS_TIPO: { v: string; t: string }[] = [
  { v: '', t: 'Todos' }, { v: 'CAMERA', t: 'Cámaras' }, { v: 'WIRELESS', t: 'Antenas' },
  { v: 'RED', t: 'Switch / router' }, { v: 'NVR', t: 'Grabadores' }, { v: 'OTRO', t: 'Otros' },
];
const ES_RED = ['SWITCH', 'ROUTER', 'FIREWALL'];
function pasaFiltro(tipo: string, f: string) {
  if (!f) return true;
  if (f === 'RED') return ES_RED.includes(tipo);
  if (f === 'OTRO') return !['CAMERA', 'WIRELESS', 'NVR', ...ES_RED].includes(tipo);
  return tipo === f;
}

function ModalPuerto({ sw, numero, puerto, onCerrar, onGuardado }: {
  sw: any; numero: number; puerto: Puerto | null; onCerrar: () => void; onGuardado: () => Promise<void> | void;
}) {
  const actual = puerto?.equipo ?? null;
  const [candidatos, setCandidatos] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('');
  const [elegido, setElegido] = useState<string>(actual?.id || '');
  const [poe, setPoe] = useState(!!puerto?.poe);
  const [vlan, setVlan] = useState(puerto?.vlan != null ? String(puerto.vlan) : '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  /* Busca al escribir (300 ms), con la guardia del bloque 115: una respuesta
     vieja no pisa a una nueva. */
  useEffect(() => {
    let vivo = true;
    setCargando(true);
    const t = setTimeout(() => {
      api.get('/conexiones/candidatos', { params: { switchId: sw.id, ...(busca.trim() ? { q: busca.trim() } : {}) } })
        .then((r) => { if (vivo) setCandidatos(r.data || []); })
        .catch(() => { if (vivo) setCandidatos([]); })
        .finally(() => { if (vivo) setCargando(false); });
    }, busca ? 300 : 0);
    return () => { vivo = false; clearTimeout(t); };
  }, [busca, sw.id]);

  const lista = candidatos.filter((c) => pasaFiltro(c.tipo, filtro));
  const mismos = lista.filter((c) => c.mismoTren);
  const otros = lista.filter((c) => !c.mismoTren);
  const tipoElegido = elegido === actual?.id ? actual?.tipo : candidatos.find((c) => c.id === elegido)?.tipo;

  const poeOtros = (sw.poeUsados || 0) - (puerto?.poe ? 1 : 0);
  const sinPoeLibre = sw.poePuertos != null && poeOtros >= sw.poePuertos;
  const sinVlan = sw.soportaVlan === false;

  const vlanNum = vlan.trim() === '' ? null : Number(vlan);
  const vlanMal = vlanNum != null && (!Number.isInteger(vlanNum) || vlanNum < 1 || vlanNum > 4094);

  async function guardar() {
    if (guardando) return;
    if (vlanMal) { setError('La VLAN va de 1 a 4094.'); return; }
    setGuardando(true); setError('');
    try {
      await api.post('/conexiones/puertos', {
        switchId: sw.id, numero, connectedAssetId: elegido || null, poe,
        vlan: sinVlan ? null : vlanNum,
      });
      await onGuardado();
    } catch (e) { setError(mensajeDeError(e, 'guardar el puerto')); }
    finally { setGuardando(false); }
  }

  const fila = (c: { id: string; code: string; tipo: string; lugar?: string | null; tren?: string | null }) => (
    <label key={c.id} className={`fila-elegir ${elegido === c.id ? 'sel' : ''}`}>
      <input type="radio" name="eq" checked={elegido === c.id} onChange={() => setElegido(c.id)} />
      <span><strong>{c.code}</strong> — {NOMBRE_DE_TIPO[c.tipo] || c.tipo}{c.lugar ? ` · ${c.lugar}` : ''}</span>
    </label>
  );

  return (
    <Modal
      title={`Puerto ${numero} de ${sw.code}`}
      onClose={onCerrar}
      acciones={
        <>
          <button className="btn-mini" onClick={onCerrar}>Cancelar</button>
          <button className="btn-primary" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar puerto'}</button>
        </>
      }
    >
      {error && <div role="alert" className="aviso-error" style={{ marginBottom: 10 }}>{error}</div>}

      <h4 className="puerto-sec">1 · Qué va enchufado</h4>
      {actual && (
        <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>
          Ahora: <b>{actual.code}</b> ({NOMBRE_DE_TIPO[actual.tipo] || actual.tipo}). Elige otro o deja el puerto libre.
        </p>
      )}
      <label className="campo">
        <span>Buscar el equipo</span>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Código, modelo o sitio" />
      </label>
      <div className="puerto-filtros" role="group" aria-label="Tipo de equipo">
        {FILTROS_TIPO.map((f) => (
          <button key={f.v || 'todos'} type="button" className={filtro === f.v ? 'activo' : ''} aria-pressed={filtro === f.v}
            onClick={() => setFiltro(f.v)}>{f.t}</button>
        ))}
      </div>
      <div className="lista-elegir">
        <label className={`fila-elegir ${elegido === '' ? 'sel' : ''}`}>
          <input type="radio" name="eq" checked={elegido === ''} onChange={() => setElegido('')} />
          <span><em>Dejar el puerto libre</em></span>
        </label>
        {actual && fila({ ...actual })}
        {cargando && <div className="muted" style={{ padding: 8, fontSize: 12 }}>Buscando…</div>}
        {!cargando && mismos.length > 0 && <div className="lista-grupo">Del mismo tren que el switch</div>}
        {mismos.map(fila)}
        {!cargando && otros.length > 0 && mismos.length > 0 && <div className="lista-grupo">Otros sitios</div>}
        {otros.map(fila)}
        {!cargando && lista.length === 0 && (
          <div className="muted" style={{ padding: 8, fontSize: 12 }}>
            Nada que coincida. Sólo salen equipos que no están ya en otro puerto, ni en almacén.
          </div>
        )}
      </div>
      {tipoElegido && ES_RED.includes(tipoElegido) && (
        <div className="nota-info">↔ Es un <b>enlace</b> entre equipos de red (subida o troncal): si cae, cae todo lo que cuelga del otro lado.</div>
      )}

      <h4 className="puerto-sec">2 · Cómo está configurado el puerto</h4>
      <div className="puerto-config">
        <label className="check">
          <input type="checkbox" checked={poe} disabled={!poe && sinPoeLibre} onChange={(e) => setPoe(e.target.checked)} />
          Da corriente (PoE)
        </label>
        {!sinVlan ? (
          <label className="vlan">
            VLAN
            <input type="number" min={1} max={4094} value={vlan} onChange={(e) => setVlan(e.target.value)}
              placeholder="—" aria-invalid={vlanMal} />
          </label>
        ) : (
          <span className="muted" style={{ fontSize: 12 }}>Switch sin VLAN: todo comparte la misma red.</span>
        )}
      </div>
      <small className="muted" style={{ display: 'block', marginTop: 4 }}>
        {sw.poePuertos != null ? `PoE: ${poeOtros + (poe ? 1 : 0)} de ${sw.poePuertos} puertos. ` : ''}
        {!sinVlan ? 'VLAN de 1 a 4094; vacía = la del switch por defecto.' : ''}
      </small>
      {!poe && sinPoeLibre && <div className="nota-aviso">Ya están usados todos los puertos PoE que dice la ficha.</div>}
      {tipoElegido && ['CAMERA', 'WIRELESS'].includes(tipoElegido) && !poe && (
        <div className="nota-aviso">Sin PoE, este equipo necesita inyector o fuente aparte.</div>
      )}
      {vlanMal && <div className="nota-aviso">La VLAN va de 1 a 4094 (802.1Q).</div>}
    </Modal>
  );
}
