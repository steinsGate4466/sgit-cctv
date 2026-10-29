/* =============================================================================
   LO QUE VE UNA CÁMARA — bloque 184 (lógica pura, probada aparte)
   -----------------------------------------------------------------------------
   DORI, norma IEC 62676-4: cuántos píxeles caen en un metro de escena.

       Identificar  250 px/m   se reconoce la cara, se lee una placa
       Reconocer    125 px/m   se sabe quién es, si ya se le conoce
       Observar     ~62 px/m   se ve la ropa y qué hace, sin la cara
       Detectar      25 px/m   sólo se nota que hay alguien o algo

   LAS DISTANCIAS SE COPIAN DE LA FICHA, NO SE CALCULAN.
   Se comprobó con dos fichas Hikvision reales: la fórmula teórica (resolución
   entre el ancho de escena) da 43 m de detección donde la ficha dice 67, y
   2.933 m donde dice 2.400. Calcular pintaría conos falsos. La fórmula sólo
   sirve aquí para cazar un error de dedo (un 670 en vez de 67).

   EL ZOOM. La ficha da las distancias a UN ángulo (`doriAnguloRef`). Con otro
   ángulo, el ancho de escena a una distancia cambia con la tangente del medio
   ángulo, y la distancia a la que se conservan los mismos px/m también:

       d(θ) = d(ref) · tan(ref/2) / tan(θ/2)

   Así una PTZ cuya ficha da las distancias en tele se puede pintar a
   cualquier zoom sin inventar ningún número.
============================================================================= */

export const NIVELES = ['identificar', 'reconocer', 'observar', 'detectar'] as const;
export type Nivel = (typeof NIVELES)[number];

/** Densidad de píxeles de cada nivel (px/m), IEC 62676-4. */
export const PX_POR_M: Record<Nivel, number> = {
  identificar: 250, reconocer: 125, observar: 62.5, detectar: 25,
};

export interface Optica {
  resolucionAncho: number;
  anguloH: number;
  anguloHTele?: number | null;
  zoomOptico?: number | null;
  doriAnguloRef: number;
  identificarM: number;
  reconocerM: number;
  observarM: number;
  detectarM: number;
  irM?: number | null;
}

export type Distancias = Record<Nivel, number>;

