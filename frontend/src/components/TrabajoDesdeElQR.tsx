/* =============================================================================
   BLOQUE 62-A · TRABAJAR LA ORDEN DESDE EL POSTE
   -----------------------------------------------------------------------------
   EL PROBLEMA

   El QR ya enseñaba «OM-2026-0042 abierta — limpieza preventiva». Y ahí se
   acababa. Para decir que la había hecho, el técnico tenía que guardar el
   móvil, bajar, ir a la oficina, entrar a Mantenimiento y buscarla en una
   lista de trescientas.

   Resultado previsible: se apunta en un papel y se pasa «luego». Luego es al
   día siguiente, o no es. Y entonces el plan preventivo dice que no se hizo
   algo que sí se hizo, y el indicador de cumplimiento miente hacia abajo.

   El QR era una pantalla para LEER. Esto la convierte en una pantalla para
   TRABAJAR, que es lo que pidió el usuario: «botones a parte de la
   informacion... es informacion en campo».

   -----------------------------------------------------------------------------
   POR QUÉ ES `progress` Y NO `close`

   Porque cerrar la orden exige `wo.approve` y eso es del Jefe de Mantenimiento.
   No se toca: es la misma regla que el usuario fijó para las incidencias
   —«tiene que esperar al jefe»— y el cierre lleva firma y consumo de
   materiales detrás.

   PERO ESO HAY QUE DECIRLO EN PANTALLA. Si el técnico pulsa «ya está» y la
   orden sigue apareciendo abierta, la conclusión razonable es «esto no
   funciona» y no lo vuelve a usar. Por eso el mensaje de después nombra
   explícitamente que falta la firma del Jefe y que él ya hizo su parte.

   -----------------------------------------------------------------------------
   TRES DECISIONES DE CAMPO

   1. BOTONES GRANDES CON PORCENTAJE FIJO, no un deslizador. Con guantes, de
      noche, un deslizador es imposible; y el porcentaje exacto da igual: lo
      que importa es «empecé / voy a medias / terminé».

   2. LA NOTA ES OPCIONAL SALVO CUANDO SE ATASCA. Si el trabajo no se pudo
      terminar, el motivo es el dato — «faltó el conector», «no había
      manlift»—. Sin eso, el que lo recoja mañana empieza de cero.

   3. NO SE PIDE CONFIRMACIÓN. Un parte de avance es reversible: se anota otro
      encima. Los diálogos se guardan para lo irreversible (bloque 15).
============================================================================= */
import { useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import Icono from './Iconos';

const ESTADO_OM: Record<string, string> = {
  ABIERTA: 'Abierta',
  EN_PROCESO: 'En proceso',
  EN_ESPERA: 'En espera',
};

interface Paso {
  pct: number;
  etiqueta: string;
  /** Cuando el trabajo no avanzó, el motivo deja de ser opcional. */
  exigeNota?: boolean;
}

const PASOS: Paso[] = [
  { pct: 25, etiqueta: 'Empecé' },
  { pct: 60, etiqueta: 'Voy a medias' },
  { pct: 100, etiqueta: 'Ya está terminado' },
  { pct: 0, etiqueta: 'No pude — falta material', exigeNota: true },
];

export default function TrabajoDesdeElQR({
  ordenes,
  alGuardar,
}: {
  /** Las órdenes VIVAS de este equipo. Vienen con la ficha del activo. */
  ordenes: any[];
  /** Para que la ficha se recargue y el técnico vea el estado nuevo. */
  alGuardar: () => void;
}) {
  const { can } = useAuth();
  const [abierto, setAbierto] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [hecho, setHecho] = useState<{ code: string; termino: boolean } | null>(null);
  const [error, setError] = useState('');

  // Sin permiso de trabajar órdenes esto no se pinta: un botón que devuelve
  // 403 enseña a desconfiar de todos los botones.
  if (!can('wo.update')) return null;
  if (!ordenes.length) return null;

  async function anotar(orden: any, paso: Paso) {
    if (paso.exigeNota && !nota.trim()) {
      setError('Indica qué falta para continuar.');
      return;
    }
    setError('');
    setGuardando(true);
    try {
      await api.post(`/work-orders/${orden.id}/progress`, {
        pct: paso.pct,
        note: nota.trim() || undefined,
      });
      setHecho({ code: orden.code, termino: paso.pct === 100 });
      setNota('');
      setAbierto(null);
      alGuardar();
    } catch (e: any) {
      /* El mensaje del servidor por delante: dice qué pasa de verdad —«la
         orden ya está cerrada», «no es de tu tren»—. `e.message` a secas
         devuelve «Request failed with status code 400», que en un poste con
         guantes y de noche no le sirve a nadie. */
      const delServidor = e?.response?.data?.message;
      setError(
        (Array.isArray(delServidor) ? delServidor.join('. ') : delServidor)
        || (e?.response?.status
          ? `No se pudo guardar (error ${e.response.status}). Vuelve a intentarlo.`
          : 'No hay conexión con el servidor. Comprueba la señal y vuelve a intentarlo.'),
      );
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="qr-trabajo">
      <div className="section-title">Registrar avance</div>

      {ordenes.map((o) => (
        <div key={o.code} className="card scan-card qr-om">
          <div className="qr-om-cab">
            <b>{o.code}</b>
            <span className="qr-om-est">{ESTADO_OM[o.status] || o.status}</span>
          </div>
          {o.activity && <div className="qr-om-act">{o.activity}</div>}

          {abierto === o.code ? (
            <>
              <div className="qr-pasos">
                {PASOS.map((p) => (
                  <button
                    key={p.etiqueta}
                    type="button"
                    className={'btn-mini' + (p.pct === 100 ? ' btn-primary' : '')}
                    disabled={guardando}
                    onClick={() => anotar(o, p)}
                  >
                    {p.etiqueta}
                  </button>
                ))}
              </div>
              {/* La etiqueta ENVUELVE al campo: así tocar el texto enfoca el
                  cuadro. Con guantes, en un móvil, ese margen de acierto de
                  más es la diferencia entre escribir la nota y no escribirla. */}
              <label className="qr-nota-lab">
                <span>Nota</span>
                <textarea
                  className="qr-nota"
                  placeholder="Opcional. Obligatoria si no pudiste terminar"
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  rows={2}
                />
              </label>
              <button type="button" className="btn-mini" onClick={() => { setAbierto(null); setError(''); }}>
                Cancelar
              </button>
            </>
          ) : (
            <button type="button" className="btn-primary qr-om-btn" onClick={() => setAbierto(o.code)}>
              <Icono n="orden" size={16} /> Anotar avance de {o.code}
            </button>
          )}
        </div>
      ))}

      {error && <div className="error" style={{ display: 'block' }}>{error}</div>}

      {/* EL MENSAJE MÁS IMPORTANTE DE ESTE COMPONENTE.
          Sin él, el técnico marca «terminado», ve que la orden sigue abierta y
          concluye que la aplicación falla. Se le dice exactamente dónde está
          su trabajo y de quién depende ahora. */}
      {hecho && (
        <div className="scan-note qr-hecho">
          <Icono n="ok" size={16} />
          <span>
            {hecho.termino ? (
              <>
                <b>{hecho.code} marcada como terminada.</b> Pendiente de cierre
                por el Jefe de Mantenimiento.
              </>
            ) : (
              <><b>Avance anotado en {hecho.code}.</b></>
            )}
          </span>
        </div>
      )}

      {/* QUIÉN PUEDE Y QUIÉN FIRMA — se dice SIEMPRE, no sólo al terminar.
          El técnico tiene que saber, antes de pulsar, que esto queda con su
          nombre y que la última palabra no es suya. Un sistema que audita en
          silencio se siente como una trampa; uno que lo dice por delante se
          usa con confianza y además disuade de tocar lo que no toca. */}
      <div className="qr-firma-nota">
        <Icono n="firma" size={13} />
        <span>
          Queda registrado con tu nombre y la hora. El cierre lo firma el
          Jefe de Mantenimiento.
        </span>
      </div>
    </div>
  );
}
