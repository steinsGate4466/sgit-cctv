import {
  aNumero, dentroDe, segmentoDe, fronteraDe, revisarSegmentos, resumirSegmentos,
  SubredRegistrada, EquipoParaRevision,
} from './segmentos';

/** El plan de direcciones real de la planta, tal como lo describió el usuario. */
const SUBREDES: SubredRegistrada[] = [
  { cidr: '192.168.1.0/24', nombre: 'LAN de cámaras', proposito: 'CCTV' },
  { cidr: '10.1.0.0/16', nombre: 'Red CCTV troncal', proposito: 'CCTV' },
  { cidr: '172.20.0.0/16', nombre: 'Gestión', proposito: 'GESTION' },
];

const eq = (id: string, tipo: string, o: Partial<EquipoParaRevision> = {}): EquipoParaRevision =>
  ({ id, codigo: id, tipo, ...o });

describe('lectura de direcciones', () => {
  it('acepta una IPv4 válida', () => {
    expect(aNumero('192.168.1.10')).toBe(3232235786);
  });

  it('rechaza lo que un split ingenuo aceptaría', () => {
    /* Estas cuatro pasarían un `split('.')` y darían una comparación
       silenciosamente equivocada, que es peor que un error. */
    expect(aNumero('192.168.1.300')).toBeNull();   // octeto fuera de rango
    expect(aNumero('10.1.2')).toBeNull();          // faltan octetos
    expect(aNumero('10.1.2.3.4')).toBeNull();      // sobran
    expect(aNumero('10.1.a.3')).toBeNull();        // no es número
    expect(aNumero('')).toBeNull();
    expect(aNumero(null)).toBeNull();
  });

  it('compara contra un CIDR', () => {
    expect(dentroDe('192.168.1.55', '192.168.1.0/24')).toBe(true);
    expect(dentroDe('192.168.2.55', '192.168.1.0/24')).toBe(false);
    expect(dentroDe('10.1.9.9', '10.1.0.0/16')).toBe(true);
    expect(dentroDe('10.2.9.9', '10.1.0.0/16')).toBe(false);
  });

  it('/32 y /0 no se van de madre', () => {
    /* Con /0, `0xFFFFFFFF << 32` en JavaScript NO da 0: da el propio número,
       porque el corrimiento usa sólo los 5 bits bajos. Sin el caso especial,
       una subred /0 daría la máscara equivocada y no encajaría con nada. */
    expect(dentroDe('10.1.1.1', '0.0.0.0/0')).toBe(true);
    expect(dentroDe('10.1.1.1', '10.1.1.1/32')).toBe(true);
    expect(dentroDe('10.1.1.2', '10.1.1.1/32')).toBe(false);
  });

  it('un CIDR malformado devuelve falso, no revienta', () => {
    expect(dentroDe('10.1.1.1', 'no-es-un-cidr')).toBe(false);
    expect(dentroDe('10.1.1.1', '10.1.0.0/99')).toBe(false);
  });
});

