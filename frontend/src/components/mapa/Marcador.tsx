import { DibujoEquipo } from '../DibujoEquipo';

/**
 * UN EQUIPO EN EL PLANO — bloques 151, 161 y 162.
 *
 * El ANILLO dice cómo está (verde, ámbar, rojo, gris) y lleva una marca si
 * algo pasa; el DIBUJO de dentro es el aparato (`DibujoEquipo`, bloque 162):
 * una camarita domo, una bala, la PTZ, el NVR con sus leds, el switch con sus
 * puertos… Qué dibujo lleva lo decide el servidor (`planos/icono.ts`). Las
 * cámaras llevan además una «nariz» hacia donde miran. Se dibuja en píxeles de pantalla (`escala`): mide
 * lo mismo cerca o lejos.
 */

/** Respaldo si el servidor todavía no manda `icono` (versión anterior). */
const POR_TIPO: Record<string, string> = {
  CAMERA: 'camara', WIRELESS: 'antena', SWITCH: 'switch', NVR: 'nvr', PSU: 'fuente',
  UPS: 'ups', ROUTER: 'router', FIREWALL: 'firewall', SERVER: 'servidor', PC: 'pc',
  PANTALLA: 'pantalla', DECODER: 'decodificador', PHONE: 'telefono',
};

export const NOMBRE_ICONO: Record<string, string> = {
  'camara': 'Cámara', 'camara-domo': 'Cámara domo', 'camara-bala': 'Cámara bala', 'camara-ptz': 'Cámara PTZ',
  'camara-termica': 'Cámara térmica', 'camara-360': 'Cámara 360°', 'antena': 'Antena', 'antena-base': 'Antena base (PMP)',
  'antena-suscriptor': 'Antena suscriptora', 'antena-ptp': 'Radioenlace punto a punto', 'switch': 'Switch',
  'nvr': 'Grabador (NVR)', 'fuente': 'Fuente / inyector PoE', 'ups': 'UPS', 'router': 'Router',
  'firewall': 'Firewall', 'servidor': 'Servidor', 'pc': 'PC / iVMS', 'pantalla': 'Pantalla', 'decodificador': 'Decodificador',
  'telefono': 'Teléfono IP', 'otro': 'Otro equipo',
};

export const iconoDe = (e: { icono?: string | null; tipo: string }) => e.icono || POR_TIPO[e.tipo] || 'otro';

/** El mismo disco del mapa, suelto: para listas, la leyenda y la tarjeta. */
export function IconoEquipo({ e, tam = 22 }: { e: { icono?: string | null; tipo: string; estado?: string }; tam?: number }) {
  return (
    <svg className={'icono-equipo punto-' + (e.estado || 'sindato')} width={tam} height={tam} viewBox="-14 -14 28 28" aria-hidden="true">
      <circle r={12.4} className="marcador-fondo" />
      <DibujoEquipo icono={iconoDe(e)} />
    </svg>
  );
}

/** Estado de un ACTIVO (lista, ficha) al color del anillo del mapa. */
export function puntoDeEstado(estado?: string | null): string {
  if (estado === 'OPERATIVO') return 'ok';
  if (estado === 'FUERA_SERVICIO') return 'caida';
  if (estado === 'CON_INCIDENCIA' || estado === 'MANTENIMIENTO') return 'alerta';
  return 'sindato';
}

/** La marca del estado, arriba a la derecha: «!» caído, «•» alerta, «?» sin dato. */
const MARCA: Record<string, string> = { caida: '!', alerta: '•', sindato: '?' };

export default function Marcador({
  e, escala, seleccionado, conEtiqueta, onPulsar,
}: {
  e: { assetId: string; codigo: string; tipo: string; icono?: string | null; xPx: number; yPx: number; rumbo?: number | null; estado: string };
  escala: number;
  seleccionado?: boolean;
  conEtiqueta?: boolean;
  onPulsar?: () => void;
}) {
  const clase = 'marcador punto-' + e.estado + (seleccionado ? ' sel' : '');
  const icono = iconoDe(e);
  const esCamara = e.tipo === 'CAMERA';
  return (
    <g
      className={clase}
      transform={`translate(${e.xPx} ${e.yPx}) scale(${escala})`}
      onClick={(ev) => { ev.stopPropagation(); onPulsar?.(); }}
      onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onPulsar?.(); } }}
      tabIndex={0}
      role="button"
      aria-label={`${e.codigo}, ${NOMBRE_ICONO[icono] || e.tipo}, ${e.estado}`}
    >
      {e.estado === 'caida' && <circle r={15} className="marcador-pulso" />}
      <circle r={19} className="marcador-halo" />
      {seleccionado && <circle r={21} className="marcador-sel" />}
      {/* La «nariz»: hacia dónde mira la cámara. */}
      {esCamara && e.rumbo != null && (
        <path d="M12.6 -4.6 L19 0 L12.6 4.6 Z" className="marcador-cuerpo" transform={`rotate(${e.rumbo})`} />
      )}
      <circle r={13.2} className="marcador-fondo" />
      <DibujoEquipo icono={icono} />
      {MARCA[e.estado] && (
        <g transform="translate(9.6 -9.6)">
          <circle r={4.6} className="marcador-marca" />
          <text className="marcador-marca-t" textAnchor="middle" dominantBaseline="central">{MARCA[e.estado]}</text>
        </g>
      )}
      {(conEtiqueta || seleccionado || e.estado === 'caida') && (
        <text y={30} className="marcador-etiqueta" textAnchor="middle">{e.codigo}</text>
      )}
    </g>
  );
}

/** El cono de lo que ve una cámara, en METROS reales del plano. */
export function ConoDeVision({ e, metrosPorPx }: {
  e: { xPx: number; yPx: number; rumbo?: number | null; anguloVision?: number | null; alcanceM?: number | null; estado: string };
  metrosPorPx: number | null;
}) {
  if (e.rumbo == null || !e.alcanceM || !metrosPorPx) return null;
  const r = e.alcanceM / metrosPorPx;
  const ang = e.anguloVision || 70;
  const a1 = ((e.rumbo - ang / 2) * Math.PI) / 180;
  const a2 = ((e.rumbo + ang / 2) * Math.PI) / 180;
  const p1 = [e.xPx + r * Math.cos(a1), e.yPx + r * Math.sin(a1)];
  const p2 = [e.xPx + r * Math.cos(a2), e.yPx + r * Math.sin(a2)];
  const grande = ang > 180 ? 1 : 0;
  return (
    <path
      className={'cono punto-' + e.estado}
      d={`M${e.xPx} ${e.yPx} L${p1[0]} ${p1[1]} A${r} ${r} 0 ${grande} 1 ${p2[0]} ${p2[1]} Z`}
    />
  );
}
