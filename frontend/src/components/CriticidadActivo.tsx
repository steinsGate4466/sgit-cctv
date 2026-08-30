import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { mensajeDeError } from '../avisos';
import { useAuth } from '../auth/AuthContext';

/* =============================================================================
   LA LETRA A/B/C DE ESTE EQUIPO — bloque 76
   -----------------------------------------------------------------------------
   PETICIÓN DEL USUARIO, textual: «la criticidad debe salir en ACTIVO y también
   en la parte de GESTIÓN».

   Tenía razón, y el fallo era mío: el cálculo llevaba tres bloques escrito, con
   sus pruebas en verde, y **no lo llamaba ni un solo archivo del sistema**. Es
   el error que este proyecto tiene escrito cuatro veces con otras palabras:
   *modelo + cálculo ≠ función. Sin pantalla, no existe.*

   -----------------------------------------------------------------------------
   POR QUÉ VA AQUÍ Y NO SÓLO EN GESTIÓN

   «¿Cada cuánto hay que subir a revisar esto?» se pregunta CON EL EQUIPO
   DELANTE. El técnico no entra a una pantalla de gestión: escanea el QR o abre
   la ficha. Un dato que sólo vive en la pantalla del ingeniero es un dato que
   quien trabaja no ve nunca — es exactamente lo que pasó con el nivel de
   bloqueo en el bloque 62-B.

   -----------------------------------------------------------------------------
   TRES DECISIONES DE LO QUE SE PINTA

   1. **EL PORQUÉ SIEMPRE, TAMBIÉN CUANDO SALE C.** Un equipo que baja de
      categoría sin explicar por qué es lo primero que alguien discute en una
      auditoría, y con razón.

   2. **«SIN CLASIFICAR» NO SE ESCONDE Y NO SE PINTA COMO UN FALLO.** Es
      trabajo por hacer, y se dice exactamente qué falta. Esconderlo haría que
      cuatrocientas cámaras sin revisar no aparecieran en ninguna parte.

   3. **NADA CELEBRA.** No hay variante verde ni para una C. Un verde de «todo
      correcto» se aprende a ignorar en una semana, y entonces ya no informa el
      día que importa. Es la misma regla del aviso de intervención (62-B).
============================================================================= */

const COLOR: Record<string, { fondo: string; borde: string; texto: string }> = {
  A: { fondo: '#fee2e2', borde: '#fca5a5', texto: '#991b1b' },
  B: { fondo: '#ffedd5', borde: '#fdba74', texto: '#9a3412' },
  C: { fondo: '#e0e7ff', borde: '#a5b4fc', texto: '#3730a3' },
  // Ámbar: falta un dato, no es un error. El rojo se reserva para lo que falló.
  SIN_CLASIFICAR: { fondo: '#fef3c7', borde: '#fcd34d', texto: '#92400e' },
};

const QUE_SIGNIFICA: Record<string, string> = {
  A: 'Lo más exigente: se revisa más seguido que ningún otro.',
  B: 'Exigencia media.',
  C: 'Lo menos exigente. Se revisa, pero puede esperar.',
  SIN_CLASIFICAR: 'Todavía no se puede decidir cada cuánto revisarlo.',
};

/** Las cuatro respuestas a «si esto deja de ver, ¿qué pasa?». En castellano. */
const IMPACTO: { valor: number; texto: string }[] = [
  { valor: 4, texto: 'Hay que parar la línea' },
  { valor: 3, texto: 'Se baja el ritmo' },
  { valor: 2, texto: 'Se sigue, pero con un vigía' },
  { valor: 1, texto: 'No pasa nada' },
];

