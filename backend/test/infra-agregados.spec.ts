import {
  contarPorTren, contarCables, contarCanales, pct, LIMITE_TRAMO_M,
  ActivoAgregable, TramoAgregable, GrabadorAgregable,
} from '../src/modules/dashboard/infra-agregados';

const activo = (p: Partial<ActivoAgregable> = {}): ActivoAgregable => ({
  id: Math.random().toString(36).slice(2),
  type: 'CAMERA',
  estado: 'OPERATIVO',
  criticidad: 'MEDIA',
  trenCode: 'T1',
  fichaIncompleta: false,
  sinFoto: false,
  sinEtapa: false,
  ...p,
});

describe('pct', () => {
  it('sin datos devuelve 100: no hay nada malo que reportar', () => {
    expect(pct(0, 0)).toBe(100);
  });
  it('redondea a un decimal', () => {
    expect(pct(2, 3)).toBe(66.7);
  });
});

describe('contarPorTren', () => {
  it('agrupa por el tren DERIVADO y no mezcla trenes', () => {
    const r = contarPorTren([
      activo({ trenCode: 'T1' }),
      activo({ trenCode: 'T1' }),
      activo({ trenCode: 'T2' }),
    ]);
    expect(r.get('T1')!.total).toBe(2);
    expect(r.get('T2')!.total).toBe(1);
  });

  it('los activos sin tren van a la clave null, NO a un cuarto tren', () => {
    const r = contarPorTren([activo({ trenCode: null }), activo({ trenCode: 'T1' })]);
    expect(r.get(null)!.total).toBe(1);
    // Solo dos claves: T1 y null. Nada llamado SIN_ASIGNAR que parezca un tren.
    // No se usa .sort() para comparar: sort() convierte null a la cadena "null"
    // y lo ordena DESPUÉS de 'T1'. Ese detalle ya me hizo fallar esta prueba una
    // vez; se comprueba por pertenencia, que es lo que de verdad importa.
    expect(r.size).toBe(2);
    expect(r.has(null)).toBe(true);
    expect(r.has('T1')).toBe(true);
  });

  it('BAJA y STOCK no entran en la disponibilidad', () => {
    const r = contarPorTren([
      activo({ estado: 'OPERATIVO' }),
      activo({ estado: 'BAJA' }),
      activo({ estado: 'STOCK' }),
    ]);
    const g = r.get('T1')!;
    expect(g.total).toBe(3);          // existen en el inventario
    expect(g.enOperacion).toBe(1);    // pero solo uno está en planta
    expect(g.disponibilidad).toBe(100);
  });

  it('una cámara CON_INCIDENCIA baja la disponibilidad de cámaras', () => {
    const r = contarPorTren([
      activo({ estado: 'OPERATIVO' }),
      activo({ estado: 'CON_INCIDENCIA' }),
    ]);
    const g = r.get('T1')!;
    expect(g.camaras).toBe(2);
    expect(g.camarasCaidas).toBe(1);
    expect(g.disponibilidadCamaras).toBe(50);
  });

  it('MANTENIMIENTO no cuenta como caída: está intervenida, no perdida', () => {
    const r = contarPorTren([
      activo({ estado: 'OPERATIVO' }),
      activo({ estado: 'MANTENIMIENTO' }),
    ]);
    const g = r.get('T1')!;
    expect(g.enMantenimiento).toBe(1);
    expect(g.camarasCaidas).toBe(0);
    expect(g.disponibilidad).toBe(100);
  });

  it('el avance del mapeo de un tren sin empezar es 0, no 100', () => {
    const r = contarPorTren([
      activo({ fichaIncompleta: true }),
      activo({ fichaIncompleta: true }),
    ]);
    expect(r.get('T1')!.avanceMapeoPct).toBe(0);
  });

  it('el mapeo cuenta también el material en STOCK: sin ficha es sin mapear', () => {
    const r = contarPorTren([
      activo({ estado: 'STOCK', fichaIncompleta: true }),
      activo({ estado: 'OPERATIVO', fichaIncompleta: false }),
    ]);
    const g = r.get('T1')!;
    expect(g.total).toBe(2);
    expect(g.fichasIncompletas).toBe(1);
    expect(g.avanceMapeoPct).toBe(50);
  });

  it('cuenta sin foto y sin etapa por separado', () => {
    const r = contarPorTren([
      activo({ sinFoto: true }),
      activo({ sinEtapa: true }),
      activo({ sinFoto: true, sinEtapa: true }),
    ]);
    const g = r.get('T1')!;
    expect(g.sinFoto).toBe(2);
    expect(g.sinEtapa).toBe(2);
  });

  it('lista vacía no revienta', () => {
    expect(contarPorTren([]).size).toBe(0);
  });
});

