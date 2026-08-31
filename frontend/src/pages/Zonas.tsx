import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import Campo, { Seccion } from '../components/Campo';
import Icono from '../components/Iconos';
import { EsqueletoTabla } from '../components/Esqueleto';
import { useAuth } from '../auth/AuthContext';
import { enviarConRespaldo } from '../envio-seguro';
import { fecha } from '../formato';
import BotonConMotivo from '../components/BotonConMotivo';
import { mensajeDeError, queFalta } from '../avisos';

/**
 * ZONAS VITALES PARA LA PRODUCCIÓN — bloque 26.
 *
 * ===========================================================================
 *  ES LA PANTALLA DONDE ENTRA PRODUCCIÓN
 * ===========================================================================
 *  Hasta aquí el sistema lo usaban dos áreas: Mantenimiento, que arregla, y
 *  TI, que sostiene la red. Las dos saben cosas del EQUIPO. Ninguna sabe la
 *  que de verdad ordena el trabajo:
 *
 *      «Si perdemos la vista AQUÍ, ¿qué le pasa a la producción?»
 *
 *  Esa la sabe el jefe de línea. Y hasta ahora no tenía dónde decirla, así
 *  que no se decía, y cada área priorizaba por su cuenta.
 *
 *  Aquí lo dice UNA VEZ por zona. La prioridad de todas las cámaras de esa
 *  zona sube sola: nadie tiene que ir cámara por cámara, y nadie se puede
 *  olvidar.
 *
 *  Las tres áreas ven esta pantalla. Sólo Producción puede escribirla.
 */

const NIVELES = [
  { v: '', et: 'Sin declarar', ayuda: 'Todavía no se ha valorado.' },
  { v: 'BAJA', et: 'Baja', ayuda: 'Se puede quedar sin vista un tiempo sin consecuencias.' },
  { v: 'MEDIA', et: 'Media', ayuda: 'Molesta, pero la línea sigue.' },
  { v: 'ALTA', et: 'Alta', ayuda: 'Se pierde control del proceso. Hay que atenderla el mismo día.' },
  { v: 'CRITICA', et: 'Crítica', ayuda: 'Sin vista aquí se para o se arriesga la producción.' },
];

const COLOR: Record<string, string> = {
  CRITICA: 'crit', ALTA: 'warn', MEDIA: '', BAJA: '',
};

/* Cómo se interviene la zona (bloque 28). El texto largo importa: es lo que
   lee el técnico antes de acercarse a la línea. */
const INTERVENCION: Record<string, { et: string; clase: string; ayuda: string }> = {
  EN_MARCHA: { et: 'En marcha', clase: 'ok',
    ayuda: 'Cabina o púlpito: se trabaja con el tren produciendo.' },
  CON_PERMISO_ELECTRICO: { et: 'Con permiso eléctrico', clase: 'warn',
    ayuda: 'Sala eléctrica o MCC: hace falta bloqueo eléctrico.' },
  CON_PERMISO_ALTURA: { et: 'Con permiso de altura', clase: 'warn',
    ayuda: 'Hay que subir: PETAR y personal acreditado.' },
  EXIGE_PARADA: { et: 'Exige parada', clase: 'crit',
    ayuda: 'Barra caliente, vapor o rodillos: el tren tiene que estar detenido.' },
  SIN_CLASIFICAR: { et: 'Sin clasificar', clase: '',
    ayuda: 'Sin ambiente declarado. Se trata como parada hasta que lo haya.' },
};

