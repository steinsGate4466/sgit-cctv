import { DibujoEquipo } from '../DibujoEquipo';
import { NIVELES_DORI, metros, type VisionDelPunto } from '../../dori';

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
  /** x, y: dónde se tocó, en píxeles del plano (sin ellos, p. ej. con teclado, no se pasan). */
  onPulsar?: (x?: number, y?: number) => void;
}) {
  const clase = 'marcador punto-' + e.estado + (seleccionado ? ' sel' : '');
  const icono = iconoDe(e);
  const esCamara = e.tipo === 'CAMERA';
  return (
    <g
      className={clase}
      transform={`translate(${e.xPx} ${e.yPx}) scale(${escala})`}
      onClick={(ev) => {
        ev.stopPropagation();
        /* Bloque 173 · se pasa DÓNDE se tocó: si cae dentro de dos discos a la
           vez, el mapa pregunta cuál en vez de abrir el de arriba. */
        const svg = (ev.currentTarget as SVGGElement).ownerSVGElement;
        const m = svg?.getScreenCTM();
        if (svg && m) {
          const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY;
          const r = p.matrixTransform(m.inverse());
          onPulsar?.(r.x, r.y);
        } else onPulsar?.();
      }}
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

/* -----------------------------------------------------------------------------
   EL CONO DE LO QUE VE — bloques 151 y 184.

   CON FICHA TÉCNICA: cuatro franjas, una por nivel DORI, a las distancias que
   publica el fabricante y al zoom en que quedó la cámara (lo calcula el
   servidor). La franja más fuerte es donde se le ve la cara a alguien; la más
   tenue, donde sólo se nota que hay alguien. Más allá del borde, borroso.
   Si nadie ha verificado la ficha todavía, el borde va PUNTEADO: el dato está,
   pero aún no lo ha comparado otra persona con el PDF.

   SIN FICHA: el cono de siempre, el que alguien dibujó a mano con «Apuntar».
   No se inventa ninguna franja: sin ficha no se sabe hasta dónde se ve bien.

   El color sigue siendo el del estado (verde, ámbar, rojo, gris): el púlpito
   ya lee así el mapa y un cono rojo sigue queriendo decir «esto no se ve».
----------------------------------------------------------------------------- */
const rad = (g: number) => (g * Math.PI) / 180;

/** Un sector de corona: de r0 a r1, entre dos ángulos (en grados de pantalla). */
function sector(cx: number, cy: number, r0: number, r1: number, desde: number, hasta: number): string {
  const p = (r: number, a: number) => `${cx + r * Math.cos(rad(a))} ${cy + r * Math.sin(rad(a))}`;
  const grande = hasta - desde > 180 ? 1 : 0;
  if (r0 <= 0) return `M${cx} ${cy} L${p(r1, desde)} A${r1} ${r1} 0 ${grande} 1 ${p(r1, hasta)} Z`;
  return `M${p(r0, desde)} L${p(r1, desde)} A${r1} ${r1} 0 ${grande} 1 ${p(r1, hasta)}`
    + ` L${p(r0, hasta)} A${r0} ${r0} 0 ${grande} 0 ${p(r0, desde)} Z`;
}

/**
 * Qué distancias se escriben sobre el cono sin que se pisen. De noche dos
 * niveles pueden quedar a 4 m («26 m» y «30 m») y se leían «26 r30 m». Se
 * recorre de FUERA hacia dentro —el alcance máximo es lo que más se pregunta—
 * y se salta la que caería encima de la ya escrita, o encima del propio equipo.
 * `escala` pasa píxeles de pantalla a píxeles del plano: una cota mide unos
 * 40 px en pantalla.
 */
function cotasQueCaben(radios: number[], escala: number): number[] {
  const hueco = 40 * escala;
  const quedan: number[] = [];
  let ultima = Infinity;
  for (let i = radios.length - 1; i >= 0; i--) {
    if (radios[i] <= 0 || (i > 0 && radios[i] <= radios[i - 1])) continue;
    // Pegada al disco del equipo no se lee: queda debajo del dibujo.
    if (radios[i] < 30 * escala || ultima - radios[i] < hueco) continue;
    quedan.push(i);
    ultima = radios[i];
  }
  return quedan;
}

/** Sólo el arco de un radio: la raya que separa dos franjas. */
function arco(cx: number, cy: number, r: number, desde: number, hasta: number): string {
  const p = (a: number) => `${cx + r * Math.cos(rad(a))} ${cy + r * Math.sin(rad(a))}`;
  return `M${p(desde)} A${r} ${r} 0 ${hasta - desde > 180 ? 1 : 0} 1 ${p(hasta)}`;
}

export function ConoDeVision({ e, metrosPorPx, noche = false, escala = 1, conCotas = false }: {
  e: {
    codigo?: string; xPx: number; yPx: number; rumbo?: number | null; anguloVision?: number | null;
    alcanceM?: number | null; estado: string; vision?: VisionDelPunto | null;
  };
  metrosPorPx: number | null;
  /** Capa «Noche»: sólo hasta donde llega su infrarrojo. */
  noche?: boolean;
  /** Para que las cotas midan lo mismo en pantalla con cualquier zoom. */
  escala?: number;
  /** Las distancias escritas sobre el cono (la cámara elegida). */
  conCotas?: boolean;
}) {
  if (e.rumbo == null || !metrosPorPx) return null;
  const v = e.vision;

  if (!v) {
    if (!e.alcanceM) return null;
    const ang = Math.min(e.anguloVision || 70, 359.9);
    return (
      <path className={'cono punto-' + e.estado}
        d={sector(e.xPx, e.yPx, 0, e.alcanceM / metrosPorPx, e.rumbo - ang / 2, e.rumbo + ang / 2)} />
    );
  }

  const ang = Math.min(v.angulo, 359.9);
  const desde = e.rumbo - ang / 2;
  const hasta = e.rumbo + ang / 2;
  const quien = [e.codigo, v.marca && v.modelo ? `${v.marca} ${v.modelo} · ${v.lente}` : v.lente].filter(Boolean).join(' · ');

  /* De noche y sin el dato del infrarrojo NO se supone nada: se marca sólo
     hasta dónde llegaría de día, punteado, y se dice por qué. */
  if (noche && !v.noche) {
    return (
      <path className={'cono-noche-sin-dato punto-' + e.estado}
        d={sector(e.xPx, e.yPx, 0, v.dia.detectar / metrosPorPx, desde, hasta)}>
        <title>{`${quien}: su ficha no dice hasta dónde llega el infrarrojo.`}</title>
      </path>
    );
  }

  const d = (noche ? v.noche : v.dia)!;
  const radios = NIVELES_DORI.map((n) => d[n.clave] / metrosPorPx);
  return (
    <g className={'punto-' + e.estado}>
      {NIVELES_DORI.map((n, i) => {
        const r0 = i === 0 ? 0 : radios[i - 1];
        if (radios[i] <= r0) return null;   // de noche dos niveles pueden quedar en el mismo sitio
        return (
          <path key={n.clave} className={'cono-franja dori-' + n.clave} d={sector(e.xPx, e.yPx, r0, radios[i], desde, hasta)}>
            <title>{`${quien}\n${n.texto}: hasta ${metros(d[n.clave])}${noche ? ' (de noche)' : ''}`}</title>
          </path>
        );
      })}
      {radios.slice(0, -1).map((r, i) => r > 0 && r < radios[3] && (
        <path key={'c' + i} className="cono-corte" d={arco(e.xPx, e.yPx, r, desde, hasta)} />
      ))}
      <path className={'cono-borde' + (v.verificada ? '' : ' sin-verificar')}
        d={sector(e.xPx, e.yPx, 0, radios[3], desde, hasta)} />
      {conCotas && cotasQueCaben(radios, escala).map((i) => {
        const n = NIVELES_DORI[i];
        const x = e.xPx + radios[i] * Math.cos(rad(e.rumbo!));
        const y = e.yPx + radios[i] * Math.sin(rad(e.rumbo!));
        return (
          <g key={'t' + n.clave} transform={`translate(${x} ${y}) scale(${escala})`}>
            <text className="cono-cota" textAnchor="middle" dominantBaseline="central">{metros(d[n.clave])}</text>
          </g>
        );
      })}
    </g>
  );
}