export default function CriticidadActivo({ assetId }: { assetId: string }) {
  const { can } = useAuth();
  const [dato, setDato] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const { data } = await api.get(`/criticidad/${assetId}`);
      setDato(data);
      setError('');
    } catch (e: any) {
      /* Se guarda el motivo REAL y no se convierte en «no hay datos». Hay 110
         `catch(() => [])` en este proyecto y son deuda declarada: cuando el
         usuario ve un bloque vacío, puede que el dato exista y la petición esté
         fallando en silencio. Aquí no. */
      setError(mensajeDeError(e, 'leer la criticidad de este equipo'));
      setDato(null);
    } finally {
      setCargando(false);
    }
  }, [assetId]);

  useEffect(() => { cargar(); }, [cargar]);

  const declarar = async (campo: string, valor: any) => {
    setGuardando(true);
    try {
      const { data } = await api.post(`/criticidad/${assetId}`, { [campo]: valor });
      // Se pinta la letra RECALCULADA. Un «guardado» a secas obligaría a
      // recargar para saber en qué se convirtió lo que se acaba de declarar.
      setDato(data);
      setError('');
    } catch (e: any) {
      setError(mensajeDeError(e, 'guardar la criticidad'));
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return <div className="muted" style={{ fontSize: 12 }}>Calculando criticidad…</div>;

  if (error && !dato) {
    return (
      <div className="crit-caja" style={{ background: COLOR.SIN_CLASIFICAR.fondo, borderColor: COLOR.SIN_CLASIFICAR.borde, color: COLOR.SIN_CLASIFICAR.texto }}>
        <div className="crit-titulo">No se pudo leer la criticidad</div>
        <div className="crit-porque">{error}</div>
        <button className="btn-mini" onClick={cargar}>Reintentar</button>
      </div>
    );
  }
  if (!dato) return null;

  const letra: string = dato.letra || 'SIN_CLASIFICAR';
  const c = COLOR[letra] || COLOR.SIN_CLASIFICAR;
  const puedeDeclarar = can('asset.update');

  return (
    <div
      /* La clase NO lleva la letra: el color viene del dato y va en línea.
         Una clase por letra obligaría a mantener el mismo color en dos sitios,
         y una de las dos reglas ganaría en silencio. */
      className="crit-caja"
      style={{ background: c.fondo, borderColor: c.borde, color: c.texto }}
    >
      <div className="crit-cabecera">
        <span className="crit-letra" style={{ borderColor: c.borde }}>
          {letra === 'SIN_CLASIFICAR' ? '—' : letra}
        </span>
        <div>
          <div className="crit-titulo">
            {letra === 'SIN_CLASIFICAR'
              ? 'Sin clasificar todavía'
              : `Criticidad ${letra} · se revisa cada ${dato.diasEntreRevisiones} días`}
          </div>
          <div className="crit-sub">{QUE_SIGNIFICA[letra]}</div>
        </div>
      </div>

      {/* Los dos motivos que se saltan el puntaje van marcados: hay que poder
          ver que la regla se aplicó a propósito y no que el sistema no calculó. */}
      {dato.porSeguridad && (
        <div className="crit-marca">Es A por SEGURIDAD. Eso no lo discute ningún puntaje.</div>
      )}
      {dato.porSoporte && (
        <div className="crit-marca">
          Hereda la letra de los {dato.cuantosDependenDeEl} equipo(s) que dependen de él.
        </div>
      )}

      {dato.porque?.length > 0 && (
        <ul className="crit-porque">
          {dato.porque.map((p: string, i: number) => <li key={i}>{p}</li>)}
        </ul>
      )}

      {dato.faltaDeclarar?.length > 0 && (
        <div className="crit-falta">
          <strong>Para poder clasificarlo falta:</strong>
          <ul>{dato.faltaDeclarar.map((f: string, i: number) => <li key={i}>{f}</li>)}</ul>
        </div>
      )}

      {error && <div className="crit-error">{error}</div>}

      {puedeDeclarar && (
        <div className="crit-declarar">
          <button
            type="button"
            className="btn-mini"
            aria-expanded={abierto}
            onClick={() => setAbierto((v) => !v)}
          >
            {abierto ? 'Cerrar' : 'Declarar impacto y riesgo'}
          </button>

          {abierto && (
            <div className="crit-form">
              {/* Se dice DE DÓNDE viene cada valor. Sin esto, quien abre el
                  formulario no sabe si está poniendo un dato nuevo o pisando
                  el de su zona — y pisar sin querer lo de la zona rompe la
                  clasificación de las demás cámaras del sitio. */}
              <fieldset>
                <legend>Si este equipo deja de ver, ¿qué pasa?</legend>
                <div className="crit-opciones">
                  {IMPACTO.map((o) => (
                    <label key={o.valor} className="crit-op">
                      <input
                        type="radio"
                        name={`impacto-${assetId}`}
                        checked={dato.factores?.impactoOperacional === o.valor
                          && dato.origenImpacto === 'ACTIVO'}
                        disabled={guardando}
                        onChange={() => declarar('impactoOperacional', o.valor)}
                      />
                      <span>{o.texto}</span>
                    </label>
                  ))}
                </div>
                {dato.origenImpacto === 'ZONA' && (
                  <div className="crit-heredado">
                    Ahora se hereda de {dato.zonaNombre || 'la zona'}. Si marcas una
                    opción, mandará la de este equipo.
                  </div>
                )}
                {dato.origenImpacto === 'ACTIVO' && (
                  <button
                    type="button"
                    className="btn-mini"
                    disabled={guardando}
                    onClick={() => declarar('impactoOperacional', null)}
                  >
                    Volver a lo que dice la zona
                  </button>
                )}
              </fieldset>

              <fieldset>
                <legend>¿Vigila un sitio donde puede resultar herida una persona?</legend>
                <div className="crit-opciones">
                  <label className="crit-op">
                    <input
                      type="radio"
                      name={`riesgo-${assetId}`}
                      checked={dato.factores?.riesgoPersonas === true && dato.origenRiesgo === 'ACTIVO'}
                      disabled={guardando}
                      onChange={() => declarar('riesgoPersonas', true)}
                    />
                    <span>Sí — barra caliente, paso de grúa, foso, tránsito</span>
                  </label>
                  <label className="crit-op">
                    <input
                      type="radio"
                      name={`riesgo-${assetId}`}
                      checked={dato.factores?.riesgoPersonas === false && dato.origenRiesgo === 'ACTIVO'}
                      disabled={guardando}
                      onChange={() => declarar('riesgoPersonas', false)}
                    />
                    <span>No</span>
                  </label>
                </div>
                {dato.origenRiesgo === 'ZONA' && (
                  <div className="crit-heredado">
                    Ahora se hereda de {dato.zonaNombre || 'la zona'}
                    {dato.riesgoMotivo ? `: ${dato.riesgoMotivo}` : ''}.
                  </div>
                )}
                {dato.origenRiesgo === 'ACTIVO' && (
                  <button
                    type="button"
                    className="btn-mini"
                    disabled={guardando}
                    onClick={() => declarar('riesgoPersonas', null)}
                  >
                    Volver a lo que dice la zona
                  </button>
                )}
              </fieldset>

              <div className="crit-nota">
                Queda con tu nombre y la hora. La letra se recalcula sola: no se
                guarda en ningún sitio, así que si mañana ponen otra cámara en la
                misma zona, esta baja sola.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