const rad = (g: number) => (g * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const redondeo = (x: number) => Math.round(x * 10) / 10;

/** Cuánto zoom admite la ficha (1 si es fija). */
export function zoomMaximo(o: Optica): number {
  if (o.zoomOptico && o.zoomOptico > 1) return o.zoomOptico;
  if (o.anguloHTele && o.anguloHTele < o.anguloH) {
    return Math.tan(rad(o.anguloH / 2)) / Math.tan(rad(o.anguloHTele / 2));
  }
  return 1;
}

/**
 * Ángulo horizontal con un zoom dado (1 = gran angular).
 *
 * Con los dos ángulos de la ficha se interpola entre ELLOS (en escala
 * logarítmica de la tangente), para que el zoom máximo dé EXACTAMENTE el
 * ángulo en tele: las fichas redondean y «32x» con 60,2°→2,0° no cuadra al
 * decimal (daría 2,07°). Sin ángulo en tele, la óptica simple: tan(θ/2) / z.
 */
export function anguloConZoom(o: Optica, zoom = 1): number {
  const zMax = zoomMaximo(o);
  const z = Math.min(Math.max(1, zoom || 1), zMax);
  if (z === 1 || zMax === 1) return o.anguloH;
  const tw = Math.tan(rad(o.anguloH / 2));
  if (o.anguloHTele && o.anguloHTele < o.anguloH) {
    const tt = Math.tan(rad(o.anguloHTele / 2));
    const f = Math.log(z) / Math.log(zMax);
    return deg(2 * Math.atan(tw * Math.pow(tt / tw, f)));
  }
  return deg(2 * Math.atan(tw / z));
}

/** Distancias DORI a un ángulo dado, a partir de las de la ficha. */
export function distanciasA(o: Optica, angulo: number): Distancias {
  const k = Math.tan(rad(o.doriAnguloRef / 2)) / Math.tan(rad(angulo / 2));
  return {
    identificar: redondeo(o.identificarM * k),
    reconocer: redondeo(o.reconocerM * k),
    observar: redondeo(o.observarM * k),
    detectar: redondeo(o.detectarM * k),
  };
}

export interface Vision {
  angulo: number;
  zoom: number;
  zoomMax: number;
  dia: Distancias;
  /** De noche no se ve más allá de la luz infrarroja. `null` si la ficha no la da. */
  noche: Distancias | null;
  irM: number | null;
}

/** Lo que ve la cámara con su ficha y su zoom: lo que pinta el mapa. */
export function vision(o: Optica, zoom = 1): Vision {
  const zoomMax = zoomMaximo(o);
  const z = Math.min(Math.max(1, zoom || 1), zoomMax);
  const angulo = anguloConZoom(o, z);
  const dia = distanciasA(o, angulo);
  const ir = o.irM && o.irM > 0 ? o.irM : null;
  const noche = ir === null ? null : {
    identificar: Math.min(dia.identificar, ir),
    reconocer: Math.min(dia.reconocer, ir),
    observar: Math.min(dia.observar, ir),
    detectar: Math.min(dia.detectar, ir),
  };
  return { angulo: redondeo(angulo), zoom: redondeo(z), zoomMax: redondeo(zoomMax), dia, noche, irM: ir };
}

/** La distancia teórica para unos px/m: sólo para cazar errores de dedo. */
export function distanciaTeorica(resolucionAncho: number, angulo: number, pxPorM: number): number {
  return resolucionAncho / (pxPorM * 2 * Math.tan(rad(angulo / 2)));
}

/**
 * QUÉ NO PUEDE SER — se rechaza al guardar, con el motivo.
 * No juzga si la ficha es la buena (eso lo hace la persona que verifica con el
 * PDF delante); caza lo que es IMPOSIBLE o un error de dedo evidente.
 */
export function problemasDeOptica(o: Optica): string[] {
  const p: string[] = [];
  const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x);

  if (!num(o.resolucionAncho) || o.resolucionAncho < 320 || o.resolucionAncho > 16000) {
    p.push('La resolución horizontal no es razonable (entre 320 y 16000 píxeles).');
  }
  if (!num(o.anguloH) || o.anguloH <= 0 || o.anguloH > 360) p.push('El ángulo horizontal tiene que estar entre 0 y 360°.');
  if (o.anguloHTele != null && (!num(o.anguloHTele) || o.anguloHTele <= 0 || o.anguloHTele >= o.anguloH)) {
    p.push('El ángulo en tele tiene que ser MENOR que el gran angular.');
  }
  if (o.zoomOptico != null && (!num(o.zoomOptico) || o.zoomOptico < 1 || o.zoomOptico > 100)) {
    p.push('El zoom óptico tiene que estar entre 1 y 100.');
  }
  const ref = o.doriAnguloRef;
  const angulosValidos = [o.anguloH, o.anguloHTele].filter((x): x is number => num(x));
  if (!num(ref) || !angulosValidos.some((a) => Math.abs(a - ref) < 0.05)) {
    p.push('Di si las distancias de la ficha son en gran angular o en tele.');
  }
  const d = [o.identificarM, o.reconocerM, o.observarM, o.detectarM];
  if (d.some((x) => !num(x) || x <= 0 || x > 10000)) {
    p.push('Las cuatro distancias tienen que ser números mayores que cero (en metros).');
    return p;
  }
  if (!(o.identificarM < o.reconocerM && o.reconocerM < o.observarM && o.observarM < o.detectarM)) {
    p.push('Las distancias van de menor a mayor: identificar < reconocer < observar < detectar.');
  }
  /* La norma da 250 / 25 = 10 entre identificar y detectar; las fichas
     redondean (Hikvision: 67 / 6 = 11,2). Fuera de 6-16 es un error de dedo. */
  const proporcion = o.detectarM / o.identificarM;
  if (proporcion < 6 || proporcion > 16) {
    p.push(`Detectar debería ser unas 10 veces identificar y aquí es ${proporcion.toFixed(1)} veces: revisa los números.`);
  }
  if (o.irM != null && (!num(o.irM) || o.irM < 0 || o.irM > 5000)) p.push('El alcance infrarrojo no es razonable.');
  /* La teoría se desvía un 20-40 % de lo que publica el fabricante; más de
     tres veces es que el número está mal copiado. */
  if (num(o.resolucionAncho) && num(ref) && ref > 0 && ref < 360) {
    const teorica = distanciaTeorica(o.resolucionAncho, ref, PX_POR_M.detectar);
    const r = o.detectarM / teorica;
    if (r > 3 || r < 1 / 3) {
      p.push(
        `Con ${o.resolucionAncho} píxeles y ${ref}° la detección rondaría los ${Math.round(teorica)} m, `
        + `y la ficha dice ${o.detectarM} m. Revisa la resolución, el ángulo o la distancia.`,
      );
    }
  }
  return p;
}
