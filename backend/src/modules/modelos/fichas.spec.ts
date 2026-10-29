import { leerFicha, lenteCanonica } from './leer-ficha';
import { vision, anguloConZoom, problemasDeOptica, zoomMaximo, Optica } from './vision';

/* =============================================================================
   BLOQUE 184 · FICHAS TÉCNICAS
   Los textos de abajo son de fichas Hikvision REALES (DS-2CD2143G2-IS y
   DS-2DE5432IWG-E), tal como salen al copiar el texto del PDF.
============================================================================= */

const DOMO = [
  'HIKVISION DS-2CD2143G2-IS 4 MP AcuSense Fixed Dome Network Camera',
  'Image Sensor 1/3" Progressive Scan CMOS',
  'Max. Resolution 2688 × 1520',
  'Lens Type & FOV',
  '2.8 mm: horizontal FOV 103°, vertical FOV 55°, diagonal FOV 122°',
  '4 mm: horizontal FOV 84°, vertical FOV 45°, diagonal FOV 100°',
  'DORI (2.8 mm) Detect: 67 m, Observe: 26 m, Recognize: 13 m, Identify: 6 m',
  'DORI (4 mm) Detect: 80 m, Observe: 31 m, Recognize: 16 m, Identify: 8 m',
  'IR Range Up to 30 m',
  'Digital Zoom 16x',
].join('\n');

const DOMO_ABREVIADO = [
  'DS-2CD2143G2-IS',
  'Max. Resolution 2688 x 1520',
  '2.8mm, horizontal FOV: 103°, vertical FOV: 55°',
  'DORI',
  '2.8 mm, D: 67 m, O: 26 m, R: 13 m, I: 6 m',
  'Supplement Light Range Up to 30 m',
].join('\n');

const PTZ = [
  'HIKVISION DS-2DE5432IWG-E 4 MP 32X Powered by DarkFighter IR Network Speed Dome',
  'Image Sensor 1/2.8″ Progressive Scan CMOS',
  'Max. Resolution 2560 × 1440',
  'Focal Length 5.9 mm to 188.8 mm',
  'Zoom 32x optical, 16x digital',
  'Horizontal field of view: 60.2° to 2.0° (wide-tele),',
  'Vertical field of view: 35.2° to 1.1° (wide-tele),',
  'DORI Detect Observe Recognize Identify',
  'Definition 25 px/m 63 px/m 125 px/m 250 px/m',
  'Distance (Tele) 2400.0 m (7874.0 ft) 952.4 m (3124.7 ft) 480.0 m (1574.8 ft) 240.0 m (787.4 ft)',
  'Supplement Light Range IR Distance: up to 150 m',
].join('\n');