describe('a qué segmento pertenece cada equipo', () => {
  it('192.168.1.x es la red de cámaras', () => {
    expect(segmentoDe('192.168.1.40', SUBREDES).segmento).toBe('LAN_CAMARAS');
  });

  it('10.1.x.x es la red CCTV', () => {
    expect(segmentoDe('10.1.7.3', SUBREDES).segmento).toBe('RED_CCTV');
  });

  it('una subred CCTV se distingue de otra por el rango, no por el nombre', () => {
    /* Las dos redes de vídeo tienen propósito CCTV, así que el propósito por sí
       solo no las separa. Se usa el rango porque es lo único objetivo: un
       nombre es texto que alguien escribió y cambia sin avisar. */
    const conNombresAlReves: SubredRegistrada[] = [
      { cidr: '192.168.1.0/24', nombre: 'Troncal', proposito: 'CCTV' },
      { cidr: '10.1.0.0/16', nombre: 'Cámaras', proposito: 'CCTV' },
    ];
    expect(segmentoDe('192.168.1.5', conNombresAlReves).segmento).toBe('LAN_CAMARAS');
    expect(segmentoDe('10.1.5.5', conNombresAlReves).segmento).toBe('RED_CCTV');
  });

  it('gestión no es ninguna de las dos', () => {
    expect(segmentoDe('172.20.4.9', SUBREDES).segmento).toBe('OTRA');
  });

  it('sin IP no es lo mismo que fuera de plan', () => {
    expect(segmentoDe(null, SUBREDES).segmento).toBe('SIN_IP');
    expect(segmentoDe('8.8.8.8', SUBREDES).segmento).toBe('FUERA_DE_PLAN');
  });

  it('gana la subred más específica, como una tabla de rutas', () => {
    const solapadas: SubredRegistrada[] = [
      { cidr: '10.0.0.0/8', nombre: 'Todo el 10', proposito: 'CORPORATIVA' },
      { cidr: '10.1.5.0/24', nombre: 'CCTV Tren 2', proposito: 'CCTV' },
    ];
    const r = segmentoDe('10.1.5.20', solapadas);
    expect(r.subred?.cidr).toBe('10.1.5.0/24');
    expect(r.segmento).toBe('RED_CCTV');
  });
});

describe('el grabador como frontera entre las dos redes', () => {
  it('con una pata en cada red, hace de puente', () => {
    const f = fronteraDe(
      eq('NVR-1', 'NVR', { nicPrimary: '192.168.1.2', nicSecondary: '10.1.0.9' }),
      SUBREDES);
    expect(f.completo).toBe(true);
    expect(f.ladoCamaras).toBe('192.168.1.2');
    expect(f.ladoCCTV).toBe('10.1.0.9');
    expect(f.motivo).toBeNull();
  });

  it('el orden de las dos patas da igual', () => {
    const f = fronteraDe(
      eq('NVR-1', 'NVR', { nicPrimary: '10.1.0.9', nicSecondary: '192.168.1.2' }),
      SUBREDES);
    expect(f.completo).toBe(true);
    expect(f.ladoCamaras).toBe('192.168.1.2');
  });

  it('con las dos patas en la MISMA red, no es puente', () => {
    /* Y decir que sí lo es sería la mentira peligrosa: el análisis afirmaría
       que el púlpito ve algo que no ve. */
    const f = fronteraDe(
      eq('NVR-1', 'NVR', { nicPrimary: '192.168.1.2', nicSecondary: '192.168.1.3' }),
      SUBREDES);
    expect(f.completo).toBe(false);
    expect(f.motivo).toContain('red CCTV');
  });

  it('sin ninguna dirección lo dice, no lo supone', () => {
    const f = fronteraDe(eq('NVR-1', 'NVR'), SUBREDES);
    expect(f.completo).toBe(false);
    expect(f.motivo).toContain('ninguna dirección');
  });

  it('el ipAddress viejo también cuenta como candidata', () => {
    // Equipos cargados antes de que existieran las dos patas.
    const f = fronteraDe(
      eq('NVR-1', 'NVR', { ip: '192.168.1.2', nicSecondary: '10.1.0.9' }),
      SUBREDES);
    expect(f.completo).toBe(true);
  });
});

