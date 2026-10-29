import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import Modal from '../components/Modal';
import BotonConMotivo from '../components/BotonConMotivo';
import SelectorDeModelo from '../components/SelectorDeModelo';
import FichaOpticaForm, { type FichaGuardada, type ModeloDeFicha } from '../components/FichaOpticaForm';
import FichaOpticaDetalle from '../components/FichaOpticaDetalle';
import { EsqueletoTabla } from '../components/Esqueleto';
import { Titular, Cifras, LoQueHayQueHacer, ComoSeCalcula, Detalle, type Accion, type Tono } from '../components/Patron';
import { mensajeDeError, queFalta, vacio } from '../avisos';
import { fecha, paraInput } from '../fechas';
import { plural } from '../formato';
import { NOMBRE_DE_TIPO, TIPOS_ACTIVO } from '../tipos-de-equipo';

/* =============================================================================
   FICHAS TÉCNICAS — bloque 184
   -----------------------------------------------------------------------------
   El catálogo de modelos existía desde el bloque 32 y no había forma de
   llenarlo: Obsolescencia decía «6 modelos sin ficha» y nadie podía hacer
   nada. Aquí se llena, y con él lo que pidió Cristhian para el mapa: que el
   cono de cada cámara diga lo que ve DE VERDAD, con datos del fabricante.

   LA PREGUNTA DE LA PANTALLA: ¿qué cámaras no tienen ficha, y qué ficha falta
   verificar? Eso va arriba; el catálogo entero, debajo.

   QUIÉN PUEDE QUÉ (lo decide también el servidor):
     mirar      asset.read
     cargar     asset.update   — el técnico, con el PDF del fabricante
     verificar  wo.approve     — OTRA persona, con el PDF delante
============================================================================= */

interface Persona { id: string; fullName: string }
interface Modelo extends ModeloDeFicha {
  tipoActivo: string;
  finDeSoporte: string | null; sinRecambio: boolean; reemplazadoPor: string | null; notas: string | null;
  verificadoEn: string | null; verificadoPor: Persona | null; declaradoPor: Persona | null;
  fichasOpticas: FichaGuardada[];
  equipos: number;
}
interface Pendientes {
  modelosSinCatalogo: { tipo: string; marca: string; modelo: string; equipos: number }[];
  camarasSinFicha: { marca: string | null; modelo: string | null; camaras: number }[];
  totalCamarasSinFicha: number;
}
type Alta = { tipoActivo: string; marca: string; modelo: string };

const igual = (a?: string | null, b?: string | null) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

