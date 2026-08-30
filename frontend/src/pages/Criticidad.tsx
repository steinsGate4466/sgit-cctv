import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { EsqueletoTabla } from '../components/Esqueleto';
import { Titular } from '../components/Patron';
import Icono from '../components/Iconos';
import BotonConMotivo from '../components/BotonConMotivo';
import { mensajeDeError, queFalta } from '../avisos';
import { useBusquedaEnVivo } from '../useBusquedaEnVivo';

/* =============================================================================
   CRITICIDAD A/B/C — la pantalla del ingeniero (bloque 76)
   =============================================================================

   QUÉ CONTESTA, en una frase:

       ¿Cada cuánto hay que subir a revisar cada equipo, y por qué?

   -----------------------------------------------------------------------------
   POR QUÉ EXISTE ESTA PANTALLA

   El cálculo llevaba tres bloques escrito, con 26 pruebas en verde, y **no lo
   llamaba ni un solo archivo del sistema**. El usuario lo dijo sin rodeos: la
   criticidad tiene que salir en el activo Y en gestión.

   Es el mismo error que el mapa de red, el módulo de documentos y el nivel de
   bloqueo del QR: *modelo + cálculo ≠ función. Sin pantalla, no existe.*

   -----------------------------------------------------------------------------
   EL MÉTODO ES EL CTR, Y ESO NO ES ADORNO

       CRITICIDAD = FRECUENCIA de falla × CONSECUENCIA

   Se elige porque **se defiende delante de un ingeniero de mantenimiento**: no
   es una escala inventada aquí, es la que él ya conoce de minería y siderurgia.
   Y se MULTIPLICA, no se suma: algo que falla mucho pero no le importa a nadie
   no es crítico, y algo que casi nunca falla pero para el tren sí lo es.

   -----------------------------------------------------------------------------
   TRES DECISIONES DE ESTA PANTALLA

   1. **LOS PENDIENTES VAN ARRIBA, JUSTO DEBAJO DE LAS A.** Un pendiente al
      final de una lista de cuatrocientas es un pendiente que nadie ve. Y son
      lo único accionable: una letra no se «arregla», un pendiente sí.

   2. **LOS NÚMEROS SE EDITAN AQUÍ.** Los cortes y los días son un dato de
      planta, y en este proyecto todo lo de planta se edita desde la interfaz.
      Mientras el ingeniero no los confirme, se dice que son PROPUESTOS.

   3. **NINGUNA LETRA SE GUARDA.** Se recalcula en cada carga. Guardarla
      significaría mantener dos verdades, y la segunda se queda vieja el día que
      alguien añada una cámara a la zona.
============================================================================= */

const COLOR: Record<string, string> = {
  A: '#991b1b', B: '#9a3412', C: '#3730a3', SIN_CLASIFICAR: '#92400e',
};
const FONDO: Record<string, string> = {
  A: '#fee2e2', B: '#ffedd5', C: '#e0e7ff', SIN_CLASIFICAR: '#fef3c7',
};
const NOMBRE: Record<string, string> = {
  A: 'A — lo más exigente',
  B: 'B — exigencia media',
  C: 'C — puede esperar',
  SIN_CLASIFICAR: 'Sin clasificar',
};

const TIPO_ES: Record<string, string> = {
  CAMERA: 'Cámara', NVR: 'Grabador', SWITCH: 'Switch', WIRELESS: 'Antena',
  ROUTER: 'Router', FIREWALL: 'Firewall', SERVER: 'Servidor', UPS: 'UPS',
  CABINET: 'Gabinete', DECODER: 'Decodificador', PC: 'PC', PSU: 'Fuente PoE',
  PANTALLA: 'Pantalla', TABLERO_ELECTRICO: 'Tablero', PHONE: 'Teléfono IP',
  OTHER: 'Otro',
};