describe('asistente de ficha · propone, no inventa', () => {
  it('domo con dos lentes: cada lente con su ángulo y sus cuatro distancias', () => {
    const p = leerFicha(DOMO);
    expect(p.marca).toBe('Hikvision');
    expect(p.modelo).toBe('DS-2CD2143G2-IS');
    expect(p.resolucion).toEqual({ ancho: 2688, alto: 1520 });
    expect(p.sensor).toBe('1/3" CMOS');
    expect(p.irM).toBe(30);
    expect(p.zoomOptico).toBeNull();            // «Digital Zoom 16x» NO es óptico
    const l28 = p.lentes.find((l) => l.lente === '2.8 mm')!;
    expect(l28).toMatchObject({ anguloH: 103, anguloV: 55, doriEn: 'GRAN_ANGULAR' });
    expect(l28.dori).toEqual({ detectarM: 67, observarM: 26, reconocerM: 13, identificarM: 6 });
    const l4 = p.lentes.find((l) => l.lente === '4 mm')!;
    expect(l4.anguloH).toBe(84);
    expect(l4.dori).toEqual({ detectarM: 80, observarM: 31, reconocerM: 16, identificarM: 8 });
  });

  it('la forma abreviada D/O/R/I también se lee', () => {
    const p = leerFicha(DOMO_ABREVIADO);
    const l = p.lentes.find((x) => x.lente === '2.8 mm')!;
    expect(l.anguloH).toBe(103);
    expect(l.dori).toEqual({ detectarM: 67, observarM: 26, reconocerM: 13, identificarM: 6 });
    expect(p.irM).toBe(30);
  });

  it('PTZ: tabla en tele, sólo los METROS (no los pies), y el rango de ángulos', () => {
    const p = leerFicha(PTZ);
    expect(p.modelo).toBe('DS-2DE5432IWG-E');
    expect(p.resolucion).toEqual({ ancho: 2560, alto: 1440 });
    expect(p.zoomOptico).toBe(32);
    expect(p.anguloHTele).toBe(2);
    expect(p.irM).toBe(150);
    expect(p.lentes).toHaveLength(1);
    expect(p.lentes[0]).toMatchObject({ lente: '5.9-188.8 mm', anguloH: 60.2, anguloV: 35.2, doriEn: 'TELE' });
    expect(p.lentes[0].dori).toEqual({ detectarM: 2400, observarM: 952.4, reconocerM: 480, identificarM: 240 });
  });

  it('la cabecera manda el ORDEN de la tabla (si viene al revés, no se cruzan los niveles)', () => {
    const p = leerFicha(PTZ
      .replace('DORI Detect Observe Recognize Identify', 'DORI Identify Recognize Observe Detect')
      .replace('2400.0 m (7874.0 ft) 952.4 m (3124.7 ft) 480.0 m (1574.8 ft) 240.0 m (787.4 ft)',
        '240.0 m (787.4 ft) 480.0 m (1574.8 ft) 952.4 m (3124.7 ft) 2400.0 m (7874.0 ft)'));
    expect(p.lentes[0].dori).toEqual({ detectarM: 2400, observarM: 952.4, reconocerM: 480, identificarM: 240 });
  });

  it('lo que no está, lo DICE: nunca rellena con un valor razonable', () => {
    const p = leerFicha('Una hoja cualquiera sin datos técnicos');
    expect(p.modelo).toBeNull();
    expect(p.resolucion).toBeNull();
    expect(p.lentes).toEqual([]);
    expect(p.avisos.join(' ')).toMatch(/modelo/);
    expect(p.avisos.join(' ')).toMatch(/resolución/);
  });

  it('nombres de lente normalizados', () => {
    expect(lenteCanonica('2,8mm')).toBe('2.8 mm');
    expect(lenteCanonica('2.8-12 mm')).toBe('2.8-12 mm');
    expect(lenteCanonica('5.9 mm to 188.8 mm')).toBe('5.9-188.8 mm');
    expect(lenteCanonica('sin lente')).toBeNull();
  });

  it('no se cuelga con un texto enorme', () => {
    const t0 = Date.now();
    leerFicha('x'.repeat(5_000_000) + DOMO);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});

const DOMO_OPT: Optica = {
  resolucionAncho: 2688, anguloH: 103, doriAnguloRef: 103,
  identificarM: 6, reconocerM: 13, observarM: 26, detectarM: 67, irM: 30,
};
const PTZ_OPT: Optica = {
  resolucionAncho: 2560, anguloH: 60.2, anguloHTele: 2, zoomOptico: 32, doriAnguloRef: 2,
  identificarM: 240, reconocerM: 480, observarM: 952.4, detectarM: 2400, irM: 150,
};

describe('lo que ve · las distancias de la ficha, sin inventar', () => {
  it('cámara fija: tal cual la ficha, y de noche hasta donde llega el IR', () => {
    const v = vision(DOMO_OPT);
    expect(v.angulo).toBe(103);
    expect(v.zoomMax).toBe(1);
    expect(v.dia).toEqual({ identificar: 6, reconocer: 13, observar: 26, detectar: 67 });
    expect(v.noche).toEqual({ identificar: 6, reconocer: 13, observar: 26, detectar: 30 });
  });

  it('el zoom no se puede usar en una fija', () => {
    expect(vision(DOMO_OPT, 8).angulo).toBe(103);
  });

  it('PTZ en tele: exactamente lo que publica la ficha', () => {
    const v = vision(PTZ_OPT, 32);
    expect(v.angulo).toBe(2);
    expect(v.dia.detectar).toBe(2400);
    expect(v.dia.identificar).toBe(240);
  });

  it('PTZ en gran angular: el cono se abre y llega menos lejos', () => {
    const v = vision(PTZ_OPT, 1);
    expect(v.angulo).toBe(60.2);
    expect(v.dia.detectar).toBeGreaterThan(60);
    expect(v.dia.detectar).toBeLessThan(85);
    expect(v.dia.identificar).toBeLessThan(v.dia.reconocer);
  });

  it('el zoom intermedio está entre los dos extremos y nunca se pasa del tele', () => {
    expect(anguloConZoom(PTZ_OPT, 8)).toBeGreaterThan(2);
    expect(anguloConZoom(PTZ_OPT, 8)).toBeLessThan(60.2);
    expect(anguloConZoom(PTZ_OPT, 500)).toBe(2);
    expect(zoomMaximo(PTZ_OPT)).toBe(32);
  });

  it('sin infrarrojo declarado no se pinta la noche (no se supone)', () => {
    expect(vision({ ...DOMO_OPT, irM: null }).noche).toBeNull();
  });
});

describe('lo que no puede ser se rechaza al guardar', () => {
  it('las fichas reales pasan', () => {
    expect(problemasDeOptica(DOMO_OPT)).toEqual([]);
    expect(problemasDeOptica(PTZ_OPT)).toEqual([]);
  });

  it('distancias desordenadas', () => {
    expect(problemasDeOptica({ ...DOMO_OPT, reconocerM: 5 }).join(' ')).toMatch(/menor a mayor/);
  });

  it('un cero de más (670 en vez de 67)', () => {
    expect(problemasDeOptica({ ...DOMO_OPT, detectarM: 670 }).join(' ')).toMatch(/10 veces|rondaría/);
  });

  it('tele más abierto que el gran angular', () => {
    expect(problemasDeOptica({ ...PTZ_OPT, anguloHTele: 70 }).join(' ')).toMatch(/MENOR/);
  });

  it('hay que decir a qué ángulo da la ficha las distancias', () => {
    expect(problemasDeOptica({ ...DOMO_OPT, doriAnguloRef: 50 }).join(' ')).toMatch(/gran angular o en tele/);
  });
});