export default function Zonas() {
  const { can } = useAuth();
  const puedeDeclarar = can('zona.criticidad');
  const puedeFirmar = can('zona.intervencion');

  const [zonas, setZonas] = useState<any[]>([]);
  const [resumen, setResumen] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [filtro, setFiltro] = useState('');
  const [soloConEquipos, setSoloConEquipos] = useState(true);
  const [editando, setEditando] = useState<any>(null);
  const [firmando, setFirmando] = useState<any>(null);

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const [a, b] = await Promise.all([
        api.get('/zonas'),
        api.get('/zonas/pendientes'),
      ]);
      setZonas(a.data); setResumen(b.data);
    } catch (e: any) {
      setError(mensajeDeError(e, 'cargar el árbol de zonas'));
    } finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return zonas.filter((z) => {
      if (soloConEquipos && !z.activosEnLaRama) return false;
      if (!q) return true;
      return [z.nombre, z.code, z.queSeVigila, z.porQueEsVital]
        .filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [zonas, filtro, soloConEquipos]);

  return (
    <div className="page">
      <h1 className="page-title">Zonas vitales para la producción</h1>

      <div className="card explica">
        <b>Esta pantalla la llena Producción, y la leen las tres áreas.</b> La
        pregunta no es qué cámara es cara: es <b>qué se pierde si esa zona se
        queda a ciegas</b>. Eso sólo lo sabe quien conoce el proceso.
        <div style={{ marginTop: 8 }}>
          Lo que se declara aquí <b>sube sola la prioridad</b> de todas las
          cámaras de la zona y de las que cuelgan por debajo.
        </div>
        <div style={{ marginTop: 8 }}>
          {/* Recortado en el bloque 77 para hacer sitio a la declaración de
              seguridad, que es más importante que esta explicación: la regla
              se aplica igual aunque no se lea aquí — el formulario no deja
              guardar sin el motivo y lo dice al pulsar. */}
          <b>Alta</b> y <b>Crítica</b> obligan a escribir el porqué.
        </div>
      </div>

      {resumen && (
        <div className="kpi-grid">
          <div className="kpi">
            <div className="label">Zonas declaradas</div>
            <div className="value">{resumen.declaradas}</div>
            <div className="hint">de {resumen.total} ubicaciones del árbol</div>
          </div>
          <div className={'kpi' + (resumen.vencidas.length ? ' warn' : '')}>
            <div className="label">Declaraciones vencidas</div>
            <div className="value">{resumen.vencidas.length}</div>
            <div className="hint">
              {resumen.vencidas.length
                ? 'Pasó su fecha de revisión. Se siguen aplicando, pero hay que confirmarlas.'
                : 'Ninguna caducada.'}
            </div>
          </div>
          <div className={'kpi' + (resumen.sinDeclarar.length ? ' warn' : '')}>
            <div className="label">Con equipos y sin valorar</div>
            <div className="value">{resumen.sinDeclarar.length}</div>
            <div className="hint">Zonas que tienen cámaras y nadie ha dicho cuánto importan</div>
          </div>
        </div>
      )}

      {error && <div className="card peligro">{error}</div>}
      {msg && <div className="card explica">{msg}</div>}

      <div className="filters">
        <div>
          <label>Buscar zona
            <input value={filtro} onChange={(e) => setFiltro(e.target.value)}
                 placeholder="Nombre, código o qué se vigila" />
          </label>
        </div>
        <div>
          <label>&nbsp;</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
            <input type="checkbox" checked={soloConEquipos}
                   onChange={(e) => setSoloConEquipos(e.target.checked)}
                   style={{ width: 18, height: 18, minHeight: 18 }} />
            <span style={{ fontSize: 13 }}>Sólo zonas con equipos</span>
          </label>
        </div>
      </div>

      {cargando ? <EsqueletoTabla /> : (
        <div className="card">
          <table className="tabla">
            <thead>
              <tr>
                <th>Zona</th>
                <th>Qué se ve desde aquí</th>
                <th>Importancia</th>
                <th>Por qué</th>
                <th>Equipos</th>
                <th>Intervención</th>
                <th>Firmada</th>
                {(puedeDeclarar || puedeFirmar) && <th />}
              </tr>
            </thead>
            <tbody>
              {visibles.map((z) => (
                <tr key={z.id}>
                  <td>
                    <strong>{z.nombre}</strong>
                    <div className="muted" style={{ fontSize: 11 }}>{z.code} · {z.tipo}</div>
                  </td>
                  <td>{z.queSeVigila || <span className="muted">—</span>}</td>
                  <td>
                    {z.criticidadProduccion
                      ? <span className={'badge ' + (COLOR[z.criticidadProduccion] || '')}>
                          {NIVELES.find((n) => n.v === z.criticidadProduccion)?.et}
                        </span>
                      : <span className="muted">Sin declarar</span>}
                    {z.vencida && (
                      <div style={{ fontSize: 11, color: 'var(--warn, #b45309)', marginTop: 3 }}>
                        <Icono n="alerta" size={12} /> Caducada — confirmar
                      </div>
                    )}
                  </td>
                  <td style={{ maxWidth: 320 }}>
                    {z.porQueEsVital || <span className="muted">—</span>}
                    {z.impactoSiSeCae && (
                      <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                        Si se cae: {z.impactoSiSeCae}
                      </div>
                    )}
                  </td>
                  <td>
                    {z.activosEnLaRama || 0}
                    {z.activosPropios !== z.activosEnLaRama && (
                      <div className="muted" style={{ fontSize: 11 }}>
                        {z.activosPropios} propios
                      </div>
                    )}
                  </td>
                  {/* CÓMO SE INTERVIENE. Se enseña lo que APLICA, no la
                      propuesta: la propuesta no autoriza a nadie. */}
                  <td style={{ maxWidth: 220 }}>
                    <span className={'badge ' + (INTERVENCION[z.intervencionAplica]?.clase || '')}>
                      {INTERVENCION[z.intervencionAplica]?.et || z.intervencionAplica}
                    </span>
                    {!z.estaFirmada && z.intervencionPropuesta !== 'SIN_CLASIFICAR' && (
                      <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                        Sin firmar. El sistema propondría «{INTERVENCION[z.intervencionPropuesta]?.et}».
                      </div>
                    )}
                    {z.firmaDesactualizada && (
                      <div style={{ fontSize: 11, color: 'var(--crit,#dc2626)', marginTop: 3 }}>
                        <Icono n="alerta" size={12} /> La planta cambió desde que se firmó.
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {z.declaradoPor || <span className="muted">—</span>}
                    {z.declaradoEn && (
                      <div className="muted" style={{ fontSize: 11 }}>
                        {fecha(z.declaradoEn)}
                      </div>
                    )}
                  </td>
                  {(puedeDeclarar || puedeFirmar) && (
                    <td>
                      <div className="card-acciones">
                        {puedeDeclarar && (
                          <button className="btn-mini" onClick={() => setEditando({ ...z })}>
                            <Icono n="editar" size={14} /> Declarar
                          </button>
                        )}
                        {puedeFirmar && (
                          <button className="btn-mini" onClick={() => setFirmando({ ...z })}>
                            <Icono n="firma" size={14} /> Intervención
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {!visibles.length && (
                <tr><td colSpan={7} className="muted" style={{ padding: 22, textAlign: 'center' }}>
                  No hay zonas que coincidan.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {firmando && (
        <FirmaIntervencion
          zona={firmando}
          onCerrar={() => setFirmando(null)}
          onGuardado={(t) => { setFirmando(null); setMsg(t); cargar(); }}
        />
      )}

      {editando && (
        <EditorZona
          zona={editando}
          onCerrar={() => setEditando(null)}
          onGuardado={(t) => { setEditando(null); setMsg(t); cargar(); }}
        />
      )}
    </div>
  );
}

/** El formulario. Separado porque tiene su propia validación y su propio estado. */
function EditorZona({ zona, onCerrar, onGuardado }: {
  zona: any; onCerrar: () => void; onGuardado: (msg: string) => void;
}) {
  const [nivel, setNivel] = useState(zona.criticidadProduccion || '');
  const [porQue, setPorQue] = useState(zona.porQueEsVital || '');
  const [impacto, setImpacto] = useState(zona.impactoSiSeCae || '');
  const [vigila, setVigila] = useState(zona.queSeVigila || '');
  const [revisar, setRevisar] = useState(
    zona.revisarAntesDe ? String(zona.revisarAntesDe).slice(0, 10) : '',
  );
  /* RIESGO PARA PERSONAS (bloque 77). Se guarda como texto —'', 'true', 'false'—
     y no como booleano porque son TRES estados, no dos: sí, no, y «nadie lo ha
     dicho todavía». Con un booleano, «sin declarar» y «no» serían el mismo
     valor y un sitio peligroso sin revisar parecería seguro. */
  const [riesgo, setRiesgo] = useState<string>(
    zona.riesgoPersonas === true ? 'true' : zona.riesgoPersonas === false ? 'false' : '',
  );
  const [riesgoMotivo, setRiesgoMotivo] = useState(zona.riesgoPersonasMotivo || '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const exigeMotivo = nivel === 'ALTA' || nivel === 'CRITICA';
  const faltaMotivo = exigeMotivo && !porQue.trim();
  // Igual que arriba: «aquí puede resultar herida una persona» sin decir qué
  // es lo que puede herirla no se puede auditar ni discutir.
  const faltaRiesgoMotivo = riesgo === 'true' && !riesgoMotivo.trim();

  async function guardar() {
    setGuardando(true); setError('');
    try {
      await enviarConRespaldo('patch', `/zonas/${zona.id}`, {
        criticidadProduccion: nivel || null,
        porQueEsVital: porQue,
        impactoSiSeCae: impacto,
        queSeVigila: vigila,
        revisarAntesDe: revisar || null,
      }, `Zona ${zona.nombre}`);
      /* El riesgo para personas va por su propio endpoint porque pertenece a
         la criticidad A/B/C de mantenimiento, no a la declaración de
         Producción del bloque 26. Son dos afirmaciones de dos áreas distintas
         y cada una tiene su permiso.

         Este endpoint EXISTÍA desde el bloque 76 y no había pantalla que lo
         llamara — y la pantalla de Criticidad prometía en su cabecera «se
         declara la zona una vez y se clasifican todas sus cámaras de golpe»,
         una función que no se podía hacer. Prometer en pantalla algo que no
         existe es peor que no tenerlo. */
      await api.put(`/criticidad/zona/${zona.id}`, {
        riesgoPersonas: riesgo === '' ? null : riesgo === 'true',
        riesgoPersonasMotivo: riesgoMotivo,
      });
      onGuardado(`Zona «${zona.nombre}» actualizada. La prioridad de sus ${zona.activosEnLaRama || 0} equipos se recalcula sola.`);
    } catch (e: any) {
      setError(mensajeDeError(e, 'guardar'));
    } finally { setGuardando(false); }
  }

  return (
    <Modal
      title={`Importancia de «${zona.nombre}»`}
      ancho
      onClose={onCerrar}
      acciones={
        <>
          <button className="btn-mini" onClick={onCerrar}>Cancelar</button>
          <BotonConMotivo onClick={guardar} ocupado={guardando}
            falta={queFalta(
              [faltaMotivo, 'Explica por qué esta zona es vital: es obligatorio en ALTA y CRÍTICA.'],
              [faltaRiesgoMotivo, 'Di qué es lo que puede herir a una persona en esta zona.'],
            )}>
            {guardando ? 'Guardando…' : 'Guardar declaración'}
          </BotonConMotivo>
        </>
      }
    >
      {error && <div className="card peligro" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="card explica" style={{ marginBottom: 14 }}>
        Esta zona tiene <b>{zona.activosEnLaRama || 0} equipos</b> colgando
        (contando los de las zonas de debajo). Lo que declares aquí les cambia
        la prioridad a todos.
      </div>

      <Seccion titulo="Lo que ve Producción">
        <Campo
          etiqueta="Qué se ve desde aquí"
          ayuda="No el nombre de la zona: a qué da visión. «Salida del horno y entrada al desbaste»."
          ancho
        >
          <input value={vigila} onChange={(e) => setVigila(e.target.value)}
                 placeholder="Salida del horno y entrada al desbaste" />
        </Campo>

        <Campo
          etiqueta="Importancia para la producción"
          ayuda={NIVELES.find((n) => n.v === nivel)?.ayuda}
          obligatorio={false}
        >
          <select value={nivel} onChange={(e) => setNivel(e.target.value)}>
            {NIVELES.map((n) => <option key={n.v} value={n.v}>{n.et}</option>)}
          </select>
        </Campo>

        <Campo
          etiqueta="Revisar antes de"
          ayuda="La planta cambia. Una criticidad de hoy aplicada dentro de tres años sin que nadie la mire es una mentira con fecha."
        >
          <input type="date" value={revisar} onChange={(e) => setRevisar(e.target.value)} />
        </Campo>

        <Campo
          etiqueta="Por qué es importante"
          obligatorio={exigeMotivo}
          error={faltaMotivo ? 'Alta y Crítica exigen escribir el motivo.' : undefined}
          ayuda="Una frase. Es lo que leerá el técnico de madrugada."
          ancho
        >
          <textarea value={porQue} onChange={(e) => setPorQue(e.target.value)}
                    placeholder="Es el único punto desde el que se ve el colado; sin esa cámara no hay forma de saber si la barra salió bien." />
        </Campo>

        <Campo
          etiqueta="Qué pasa si se cae"
          ayuda="El efecto concreto: se para la línea, se pierde la trazabilidad."
          ancho
        >
          <textarea value={impacto} onChange={(e) => setImpacto(e.target.value)}
                    placeholder="Se detiene el tren hasta restablecer la vista." />
        </Campo>
      </Seccion>

      {/* RIESGO PARA PERSONAS (bloque 77).
          Va en SU PROPIA sección y no mezclado con lo de Producción porque son
          dos afirmaciones de dos áreas: Producción dice cuánto importa VER
          aquí; esto dice si aquí se puede HACER DAÑO a alguien. Y la segunda
          manda sobre la primera: una zona sin importancia productiva con paso
          de grúa es A igual. */}
      <Seccion titulo="Seguridad de las personas">
        <Campo
          etiqueta="¿Puede herirse alguien aquí?"
          ayuda="Barra caliente, grúa, foso. Si sí, sus cámaras son A."
          ancho
        >
          {/* Son TRES estados, no dos. Con un booleano, «sin declarar» y «no»
              serían el mismo valor y un sitio peligroso sin revisar parecería
              seguro — que es justo al revés de como falla este proyecto. */}
          <select value={riesgo} onChange={(e) => setRiesgo(e.target.value)}>
            <option value="">— sin declarar —</option>
            <option value="true">Sí</option>
            <option value="false">No</option>
          </select>
        </Campo>

        {riesgo === 'true' && (
          <Campo etiqueta="¿Qué la puede herir?" obligatorio ancho>
            <textarea
              value={riesgoMotivo}
              onChange={(e) => setRiesgoMotivo(e.target.value)}
              rows={2}
              placeholder="Pasa la barra caliente a 3 m."
            />
          </Campo>
        )}
      </Seccion>
    </Modal>
  );
}

/**
 * FIRMAR CÓMO SE INTERVIENE LA ZONA.
 *
 * ===========================================================================
 *  ESTE FORMULARIO AUTORIZA A UNA PERSONA A ACERCARSE A LA LÍNEA
 * ===========================================================================
 *  No es un campo más. Por eso la pantalla no se parece a los demás
 *  formularios: enseña primero lo que el sistema PROPONE y por qué, y sólo
 *  después deja firmar. Firmar a ciegas «en marcha» sobre una zona de barra
 *  caliente es el error que esto tiene que hacer difícil.
 *
 *  Lo firman el Supervisor Operativo de Tercería y el Jefe de Mantenimiento.
 *  Nadie más tiene el permiso.
 */
function FirmaIntervencion({ zona, onCerrar, onGuardado }: {
  zona: any; onCerrar: () => void; onGuardado: (msg: string) => void;
}) {
  const [nivel, setNivel] = useState(zona.intervencionFirmada || '');
  const [motivo, setMotivo] = useState(zona.intervencionMotivo || '');
  const [altura, setAltura] = useState(!!zona.requiereAltura);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const PERMISIVOS = ['EN_MARCHA', 'CON_PERMISO_ELECTRICO', 'CON_PERMISO_ALTURA'];
  const exigeMotivo = PERMISIVOS.includes(nivel);
  const faltaMotivo = exigeMotivo && !motivo.trim();

  async function guardar() {
    setGuardando(true); setError('');
    try {
      await enviarConRespaldo('patch', `/zonas/${zona.id}/intervencion`, {
        intervencionFirmada: nivel || null,
        intervencionMotivo: motivo,
        requiereAltura: altura,
      }, `Intervención de ${zona.nombre}`);
      onGuardado(`Firmado cómo se interviene «${zona.nombre}».`);
    } catch (e: any) {
      setError(mensajeDeError(e, 'firmar'));
    } finally { setGuardando(false); }
  }

  return (
    <Modal
      title={`¿Cómo se interviene «${zona.nombre}»?`}
      ancho
      onClose={onCerrar}
      acciones={
        <>
          <button className="btn-mini" onClick={onCerrar}>Cancelar</button>
          <BotonConMotivo onClick={guardar} ocupado={guardando}
            falta={queFalta([faltaMotivo, 'Escribe por qué se puede intervenir así. Queda firmado con tu nombre.'])}>
            {guardando ? 'Firmando…' : 'Firmar'}
          </BotonConMotivo>
        </>
      }
    >
      {error && <div className="card peligro" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="card peligro" style={{ marginBottom: 14 }}>
        <b>Esto autoriza a trabajar con el tren produciendo.</b> Queda con tu
        nombre y la fecha en la auditoría. Sin firma, el sistema pide parada.
      </div>

      {/* LO QUE PROPONE EL SISTEMA, y de dónde sale. */}
      <div className="card explica" style={{ marginBottom: 14 }}>
        <b>El sistema propone: {zona.intervencionPropuestaTexto}</b>
        <div style={{ marginTop: 4, fontSize: 12.5 }}>
          Sale del ambiente de la zona ({zona.ambiente || 'sin declarar'})
          {zona.requiereAltura && ' y de que hay que subir'}. La propuesta no
          autoriza nada: sólo la firma.
        </div>
      </div>

      <Seccion titulo="La firma">
        <Campo
          etiqueta="Cómo se interviene"
          ayuda={INTERVENCION[nivel]?.ayuda}
        >
          <select value={nivel} onChange={(e) => setNivel(e.target.value)}>
            <option value="">Sin firmar — el sistema pedirá parada</option>
            {Object.entries(INTERVENCION).filter(([k]) => k !== 'SIN_CLASIFICAR')
              .map(([k, v]) => <option key={k} value={k}>{v.et}</option>)}
          </select>
        </Campo>

        <Campo
          etiqueta="¿Hay que subir para llegar?"
          ayuda="Manlift o escalera. Sube la exigencia por muy fresca que esté la zona."
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 0' }}>
            <input type="checkbox" checked={altura} onChange={(e) => setAltura(e.target.checked)}
                   style={{ width: 18, height: 18, minHeight: 18 }} />
            <span style={{ fontSize: 13 }}>Sí, exige trabajo en altura</span>
          </label>
        </Campo>

        <Campo
          etiqueta="Por qué se puede trabajar así"
          obligatorio={exigeMotivo}
          error={faltaMotivo ? 'Autorizar a trabajar en marcha exige escribir el motivo.' : undefined}
          ayuda="Es lo que va a leer el técnico antes de acercarse, y lo que respalda tu firma si algún día hay que revisarla."
          ancho
        >
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)}
                    placeholder="El grabador está en la cabina del púlpito, cerrada y a 30 m de la línea. No hay exposición a la barra." />
        </Campo>
      </Seccion>
    </Modal>
  );
}