export default function FichasTecnicas() {
  const { can, user } = useAuth();
  const puedeCargar = can('asset.update');
  const puedeVerificar = can('wo.approve');
  const [params] = useSearchParams();

  const [modelos, setModelos] = useState<Modelo[] | null>(null);
  const [pend, setPend] = useState<Pendientes | null>(null);
  const [fallo, setFallo] = useState('');
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState(() => params.get('q') ?? '');
  const [tipo, setTipo] = useState('');

  const [alta, setAlta] = useState<Alta | null>(null);
  const [formFicha, setFormFicha] = useState<{ modelo: ModeloDeFicha; ficha?: FichaGuardada } | null>(null);
  const [verFicha, setVerFicha] = useState<{ modelo: Modelo; ficha: FichaGuardada } | null>(null);
  const [ciclo, setCiclo] = useState<Modelo | null>(null);

  /* Se pide TODO el catálogo (cabe: son modelos, no equipos) y se filtra aquí.
     Así los contadores de arriba son de la planta entera y no cambian al
     buscar: una cifra que se mueve al teclear no se cree (bloque 81). */
  const cargar = useCallback(async () => {
    setFallo('');
    try {
      const [m, p] = await Promise.all([api.get('/modelos'), api.get('/modelos/pendientes')]);
      setModelos(Array.isArray(m.data) ? m.data : []);
      setPend(p.data ?? null);
    } catch (e) {
      setFallo(mensajeDeError(e, 'cargar el catálogo'));
      setModelos((x) => x ?? []);
    }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (modelos ?? []).filter((m) => (!tipo || m.tipoActivo === tipo)
      && (!t || `${m.marca} ${m.modelo}`.toLowerCase().includes(t)));
  }, [modelos, q, tipo]);

  const fichas = (modelos ?? []).flatMap((m) => m.fichasOpticas.map((f) => ({ m, f })));
  const sinVerificar = fichas.filter((x) => !x.f.verificadaEn);
  const sinFicha = pend?.totalCamarasSinFicha ?? 0;
  const tiposEnCatalogo = [...new Set((modelos ?? []).map((m) => m.tipoActivo))];
  const delCatalogo = (marca: string | null, modelo: string | null, tipoActivo = 'CAMERA') =>
    (modelos ?? []).find((m) => m.tipoActivo === tipoActivo && igual(m.marca, marca) && igual(m.modelo, modelo));

  /** Cargar la ficha de un modelo: si aún no está en el catálogo, primero se añade. */
  function fichaPara(marca: string, modelo: string) {
    const m = delCatalogo(marca, modelo);
    if (m) setFormFicha({ modelo: m });
    else setAlta({ tipoActivo: 'CAMERA', marca, modelo });
  }

  /* LO QUE HAY QUE HACER, por lo que duele: primero las cámaras que el mapa
     no sabe dibujar, después lo que espera una segunda mirada, y al final
     los modelos en planta que el catálogo no conoce. */
  const acciones: Accion[] = [
    ...(pend?.camarasSinFicha ?? []).map((c): Accion => ({
      id: `sf-${c.marca}-${c.modelo}`,
      marca: plural(c.camaras, 'cámara'),
      tono: 'atender',
      texto: c.marca ? `Cargar la ficha de ${c.marca} ${c.modelo ?? ''}`.trim() : 'Cámaras sin marca ni modelo en su ficha',
      donde: c.marca ? 'sin ficha técnica: el mapa no sabe hasta dónde ven' : 'Complétalas en Fichas por completar',
      ...(c.marca ? (puedeCargar ? { alPulsar: () => fichaPara(c.marca!, c.modelo ?? '') } : {}) : { a: '/mapeo' }),
    })),
    ...(puedeVerificar ? sinVerificar.filter((x) => x.f.declaradaPor?.id !== user?.id).map(({ m, f }): Accion => ({
      id: `v-${f.id}`, marca: 'verificar', tono: 'atender',
      texto: `${m.marca} ${m.modelo} · ${f.lente}`,
      donde: `la cargó ${f.declaradaPor?.fullName ?? 'alguien'}: compárala con el PDF`,
      alPulsar: () => setVerFicha({ modelo: m, ficha: f }),
    })) : []),
    /* Los modelos que el catálogo no conoce. Una cámara sin ficha ya sale
       arriba (cargar su ficha la añade al catálogo); aquí sólo lo que queda. */
    ...(pend?.modelosSinCatalogo ?? []).filter((x) => x.tipo !== 'CAMERA'
      || !(pend?.camarasSinFicha ?? []).some((c) => igual(c.marca, x.marca) && igual(c.modelo, x.modelo)))
      .map((x): Accion => ({
      id: `sc-${x.tipo}-${x.marca}-${x.modelo}`,
      marca: plural(x.equipos, 'equipo'), tono: 'sindatos',
      texto: `${x.marca} ${x.modelo}`.trim(),
      donde: `${NOMBRE_DE_TIPO[x.tipo] ?? x.tipo} · sin datos de soporte`,
      ...(puedeCargar ? { alPulsar: () => setAlta({ tipoActivo: x.tipo, marca: x.marca, modelo: x.modelo }) } : {}),
    })),
  ];

  const titular: { tono: Tono; texto: string; apoyo: string } = sinFicha > 0
    ? { tono: 'atender', texto: `${plural(sinFicha, 'cámara')} sin ficha técnica`, apoyo: 'Sin ficha, su cono en el mapa es un dibujo a mano.' }
    : sinVerificar.length > 0
      ? { tono: 'atender', texto: `${plural(sinVerificar.length, 'ficha')} sin verificar`, apoyo: 'Otra persona tiene que compararlas con el PDF del fabricante.' }
      : fichas.length > 0
        ? { tono: 'bien', texto: 'Todas las cámaras tienen su ficha verificada', apoyo: 'El mapa dibuja lo que ve cada una según su fabricante.' }
        : { tono: 'sindatos', texto: 'Todavía no hay fichas técnicas', apoyo: 'Empieza por el modelo de cámara que más se repite en planta.' };

  function hecho(texto: string) {
    setMsg(texto);
    setFormFicha(null); setVerFicha(null); setCiclo(null);
    cargar();
  }

  if (modelos === null) return <div className="page"><EsqueletoTabla filas={6} /></div>;

  return (
    <div className="page">
      <Titular tono={titular.tono} texto={titular.texto} apoyo={titular.apoyo} />
      <Cifras datos={[
        { n: modelos.length, et: 'modelos en el catálogo' },
        { n: fichas.length - sinVerificar.length, de: fichas.length, et: 'fichas verificadas' },
        { n: pend ? sinFicha : null, et: 'cámaras sin ficha' },
      ]} />
      <LoQueHayQueHacer acciones={acciones} />

      {msg && <div role="status" className="aviso-ok aviso-cerrable" onClick={() => setMsg('')} title="Toca para cerrar este aviso">{msg}</div>}
      {fallo && <div role="alert" className="aviso-error">{fallo}</div>}

      <div className="filters">
        <input aria-label="Buscar modelo" placeholder="Buscar marca o modelo…" value={q}
          onChange={(e) => setQ(e.target.value)} style={{ flex: '1 1 240px', minWidth: 0 }} />
        <select aria-label="Tipo de equipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          {tiposEnCatalogo.map((t) => <option key={t} value={t}>{NOMBRE_DE_TIPO[t] ?? t}</option>)}
        </select>
        {puedeCargar && (
          <button className="btn-primary" onClick={() => setAlta({ tipoActivo: 'CAMERA', marca: '', modelo: '' })}>+ Añadir modelo</button>
        )}
      </div>

      {lista.length === 0 ? (
        <div className="card vacio">
          <h3>{modelos.length ? 'Ningún modelo con ese filtro' : 'El catálogo está vacío'}</h3>
          <p>{modelos.length ? 'Quita el filtro para ver el resto.' : 'Arriba salen los modelos que hay en planta: empieza por ellos.'}</p>
        </div>
      ) : (
        <div className="desliza">
          <table>
            <thead>
              <tr><th>Modelo</th><th className="num">En planta</th><th>Lo que ve</th><th>Soporte del fabricante</th><th></th></tr>
            </thead>
            <tbody>
              {lista.map((m) => (
                <tr key={m.id}>
                  <td>
                    <strong>{`${m.marca} ${m.modelo}`}</strong>
                    <div className="muted" style={{ fontSize: 11.5 }}>{NOMBRE_DE_TIPO[m.tipoActivo] ?? m.tipoActivo}</div>
                  </td>
                  <td className="num">{m.equipos}</td>
                  <td>
                    {m.tipoActivo !== 'CAMERA' ? <span className="muted">—</span> : m.fichasOpticas.length === 0 ? (
                      <span className="muted">{'Sin ficha'}</span>
                    ) : (
                      <div className="lentes">
                        {m.fichasOpticas.map((f) => (
                          <button key={f.id} type="button" className={'lente' + (f.verificadaEn ? ' verificada' : '')}
                            title={f.verificadaEn ? `Verificada por ${f.verificadaPor?.fullName ?? '—'}` : 'Sin verificar'}
                            onClick={() => setVerFicha({ modelo: m, ficha: f })}>
                            {`${f.verificadaEn ? '✓' : '•'} ${f.lente} · ${f.detectarM} m`}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    <div>{soporte(m)}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>
                      {m.verificadoEn ? `✓ verificado por ${m.verificadoPor?.fullName ?? '—'}` : 'sin verificar'}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {puedeCargar && m.tipoActivo === 'CAMERA' && (
                      <button className="btn-mini" onClick={() => setFormFicha({ modelo: m })}>+ Ficha</button>
                    )}
                    {(puedeCargar || puedeVerificar) && (
                      <button className="btn-mini" style={{ marginLeft: 4 }} onClick={() => setCiclo(m)}>Soporte</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(pend?.camarasSinFicha.length ?? 0) + (pend?.modelosSinCatalogo.length ?? 0) > 0 && (
        <Detalle titulo={`Todo lo pendiente (${(pend?.camarasSinFicha.length ?? 0) + (pend?.modelosSinCatalogo.length ?? 0)})`}>
          <ul className="lista-pendientes">
            {pend!.camarasSinFicha.map((c) => (
              <li key={`c-${c.marca}-${c.modelo}`}>
                <span>{`${c.marca ? `${c.marca} ${c.modelo ?? ''}` : 'Sin marca ni modelo'} · ${plural(c.camaras, 'cámara')} sin ficha`}</span>
              </li>
            ))}
            {pend!.modelosSinCatalogo.map((x) => (
              <li key={`m-${x.tipo}-${x.marca}-${x.modelo}`}>
                <span>{`${x.marca} ${x.modelo} · ${NOMBRE_DE_TIPO[x.tipo] ?? x.tipo} · ${plural(x.equipos, 'equipo')} fuera del catálogo`}</span>
              </li>
            ))}
          </ul>
        </Detalle>
      )}

      <ComoSeCalcula>
        <p>
          <b>Lo que ve una cámara</b> se mide como dice la norma IEC 62676-4 (DORI): cuántos píxeles caen
          en un metro de escena. Con 250 se le ve la cara a alguien (identificar), con 125 se reconoce a
          un conocido, con 62 se ve qué hace y con 25 sólo se nota que hay alguien. Más lejos, borroso.
        </p>
        <p>
          <b>Las distancias se copian de la ficha del fabricante, no se calculan.</b> La fórmula se desvía
          un 20-40 % de lo que publica el fabricante; aquí sólo sirve para cazar un error de dedo.
        </p>
        <p>
          <b>Para que sea un dato fehaciente:</b> el PDF del fabricante es obligatorio y se guarda como
          prueba; los números los carga una persona y los verifica OTRA, con el PDF delante. Corregir un
          número quita la verificación. En el mapa, una ficha sin verificar se dibuja con el borde punteado.
        </p>
        <p>
          <b>Con zoom</b> (PTZ o varifocal), el ángulo y las distancias se ajustan al zoom en que queda la
          cámara en el plano. <b>De noche</b> sólo cuenta su infrarrojo, sin la luz de la planta.
        </p>
      </ComoSeCalcula>

      {alta && (
        <AltaDeModelo valor={alta} onCerrar={() => setAlta(null)}
          onCreado={(m) => {
            setAlta(null);
            setMsg(`${m.marca} ${m.modelo} añadido al catálogo.`);
            cargar();
            if (m.tipoActivo === 'CAMERA') setFormFicha({ modelo: m });
          }} />
      )}
      {formFicha && (
        <FichaOpticaForm modelo={formFicha.modelo} ficha={formFicha.ficha}
          onCerrar={() => setFormFicha(null)} onGuardada={hecho} />
      )}
      {verFicha && (
        <FichaOpticaDetalle modelo={verFicha.modelo} ficha={verFicha.ficha} yo={user?.id}
          puedeVerificar={puedeVerificar} puedeCorregir={puedeCargar}
          onCorregir={() => { setFormFicha({ modelo: verFicha.modelo, ficha: verFicha.ficha }); setVerFicha(null); }}
          onCambio={hecho} onCerrar={() => setVerFicha(null)} />
      )}
      {ciclo && (
        <CicloDeVida modelo={ciclo} yo={user?.id} puedeCargar={puedeCargar} puedeVerificar={puedeVerificar}
          onCerrar={() => setCiclo(null)} onCambio={hecho} />
      )}
    </div>
  );
}

/** «Soporte hasta 31/12/2027 · sin recambio · lo reemplaza X», o que no se sabe. */
function soporte(m: Modelo): string {
  const partes = [
    m.finDeSoporte ? `Hasta ${fecha(m.finDeSoporte)}` : '',
    m.sinRecambio ? 'sin recambio' : '',
    m.reemplazadoPor ? `lo reemplaza ${m.reemplazadoPor}` : '',
  ].filter(Boolean);
  return partes.length ? partes.join(' · ') : 'Sin datos';
}

/* -----------------------------------------------------------------------------
   AÑADIR UN MODELO AL CATÁLOGO — marca y modelo se ELIGEN de lo que hay en
   planta (bloque 169): «Hikvision», «hikvision» y «HIK» eran tres marcas.
----------------------------------------------------------------------------- */
function AltaDeModelo({ valor, onCerrar, onCreado }: {
  valor: Alta;
  onCerrar: () => void;
  onCreado: (m: Modelo) => void;
}) {
  const [f, setF] = useState<Alta>(valor);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  async function crear() {
    setGuardando(true); setError('');
    try {
      const r = await api.post('/modelos', { tipoActivo: f.tipoActivo, marca: f.marca.trim(), modelo: f.modelo.trim() });
      if (!r.data?.id) { setError('El servidor respondió pero no confirmó el alta. Recarga antes de repetir.'); return; }
      onCreado({ ...r.data, fichasOpticas: [], equipos: 0 } as Modelo);
    } catch (e) {
      setError(mensajeDeError(e, 'añadir el modelo'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal title="Añadir modelo al catálogo" onClose={onCerrar}
      acciones={
        <>
          <button className="btn-mini" onClick={onCerrar}>Cancelar</button>
          <BotonConMotivo onClick={crear} ocupado={guardando}
            falta={queFalta([vacio(f.marca), 'Falta la marca.'], [vacio(f.modelo), 'Falta el modelo, tal como sale en su etiqueta.'])}>
            {guardando ? 'Añadiendo…' : 'Añadir'}
          </BotonConMotivo>
        </>
      }
    >
      {error && <div role="alert" className="aviso-error">{error}</div>}
      <label>Tipo de equipo
        <select value={f.tipoActivo} onChange={(e) => setF({ tipoActivo: e.target.value, marca: '', modelo: '' })}>
          {TIPOS_ACTIVO.map((t) => <option key={t.valor} value={t.valor}>{t.nombre}</option>)}
        </select>
      </label>
      <SelectorDeModelo tipo={f.tipoActivo} marca={f.marca} modelo={f.modelo}
        onChange={(marca, modelo) => setF({ ...f, marca, modelo })} />
      <p className="muted" style={{ fontSize: 12 }}>Tal como lo escribe el fabricante en la etiqueta.</p>
    </Modal>
  );
}

/* -----------------------------------------------------------------------------
   EL SOPORTE DEL FABRICANTE (bloque 32): hasta cuándo hay soporte, si queda
   recambio y qué lo reemplaza. De aquí sale Obsolescencia. Cambiarlo quita la
   verificación; verificarlo lo hace otra persona.
----------------------------------------------------------------------------- */
function CicloDeVida({ modelo, yo, puedeCargar, puedeVerificar, onCerrar, onCambio }: {
  modelo: Modelo;
  yo: string | undefined;
  puedeCargar: boolean;
  puedeVerificar: boolean;
  onCerrar: () => void;
  onCambio: (mensaje: string) => void;
}) {
  const inicial = {
    finDeSoporte: paraInput(modelo.finDeSoporte), sinRecambio: modelo.sinRecambio,
    reemplazadoPor: modelo.reemplazadoPor ?? '', notas: modelo.notas ?? '',
  };
  const [f, setF] = useState(inicial);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const cambiado = JSON.stringify(f) !== JSON.stringify(inicial);
  const suyo = !!yo && modelo.declaradoPor?.id === yo;

  async function guardar() {
    setOcupado(true); setError('');
    /* Sólo lo que cambió: guardar lo mismo no le quita la verificación a nadie. */
    const cuerpo: Record<string, unknown> = {};
    if (f.finDeSoporte !== inicial.finDeSoporte) cuerpo.finDeSoporte = f.finDeSoporte || null;
    if (f.sinRecambio !== inicial.sinRecambio) cuerpo.sinRecambio = f.sinRecambio;
    if (f.reemplazadoPor !== inicial.reemplazadoPor) cuerpo.reemplazadoPor = f.reemplazadoPor.trim() || null;
    if (f.notas !== inicial.notas) cuerpo.notas = f.notas.trim() || null;
    try {
      await api.patch(`/modelos/${modelo.id}`, cuerpo);
      onCambio(`Soporte de ${modelo.marca} ${modelo.modelo} guardado. Falta que otra persona lo verifique.`);
    } catch (e) { setError(mensajeDeError(e, 'guardar el soporte')); }
    finally { setOcupado(false); }
  }

  async function verificar() {
    setOcupado(true); setError('');
    try {
      await api.post(`/modelos/${modelo.id}/verificar`);
      onCambio(`Soporte de ${modelo.marca} ${modelo.modelo} verificado.`);
    } catch (e) { setError(mensajeDeError(e, 'verificar')); }
    finally { setOcupado(false); }
  }

  return (
    <Modal title={`Soporte · ${modelo.marca} ${modelo.modelo}`} onClose={onCerrar}
      acciones={
        <>
          <button className="btn-mini" onClick={onCerrar}>Cerrar</button>
          {puedeVerificar && !modelo.verificadoEn && !cambiado && (
            <BotonConMotivo className="btn-mini" onClick={verificar} ocupado={ocupado}
              falta={queFalta([suyo, 'Lo declaraste tú: lo verifica otra persona.'])}>
              Verificar
            </BotonConMotivo>
          )}
          {puedeCargar && (
            <BotonConMotivo onClick={guardar} ocupado={ocupado} falta={queFalta([!cambiado, 'No has cambiado nada.'])}>
              {ocupado ? 'Guardando…' : 'Guardar'}
            </BotonConMotivo>
          )}
        </>
      }
    >
      {error && <div role="alert" className="aviso-error">{error}</div>}
      <div role="status" className={modelo.verificadoEn ? 'aviso-ok' : 'aviso-pendiente'}>
        {modelo.verificadoEn
          ? `Verificado por ${modelo.verificadoPor?.fullName ?? '—'} el ${fecha(modelo.verificadoEn)}.`
          : `Sin verificar${modelo.declaradoPor ? ` · lo declaró ${modelo.declaradoPor.fullName}` : ''}.`}
      </div>
      <fieldset disabled={!puedeCargar} style={{ border: 0, padding: 0, margin: 0 }}>
        <label>Fin de soporte del fabricante
          <input type="date" value={f.finDeSoporte} onChange={(e) => setF({ ...f, finDeSoporte: e.target.value })} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={f.sinRecambio} style={{ width: 18, height: 18, minHeight: 18 }}
            onChange={(e) => setF({ ...f, sinRecambio: e.target.checked })} />
          Ya no se consigue de recambio
        </label>
        <label>Lo reemplaza (modelo nuevo)
          <input value={f.reemplazadoPor} maxLength={120} onChange={(e) => setF({ ...f, reemplazadoPor: e.target.value })} />
        </label>
        <label>Notas
          <textarea value={f.notas} maxLength={500} onChange={(e) => setF({ ...f, notas: e.target.value })} />
        </label>
      </fieldset>
    </Modal>
  );
}