export default function Criticidad() {
  const { can } = useAuth();
  const navegar = useNavigate();

  const [datos, setDatos] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const [letra, setLetra] = useState('');
  const [texto, setTexto] = useState('');

  const [abriendoNumeros, setAbriendoNumeros] = useState(false);
  const [nums, setNums] = useState<any>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async (q?: string, l?: string) => {
    setError('');
    try {
      const { data } = await api.get('/criticidad', {
        params: { q: q ?? texto, letra: l ?? letra },
      });
      setDatos(data);
    } catch (e: any) {
      /* El motivo real, no «no hay datos». Un bloque vacío y un fallo de
         permiso son indistinguibles para quien mira, y eso es lo que hace decir
         que el software no funciona. */
      setError(mensajeDeError(e, 'leer la criticidad de la planta'));
      setDatos(null);
    }
  }, [texto, letra]);

  useEffect(() => { cargar().finally(() => setCargando(false)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Se busca mientras se escribe. `buscar` va detrás de una `ref` dentro del
     hook porque en estas pantallas la función se recrea en cada repintado, y
     sin eso el temporizador se reiniciaba y no llegaba a cumplirse NUNCA
     (bloque 67). */
  useBusquedaEnVivo(texto, () => cargar(texto, letra));

  const filtrarPor = (l: string) => {
    const nueva = letra === l ? '' : l;
    setLetra(nueva);
    cargar(texto, nueva);
  };

  const abrirNumeros = () => {
    setNums({ ...(datos?.parametros || {}) });
    setAbriendoNumeros(true);
    setMsg('');
  };

  const guardarNumeros = async () => {
    setGuardando(true); setError('');
    try {
      await api.put('/criticidad/parametros', nums);
      setMsg('Números guardados. Las letras se han recalculado con ellos.');
      setAbriendoNumeros(false);
      await cargar();
    } catch (e: any) {
      /* El formulario NO se cierra si falla. El aviso de error vive dentro de
         él: cerrarlo haría desaparecer el motivo y el usuario vería la pantalla
         volver atrás en silencio (bloque 64). */
      setError(mensajeDeError(e, 'guardar los números'));
    } finally { setGuardando(false); }
  };

  const reparto = datos?.reparto || { A: 0, B: 0, C: 0, SIN_CLASIFICAR: 0 };
  const pendientes = reparto.SIN_CLASIFICAR || 0;

  const titular = useMemo(() => {
    if (!datos) return null;
    if (pendientes > 0) {
      return {
        tono: 'atender' as const,
        texto: `${pendientes} equipo(s) todavía sin clasificar`,
        apoyo: 'Sin clasificar no entran en el plan: nadie sabe cada cuánto revisarlos. '
          + 'Se declara la zona una vez y se clasifican todas sus cámaras de golpe.',
      };
    }
    return {
      tono: 'bien' as const,
      texto: `Los ${datos.total} equipos tienen su letra`,
      apoyo: `${reparto.A} de letra A · ${reparto.B} de B · ${reparto.C} de C.`,
    };
  }, [datos, pendientes, reparto.A, reparto.B, reparto.C]);

  if (cargando) return <EsqueletoTabla filas={8} />;

  return (
    <div>
      <h2><Icono n="alerta" size={20} /> Criticidad de mantenimiento</h2>
      <p className="muted" style={{ marginTop: -6 }}>
        Cada cuánto hay que revisar cada equipo, y por qué. Método CTR:
        frecuencia de falla × consecuencia.
      </p>

      {titular && <Titular tono={titular.tono} texto={titular.texto} apoyo={titular.apoyo} />}

      {/* Que los números sean PROPUESTOS y no confirmados se dice siempre, no
          sólo cuando alguien pregunta. Enseñarlos sin avisar los convertiría en
          una decisión que nadie tomó. */}
      {datos && !datos.parametrosConfirmados && (
        <div className="crit-aviso-numeros">
          Los cortes y los días de abajo son una <strong>propuesta de arranque</strong>,
          todavía sin confirmar por la planta.
          {can('wo.approve') && ' Ajústalos cuando tengas el criterio del ingeniero.'}
        </div>
      )}

      {error && <div className="crit-error">{error}</div>}
      {msg && <div className="crit-ok">{msg}</div>}

      {/* ------------------------------------------------------- EL REPARTO */}
      <div className="crit-reparto">
        {(['A', 'B', 'C', 'SIN_CLASIFICAR'] as const).map((l) => (
          <button
            key={l}
            type="button"
            className={`crit-tarjeta${letra === l ? ' crit-tarjeta-activa' : ''}`}
            style={{ background: FONDO[l], color: COLOR[l] }}
            aria-pressed={letra === l}
            onClick={() => filtrarPor(l)}
          >
            <span className="crit-num">{reparto[l] ?? 0}</span>
            <span className="crit-nom">{NOMBRE[l]}</span>
            {datos?.parametros && l !== 'SIN_CLASIFICAR' && (
              <span className="crit-dias">
                cada {l === 'A' ? datos.parametros.diasA : l === 'B' ? datos.parametros.diasB : datos.parametros.diasC} días
              </span>
            )}
          </button>
        ))}
      </div>

      {/* -------------------------------------------------- LOS NÚMEROS */}
      {can('wo.approve') && (
        <div className="crit-numeros">
          {!abriendoNumeros ? (
            <button type="button" className="btn-mini" onClick={abrirNumeros}>
              Ajustar los números de la planta
            </button>
          ) : (
            <div className="crit-form">
              <div className="crit-numeros-rejilla">
                <label>
                  Puntaje mínimo para ser A
                  <input
                    type="number" min={1} value={nums?.corteA ?? ''}
                    onChange={(e) => setNums({ ...nums, corteA: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Puntaje mínimo para ser B
                  <input
                    type="number" min={1} value={nums?.corteB ?? ''}
                    onChange={(e) => setNums({ ...nums, corteB: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Días entre revisiones de una A
                  <input
                    type="number" min={1} value={nums?.diasA ?? ''}
                    onChange={(e) => setNums({ ...nums, diasA: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Días de una B
                  <input
                    type="number" min={1} value={nums?.diasB ?? ''}
                    onChange={(e) => setNums({ ...nums, diasB: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Días de una C
                  <input
                    type="number" min={1} value={nums?.diasC ?? ''}
                    onChange={(e) => setNums({ ...nums, diasC: Number(e.target.value) })}
                  />
                </label>
              </div>
              <p className="muted" style={{ fontSize: 12 }}>
                El corte de A va por encima del de B, o nada saldría B.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                {/* El botón se queda VIVO si falta un dato y dice cuál al
                    pulsarlo. Un botón gris no se puede pulsar, no dispara
                    ningún evento y no hay forma de preguntarle por qué
                    (bloque 67). */}
                <BotonConMotivo
                  falta={queFalta(
                    [!nums?.corteA, 'el puntaje mínimo para ser A'],
                    [!nums?.corteB, 'el puntaje mínimo para ser B'],
                    [!nums?.diasA, 'los días de una A'],
                    [!nums?.diasB, 'los días de una B'],
                    [!nums?.diasC, 'los días de una C'],
                  )}
                  ocupado={guardando}
                  onClick={guardarNumeros}
                >
                  Guardar los números
                </BotonConMotivo>
                <button type="button" className="btn-mini" onClick={() => setAbriendoNumeros(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------- LA TABLA */}
      <div className="crit-busca">
        <input
          type="search"
          value={texto}
          placeholder="Buscar por código de equipo…"
          aria-label="Buscar equipo por código"
          onChange={(e) => setTexto(e.target.value)}
        />
        {/* El botón se queda: quien teclea un código completo lo pulsa por
            costumbre, y quitarlo obliga a esperar sin saber si el sistema
            entendió (bloque 67). */}
        <button type="button" className="btn-mini" onClick={() => cargar(texto, letra)}>Buscar</button>
        {letra && (
          <button type="button" className="btn-mini" onClick={() => filtrarPor(letra)}>
            Quitar el filtro de {letra === 'SIN_CLASIFICAR' ? 'pendientes' : `letra ${letra}`}
          </button>
        )}
      </div>

      {datos?.equipos?.length === 0 ? (
        <p className="nada-que-hacer">
          {texto || letra
            ? 'Ningún equipo cuadra con lo que has pedido.'
            : 'Todavía no hay equipos que clasificar. Los de baja y los de almacén no cuentan.'}
        </p>
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th>Equipo</th><th>Tipo</th><th>Letra</th>
              <th>Se revisa</th><th>Por qué</th><th></th>
            </tr>
          </thead>
          <tbody>
            {(datos?.equipos || []).map((e: any) => (
              <tr key={e.id}>
                <td><strong>{e.assetCode}</strong></td>
                <td>{TIPO_ES[e.tipo] || e.tipo}</td>
                <td>
                  <span
                    className="crit-pastilla"
                    style={{ background: FONDO[e.letra], color: COLOR[e.letra] }}
                  >
                    {e.letra === 'SIN_CLASIFICAR' ? 'Sin clasificar' : e.letra}
                  </span>
                </td>
                <td>
                  {e.diasEntreRevisiones ? `cada ${e.diasEntreRevisiones} días` : '—'}
                </td>
                <td>
                  {e.porSeguridad && <span className="crit-razon">Seguridad de personas</span>}
                  {e.porSoporte && <span className="crit-razon">Sostiene a otros equipos</span>}
                  {e.faltaDeclarar?.length > 0 && (
                    <span className="crit-razon crit-razon-falta">{e.faltaDeclarar[0]}</span>
                  )}
                  {!e.porSeguridad && !e.porSoporte && !e.faltaDeclarar?.length
                    && e.puntaje !== null && <span className="muted">puntaje {e.puntaje}</span>}
                </td>
                <td>
                  {/* Se va a la FICHA del equipo, no a una lista filtrada. Es
                      donde se declara lo que falta — el mismo arreglo que el QR
                      del bloque 69. */}
                  <button
                    type="button"
                    className="btn-mini"
                    onClick={() => navegar(`/assets?activo=${e.id}`)}
                  >
                    Abrir equipo
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