const tramo = (p: Partial<TramoAgregable> = {}): TramoAgregable => ({
  id: Math.random().toString(36).slice(2),
  metros: 30,
  estimado: true,
  blindado: false,
  estado: 'INSTALADO',
  trenCode: 'T1',
  ...p,
});

describe('contarCables', () => {
  it('un tramo RETIRADO ya no es planta y no se cuenta', () => {
    const c = contarCables([tramo(), tramo({ estado: 'RETIRADO', metros: 500 })]);
    expect(c.tramos).toBe(1);
    expect(c.metros).toBe(30);
  });

  it(`marca fuera de norma por encima de ${LIMITE_TRAMO_M} m`, () => {
    const c = contarCables([tramo({ metros: 91 }), tramo({ metros: 90 })]);
    expect(c.fueraNorma).toBe(1); // 90 exactos está EN norma
  });

  it('separa el fuera de norma MEDIDO del estimado a ojo', () => {
    const c = contarCables([
      tramo({ metros: 120, estimado: true }),
      tramo({ metros: 120, estimado: false }),
    ]);
    expect(c.fueraNorma).toBe(2);
    // Solo sobre el medido se puede justificar un recableado.
    expect(c.fueraNormaMedidos).toBe(1);
  });

  it('un tramo sin metros cuenta como sin medir y no suma metraje', () => {
    const c = contarCables([tramo({ metros: null })]);
    expect(c.sinMedir).toBe(1);
    expect(c.metros).toBe(0);
    expect(c.fueraNorma).toBe(0); // sin dato no se puede afirmar que esté fuera
  });

  it('separa metros medidos de estimados', () => {
    const c = contarCables([
      tramo({ metros: 10.5, estimado: false }),
      tramo({ metros: 20.25, estimado: true }),
    ]);
    expect(c.metrosMedidos).toBe(10.5);
    expect(c.metrosEstimados).toBe(20.3);
    expect(c.metros).toBe(30.8);
  });

  it('cuenta sin blindaje y dañados', () => {
    const c = contarCables([
      tramo({ blindado: true }),
      tramo({ blindado: false, estado: 'DANADO' }),
      tramo({ estado: 'A_REEMPLAZAR' }),
    ]);
    expect(c.sinBlindaje).toBe(2);
    expect(c.danados).toBe(2);
  });
});

const grabador = (p: Partial<GrabadorAgregable> = {}): GrabadorAgregable => ({
  id: Math.random().toString(36).slice(2),
  assetCode: 'NVR-1',
  canales: 16,
  camarasAsignadas: 4,
  trenCode: 'T1',
  ...p,
});

describe('contarCanales', () => {
  it('calcula canales libres', () => {
    const c = contarCanales([grabador({ canales: 16, camarasAsignadas: 4 })]);
    expect(c.canalesTotales).toBe(16);
    expect(c.canalesOcupados).toBe(4);
    expect(c.canalesLibres).toBe(12);
  });

  it('un grabador sin capacidad declarada no inventa canales libres', () => {
    const c = contarCanales([grabador({ canales: null, camarasAsignadas: 3 })]);
    expect(c.sinCapacidadDeclarada).toBe(1);
    expect(c.canalesTotales).toBe(0);
    expect(c.canalesLibres).toBe(0);
    // Las cámaras asignadas sí se cuentan: existen, aunque falte el dato del NVR.
    expect(c.canalesOcupados).toBe(3);
  });

  it('más cámaras que canales se reporta como error de dato, no como negativo', () => {
    const c = contarCanales([grabador({ canales: 4, camarasAsignadas: 6 })]);
    expect(c.sobreasignados).toBe(1);
    expect(c.canalesLibres).toBe(0); // nunca negativo
  });

  it('suma varios grabadores', () => {
    const c = contarCanales([
      grabador({ canales: 16, camarasAsignadas: 16 }),
      grabador({ canales: 32, camarasAsignadas: 10 }),
    ]);
    expect(c.grabadores).toBe(2);
    expect(c.canalesLibres).toBe(22);
  });

  it('sin grabadores devuelve ceros', () => {
    const c = contarCanales([]);
    expect(c.grabadores).toBe(0);
    expect(c.canalesLibres).toBe(0);
  });
});
