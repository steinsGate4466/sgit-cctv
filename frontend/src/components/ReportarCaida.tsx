import { useState } from 'react';
import { api } from '../api/client';
import Icono from './Iconos';
import { useAuth } from '../auth/AuthContext';
import Campo from './Campo';

/**
 * REPORTAR QUE NO SE VE — bloque 51-B. La puerta de Producción.
 *
 * =============================================================================
 *  TRES CAMPOS, Y DOS SON OPCIONALES
 * =============================================================================
 *  Qué cámara (ya la trae el QR), la zona si la sabe, y una foto del púlpito
 *  si puede. Nada más.
 *
 *  Antes, para avisar de esto, el Ing. Cañasas tenía que llenar el mismo
 *  formulario que un técnico de red: categoría de falla, prioridad, sesiones
 *  concurrentes del NVR, cámaras aguas abajo. No lo llenaba —y hace bien— y
 *  avisaba por radio. El aviso se perdía y la línea podía estar ocho horas sin
 *  visión sin que en el sistema constara un minuto.
 *
 * =============================================================================
 *  EL BOTÓN ES GRANDE A PROPÓSITO
 * =============================================================================
 *  Esto se usa de pie en el púlpito, con guantes, con el celular en una mano y
 *  la radio en la otra. Un botón de dieciséis píxeles ahí no se acierta.
 *
 * =============================================================================
 *  NO SE LE ENSEÑA NADA TÉCNICO
 * =============================================================================
 *  Ni el tablero, ni el repuesto, ni de qué antena cuelga. Eso es para quien va
 *  a repararlo y vive en «Por dónde empezar», que pide `wo.read`. Llenarle la
 *  pantalla a Producción de datos que no le sirven es exactamente lo que hace
 *  que deje de usar el sistema.
 */
export default function ReportarCaida({
  assetId, codigo, onListo,
}: {
  assetId: string;
  codigo?: string;
  /** Para que la pantalla que lo contiene se refresque si quiere. */
  onListo?: () => void;
}) {
  const { can } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [zona, setZona] = useState('');
  const [foto, setFoto] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState<any>(null);
  const [error, setError] = useState('');

  if (!can('incident.create')) return null;

  async function enviar() {
    setEnviando(true); setError('');
    try {
      /* Se manda como formulario y no como JSON porque puede llevar la foto.
         Un solo envío: en el púlpito, con la señal que hay, dos viajes es un
         viaje que se cae. */
      const fd = new FormData();
      if (zona.trim()) fd.append('zona', zona.trim());
      if (foto) fd.append('foto', foto);
      const r = await api.post(`/incidents/reporte/${assetId}`, fd);
      setHecho(r.data);
      onListo?.();
    } catch (e: any) {
      setError(
        e?.response?.status === 404
          ? 'Esa cámara no está en tu línea o no existe en el sistema.'
          : 'No se pudo enviar. Vuelve a intentarlo; si sigue igual, avisa por radio.',
      );
    } finally { setEnviando(false); }
  }

  // ------------------------------------------------------------- confirmación
  if (hecho) {
    return (
      <div className="reportar reportar-hecho" role="status">
        <div className="reportar-cabeza">
          <Icono n="ok" size={18} /> <span>Enviado</span>
        </div>
        <p className="reportar-respuesta">{hecho.respuesta}</p>
        {/* Se le devuelve el número. Es lo que puede decir por radio si
            alguien pregunta, y lo que le permite reclamar si nadie va. */}
        {hecho.incidenciaCodigo && (
          <p className="reportar-dato">Número: <b>{hecho.incidenciaCodigo}</b></p>
        )}
        {hecho.firma && <p className="reportar-dato">{hecho.firma}</p>}
        {hecho.fotoGuardada && <p className="reportar-dato">Se guardó tu foto.</p>}
      </div>
    );
  }

  // --------------------------------------------------------------- el botón
  if (!abierto) {
    return (
      <button type="button" className="reportar-abrir" onClick={() => setAbierto(true)}>
        <Icono n="alerta" size={18} />
        <span>No estoy viendo esta cámara</span>
      </button>
    );
  }

  // -------------------------------------------------------------- el formulario
  return (
    <div className="reportar">
      <div className="reportar-cabeza">
        <Icono n="alerta" size={18} />
        <span>Reportar que no se ve{codigo ? ` · ${codigo}` : ''}</span>
      </div>

      <Campo
        etiqueta="¿Qué zona no estás viendo?"
        ayuda="Opcional. Si no la sabes, déjalo en blanco: el técnico la deduce."
        ancho
      >
        <input
          id="reportar-zona"
          type="text"
          value={zona}
          onChange={(e) => setZona(e.target.value)}
          placeholder="Lecho de enfriamiento"
          maxLength={120}
        />
      </Campo>

      <Campo
        etiqueta="Foto de la pantalla del púlpito"
        ayuda="Opcional. Ayuda al técnico a saber si es la cámara o es el monitor."
        ancho
      >
        <input
          id="reportar-foto"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => setFoto(e.target.files?.[0] || null)}
        />
      </Campo>

      {error && <div className="error" role="alert" style={{ display: 'block' }}>{error}</div>}

      <div className="reportar-acciones">
        <button
          type="button"
          className="reportar-enviar"
          onClick={enviar}
          disabled={enviando}
        >
          {enviando ? 'Enviando…' : 'Enviar reporte'}
        </button>
        <button
          type="button"
          className="btn-mini reportar-cancelar"
          onClick={() => setAbierto(false)}
          disabled={enviando}
        >
          Cancelar
        </button>
      </div>

      <p className="reportar-nota">
        No hace falta nada más. El tren, la prioridad y quién eres los pone el
        sistema.
      </p>
    </div>
  );
}