describe('revisión: cada equipo en la red que le toca', () => {
  it('una cámara en la red CCTV es un error', () => {
    const h = revisarSegmentos([eq('CAM-9', 'CAMERA', { ip: '10.1.4.4' })], SUBREDES);
    expect(h[0].clave).toBe('CAMARA_EN_RED_CCTV');
    expect(h[0].gravedad).toBe('ERROR');
  });

  it('una cámara en la red de cámaras no genera nada', () => {
    expect(revisarSegmentos([eq('CAM-1', 'CAMERA', { ip: '192.168.1.44' })], SUBREDES))
      .toEqual([]);
  });

  it('un switch de campo en la red troncal se avisa, no se da por error', () => {
    /* Aviso y no error a propósito: puede estar justificado, y un falso error
       enseña a ignorar la pantalla. */
    const h = revisarSegmentos(
      [eq('SW-1', 'SWITCH', { ip: '10.1.2.2', marca: 'Hikvision' })], SUBREDES);
    expect(h[0].clave).toBe('SWITCH_CAMPO_EN_RED_CCTV');
    expect(h[0].gravedad).toBe('AVISO');
  });

  it('estar montado en un tablero ya lo marca como de campo', () => {
    // Aunque no se conozca la marca: el tablero es donde va el switch PoE.
    const h = revisarSegmentos(
      [eq('SW-2', 'SWITCH', { ip: '10.1.2.3', enTablero: true })], SUBREDES);
    expect(h[0].clave).toBe('SWITCH_CAMPO_EN_RED_CCTV');
  });

  it('un Fortinet en la red de cámaras se avisa', () => {
    const h = revisarSegmentos(
      [eq('SW-F', 'SWITCH', { ip: '192.168.1.250', marca: 'Fortinet' })], SUBREDES);
    expect(h[0].clave).toBe('FORTI_EN_LAN_CAMARAS');
  });

  it('una IP fuera del plan es error, y sin IP sólo aviso', () => {
    const h = revisarSegmentos([
      eq('X-1', 'SWITCH', { ip: '8.8.8.8' }),
      eq('X-2', 'SWITCH'),
    ], SUBREDES);
    expect(h.map((x) => x.clave)).toEqual(['FUERA_DE_PLAN', 'SIN_IP']);
    expect(h[0].gravedad).toBe('ERROR');
    expect(h[1].gravedad).toBe('AVISO');
  });

  it('un grabador sin sus dos patas es error', () => {
    const h = revisarSegmentos(
      [eq('NVR-1', 'NVR', { ip: '192.168.1.2' })], SUBREDES);
    expect(h.some((x) => x.clave === 'GRABADOR_SIN_PUENTE')).toBe(true);
  });

  it('un grabador bien puenteado no genera hallazgo', () => {
    const h = revisarSegmentos(
      [eq('NVR-1', 'NVR', { ip: '192.168.1.2', nicSecondary: '10.1.0.9' })], SUBREDES);
    expect(h).toEqual([]);
  });

  it('los errores salen antes que los avisos', () => {
    const h = revisarSegmentos([
      eq('A-SW', 'SWITCH', { ip: '10.1.2.2', marca: 'Hikvision' }),  // aviso
      eq('Z-CAM', 'CAMERA', { ip: '10.1.4.4' }),                      // error
    ], SUBREDES);
    expect(h[0].gravedad).toBe('ERROR');
  });

  it('sin subredes cargadas avisa UNA vez, no una por equipo', () => {
    /* Si no, el primer día la pantalla saldría con doscientos errores rojos
       falsos y nadie volvería a abrirla. */
    const muchos = Array.from({ length: 40 }, (_, i) => eq(`C${i}`, 'CAMERA', { ip: '192.168.1.' + i }));
    const h = revisarSegmentos(muchos, []);
    expect(h).toHaveLength(1);
    expect(h[0].clave).toBe('SIN_SUBREDES');
    expect(h[0].gravedad).toBe('AVISO');
  });
});

describe('el titular', () => {
  it('sin hallazgos lo dice claro', () => {
    expect(resumirSegmentos([])).toContain('red que les corresponde');
  });

  it('cuenta errores y avisos por separado', () => {
    const h = revisarSegmentos([
      eq('CAM-9', 'CAMERA', { ip: '10.1.4.4' }),
      eq('SW-1', 'SWITCH', { ip: '10.1.2.2', marca: 'Hikvision' }),
    ], SUBREDES);
    const t = resumirSegmentos(h);
    expect(t).toContain('1 equipo está');
    expect(t).toContain('1 más por revisar');
  });
});
