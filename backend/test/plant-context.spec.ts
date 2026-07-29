import {
  resolverContextoDePlanta,
  criticidadMayor,
  intervaloParaAmbiente,
  INTERVALO_POR_AMBIENTE,
  INTERVALO_POR_DEFECTO,
} from '../src/common/plant-context';

/**
 * Camino crítico: contexto de planta DERIVADO del árbol de ubicaciones.
 *
 * Es la regla que elimina la doble jerarquía (árbol vs. Asset.train) y la que
 * sustituye el "zona crítica sí/no" marcado a criterio por una derivación
 * fundada en la etapa del proceso de laminación y su ambiente.
 */
describe('plant-context — contexto de planta derivado (Laminación)', () => {
  // --- Árbol de prueba: Planta > Tren 2 > etapas > gabinete ----------------
  const ETAPAS = [
    {
      id: 'st-desbaste', code: 'DESBASTE', name: 'Tren de desbaste (8 cajas)',
      sequence: 3, environment: 'VAPOR_AGUA', baseCriticality: 'CRITICA',
      defaultIntervalDays: 30,
    },
    {
      id: 'st-horno', code: 'HORNO_RECALENTADOR', name: 'Horno recalentador',
      sequence: 2, environment: 'CALOR_RADIANTE', baseCriticality: 'ALTA',
      defaultIntervalDays: 30,
    },
    {
      id: 'st-almacen', code: 'ALMACEN_PT', name: 'Almacén PT',
      sequence: 9, environment: 'INTEMPERIE_SALINA', baseCriticality: 'BAJA',
      defaultIntervalDays: 45,
    },
    {
      id: 'st-pulpito', code: 'PULPITO', name: 'Púlpito de control',
      sequence: 10, environment: 'CLIMATIZADO', baseCriticality: 'ALTA',
      defaultIntervalDays: 90,
    },
  ];

  const UBICACIONES = [
    { id: 'planta', code: 'AASA-PISCO', name: 'Planta Pisco', type: 'PLANTA', parentId: null, stageId: null, environment: null },
    { id: 'tren2', code: 'AASA-PISCO-T2', name: 'Tren 2 (Laminación)', type: 'TREN', parentId: 'planta', stageId: null, environment: null },
    { id: 'e-desbaste', code: 'AASA-PISCO-T2-DESBASTE', name: 'Tren de desbaste', type: 'ETAPA', parentId: 'tren2', stageId: 'st-desbaste', environment: null },
    { id: 'e-horno', code: 'AASA-PISCO-T2-HORNO', name: 'Horno', type: 'ETAPA', parentId: 'tren2', stageId: 'st-horno', environment: null },
    { id: 'e-almacen', code: 'AASA-PISCO-T2-ALMACEN', name: 'Almacén', type: 'ETAPA', parentId: 'tren2', stageId: 'st-almacen', environment: null },
    { id: 'e-pulpito', code: 'AASA-PISCO-T2-PULPITO', name: 'Púlpito', type: 'ETAPA', parentId: 'tren2', stageId: 'st-pulpito', environment: null },
    // Gabinete DENTRO de la etapa de desbaste: debe heredar todo de la etapa.
    { id: 'gab-01', code: 'GAB-T2-01', name: 'Gabinete 01', type: 'RACK', parentId: 'e-desbaste', stageId: null, environment: null },
    // Punto con ambiente propio: cofre refrigerado en plena zona de calor.
    { id: 'cofre', code: 'COFRE-T2-01', name: 'Cofre refrigerado', type: 'ZONA', parentId: 'e-horno', stageId: null, environment: 'CLIMATIZADO' },
  ];

  function prismaMock(ubicaciones = UBICACIONES, etapas = ETAPAS) {
    return {
      location: { findMany: jest.fn().mockResolvedValue(ubicaciones) },
      processStage: { findMany: jest.fn().mockResolvedValue(etapas) },
    } as any;
  }

  // -------------------------------------------------------------------------
  it('deriva el tren y la etapa subiendo el árbol de ubicaciones', async () => {
    const prisma = prismaMock();
    const r = await resolverContextoDePlanta(prisma, [
      { id: 'a1', criticality: 'MEDIA', locationId: 'e-desbaste' },
    ]);
    expect(r.a1.trenCode).toBe('AASA-PISCO-T2');
    expect(r.a1.etapaCode).toBe('DESBASTE');
    expect(r.a1.etapaSecuencia).toBe(3);
    expect(r.a1.requiereAsignarEtapa).toBe(false);
  });

  it('un activo dentro de un gabinete hereda la etapa del nivel superior', async () => {
    const prisma = prismaMock();
    const r = await resolverContextoDePlanta(prisma, [
      { id: 'a1', criticality: 'MEDIA', locationId: 'gab-01' },
    ]);
    expect(r.a1.etapaCode).toBe('DESBASTE');
    expect(r.a1.trenCode).toBe('AASA-PISCO-T2');
  });

  // --- Criticidad ----------------------------------------------------------
  it('la etapa IMPONE una criticidad mínima: MEDIA en desbaste sube a CRITICA', async () => {
    const prisma = prismaMock();
    const r = await resolverContextoDePlanta(prisma, [
      { id: 'a1', criticality: 'MEDIA', locationId: 'e-desbaste' },
    ]);
    // Una cámara caída en el desbaste deja al operador ciego ante un atasco
    // a 1100 °C: no puede quedar clasificada como MEDIA.
    expect(r.a1.criticidad).toBe('CRITICA');
  });

  it('una criticidad manual MAYOR que la de la etapa se respeta', async () => {
    const prisma = prismaMock();
    const r = await resolverContextoDePlanta(prisma, [
      { id: 'a1', criticality: 'CRITICA', locationId: 'e-almacen' },
    ]);
    // La etapa impone BAJA como mínimo, pero se puede elevar a mano.
    expect(r.a1.criticidad).toBe('CRITICA');
  });

  it('nunca baja por debajo de la criticidad de la etapa', async () => {
    const prisma = prismaMock();
    const r = await resolverContextoDePlanta(prisma, [
      { id: 'a1', criticality: 'BAJA', locationId: 'e-horno' },
    ]);
    expect(r.a1.criticidad).toBe('ALTA');
  });

  // --- Ambiente e intervalo ------------------------------------------------
  it('el intervalo preventivo se deriva del ambiente de la etapa', async () => {
    const prisma = prismaMock();
    const r = await resolverContextoDePlanta(prisma, [
      { id: 'horno', criticality: 'MEDIA', locationId: 'e-horno' },
      { id: 'pulpito', criticality: 'MEDIA', locationId: 'e-pulpito' },
      { id: 'almacen', criticality: 'MEDIA', locationId: 'e-almacen' },
    ]);
    expect(r.horno.ambiente).toBe('CALOR_RADIANTE');
    expect(r.horno.intervaloDias).toBe(30);   // calor radiante degrada sellos y óptica
    expect(r.pulpito.intervaloDias).toBe(90); // climatizado: polvo normal
    expect(r.almacen.intervaloDias).toBe(45); // salinidad de la costa de Pisco
  });

  it('el ambiente declarado en la ubicación gana sobre el de la etapa', async () => {
    const prisma = prismaMock();
    const r = await resolverContextoDePlanta(prisma, [
      { id: 'a1', criticality: 'MEDIA', locationId: 'cofre' },
    ]);
    // Está bajo el horno (CALOR_RADIANTE) pero dentro de un cofre refrigerado.
    expect(r.a1.ambiente).toBe('CLIMATIZADO');
    expect(r.a1.intervaloDias).toBe(90);
    // Aun así, la criticidad de la etapa sigue aplicando: sigue siendo el horno.
    expect(r.a1.criticidad).toBe('ALTA');
  });

  // --- Activos sin etapa ---------------------------------------------------
  it('un activo colgado del tren sin etapa queda marcado para asignar', async () => {
    const prisma = prismaMock();
    const r = await resolverContextoDePlanta(prisma, [
      { id: 'a1', criticality: 'ALTA', locationId: 'tren2' },
    ]);
    expect(r.a1.trenCode).toBe('AASA-PISCO-T2');
    expect(r.a1.etapaCode).toBeNull();
    expect(r.a1.requiereAsignarEtapa).toBe(true);
    expect(r.a1.intervaloDias).toBe(INTERVALO_POR_DEFECTO);
    // No se inventa criticidad: se respeta la del activo.
    expect(r.a1.criticidad).toBe('ALTA');
  });

  it('un activo sin ubicación no rompe el cálculo', async () => {
    const prisma = prismaMock();
    const r = await resolverContextoDePlanta(prisma, [
      { id: 'a1', criticality: 'MEDIA', locationId: null },
    ]);
    expect(r.a1.trenCode).toBeNull();
    expect(r.a1.requiereAsignarEtapa).toBe(true);
  });

  // --- Robustez y rendimiento ---------------------------------------------
  it('un ciclo en el árbol no cuelga el proceso', async () => {
    // Dato corrupto: dos ubicaciones que se apuntan mutuamente.
    const corrupto = [
      { id: 'x', code: 'X', name: 'X', type: 'ZONA', parentId: 'y', stageId: null, environment: null },
      { id: 'y', code: 'Y', name: 'Y', type: 'ZONA', parentId: 'x', stageId: null, environment: null },
    ];
    const prisma = prismaMock(corrupto as any);
    const r = await resolverContextoDePlanta(prisma, [
      { id: 'a1', criticality: 'MEDIA', locationId: 'x' },
    ]);
    expect(r.a1).toBeDefined();
    expect(r.a1.trenCode).toBeNull();
  });

  it('resuelve N activos con sólo 2 consultas (sin N+1)', async () => {
    const prisma = prismaMock();
    const muchos = Array.from({ length: 400 }, (_, i) => ({
      id: `a${i}`, criticality: 'MEDIA', locationId: 'e-desbaste',
    }));
    await resolverContextoDePlanta(prisma, muchos);
    expect(prisma.location.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.processStage.findMany).toHaveBeenCalledTimes(1);
  });

  it('no consulta nada si no hay activos', async () => {
    const prisma = prismaMock();
    const r = await resolverContextoDePlanta(prisma, []);
    expect(r).toEqual({});
    expect(prisma.location.findMany).not.toHaveBeenCalled();
  });

  // --- Funciones auxiliares -----------------------------------------------
  it('criticidadMayor devuelve siempre la más severa', () => {
    expect(criticidadMayor('BAJA', 'CRITICA')).toBe('CRITICA');
    expect(criticidadMayor('ALTA', 'MEDIA')).toBe('ALTA');
    expect(criticidadMayor('MEDIA', 'MEDIA')).toBe('MEDIA');
  });

  it('la tabla de intervalos cubre los seis ambientes de laminación', () => {
    expect(Object.keys(INTERVALO_POR_AMBIENTE)).toHaveLength(6);
    expect(intervaloParaAmbiente('VAPOR_AGUA')).toBe(30);
    expect(intervaloParaAmbiente('EMI_ALTA')).toBe(60);
    expect(intervaloParaAmbiente(null)).toBe(INTERVALO_POR_DEFECTO);
  });
});
