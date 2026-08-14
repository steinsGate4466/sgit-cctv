/* =============================================================================
   CRITICIDAD PRODUCTIVA DE ZONA — bloque 26
   -----------------------------------------------------------------------------
   Esta regla decide el ORDEN en que se atienden las cámaras de la planta.
   Si se equivoca, una cámara que vigila la salida del horno espera detrás de
   una del estacionamiento y nadie se entera hasta que hace falta la grabación.

   Por eso se prueba caso por caso con un árbol escrito a mano, sin base de
   datos: cada `it` es una frase que un jefe de área podría decir en voz alta.
============================================================================= */
import {
  calcularContexto,
  criticidadMayor,
  UbicacionDelArbol,
  EtapaDelCatalogo,
} from '../src/common/plant-context';

const AHORA = new Date('2026-08-13T12:00:00Z').getTime();

/** Árbol mínimo: Planta > Tren 2 > Etapa Laminación > Zona del foso. */
function arbol(extras: Partial<Record<string, Partial<UbicacionDelArbol>>> = {}) {
  const base: UbicacionDelArbol[] = [
    { id: 'planta', code: 'AASA-PISCO', name: 'Planta Pisco', type: 'PLANTA', parentId: null },
    { id: 't2', code: 'AASA-PISCO-T2', name: 'Tren 2', type: 'TREN', parentId: 'planta' },
    { id: 'etapa', code: 'ET-LAM', name: 'Laminación', type: 'ETAPA', parentId: 't2', stageId: 'st1' },
    { id: 'foso', code: 'Z-FOSO', name: 'Foso del lecho', type: 'ZONA', parentId: 'etapa' },
  ];
  const m = new Map<string, UbicacionDelArbol>();
  for (const u of base) m.set(u.id, { ...u, ...(extras[u.id] || {}) });
  return m;
}

const etapas = new Map<string, EtapaDelCatalogo>([
  ['st1', { id: 'st1', code: 'LAM', name: 'Laminación', sequence: 3, environment: 'CALOR_RADIANTE', baseCriticality: 'MEDIA' }],
]);

const camara = { id: 'cam1', criticality: 'BAJA', locationId: 'foso' };

describe('la zona que declara Producción', () => {
  it('sin declaración, todo sigue exactamente como antes', () => {
    const c = calcularContexto(camara, arbol(), etapas, AHORA);
    expect(c.criticidadProduccion).toBeNull();
    expect(c.zonaVital).toBe(false);
    // La etapa impone MEDIA sobre la BAJA del activo: comportamiento previo.
    expect(c.criticidad).toBe('MEDIA');
  });

  it('sube la criticidad de la cámara aunque el activo esté en BAJA', () => {
    const c = calcularContexto(
      camara,
      arbol({ foso: { criticidadProduccion: 'CRITICA', porQueEsVital: 'Sin vista aquí se para la línea.' } }),
      etapas, AHORA,
    );
    expect(c.criticidad).toBe('CRITICA');
    expect(c.zonaVital).toBe(true);
    expect(c.zonaCriticaNombre).toBe('Foso del lecho');
  });

  it('NUNCA la baja: una zona MEDIA no rebaja una cámara que Mantenimiento puso en ALTA', () => {
    const c = calcularContexto(
      { ...camara, criticality: 'ALTA' },
      arbol({ foso: { criticidadProduccion: 'MEDIA' } }),
      etapas, AHORA,
    );
    expect(c.criticidad).toBe('ALTA');
    // La declaración se conserva aunque no mande: hay que poder verla.
    expect(c.criticidadProduccion).toBe('MEDIA');
    expect(c.zonaVital).toBe(false);
  });

  it('lo específico manda sobre lo general: el foso gana al tren entero', () => {
    const c = calcularContexto(
      camara,
      arbol({
        t2:   { criticidadProduccion: 'ALTA', porQueEsVital: 'Tren completo' },
        foso: { criticidadProduccion: 'CRITICA', porQueEsVital: 'Se para la línea' },
      }),
      etapas, AHORA,
    );
    expect(c.criticidadProduccion).toBe('CRITICA');
    expect(c.zonaCriticaNombre).toBe('Foso del lecho');
    expect(c.porQueEsVital).toBe('Se para la línea');
  });

  it('si la zona no declara, hereda la del tren', () => {
    const c = calcularContexto(
      camara,
      arbol({ t2: { criticidadProduccion: 'ALTA', porQueEsVital: 'Todo el Tren 2 es prioritario' } }),
      etapas, AHORA,
    );
    expect(c.criticidadProduccion).toBe('ALTA');
    expect(c.zonaCriticaNombre).toBe('Tren 2');
  });

  it('la etapa NO pisa lo que declaró Producción', () => {
    // La etapa impone MEDIA. Si el código comparara contra la criticidad del
    // activo en vez de contra lo acumulado, este caso volvería a MEDIA y la
    // declaración de Producción se perdería en silencio.
    const c = calcularContexto(
      camara,
      arbol({ foso: { criticidadProduccion: 'ALTA', porQueEsVital: 'x' } }),
      etapas, AHORA,
    );
    expect(c.criticidad).toBe('ALTA');
  });

  it('marca la declaración vencida sin dejar de aplicarla', () => {
    const c = calcularContexto(
      camara,
      arbol({ foso: {
        criticidadProduccion: 'CRITICA', porQueEsVital: 'x',
        revisarAntesDe: new Date('2026-01-01T00:00:00Z'),
      } }),
      etapas, AHORA,
    );
    // Vencida se avisa, pero seguir ignorándola sería temerario.
    expect(c.declaracionVencida).toBe(true);
    expect(c.criticidad).toBe('CRITICA');
  });

  it('una declaración con fecha futura no está vencida', () => {
    const c = calcularContexto(
      camara,
      arbol({ foso: {
        criticidadProduccion: 'CRITICA', porQueEsVital: 'x',
        revisarAntesDe: new Date('2027-01-01T00:00:00Z'),
      } }),
      etapas, AHORA,
    );
    expect(c.declaracionVencida).toBe(false);
  });
});

describe('qué se vigila desde la zona', () => {
  it('lo toma de la ubicación más cercana que lo tenga escrito', () => {
    const c = calcularContexto(
      camara,
      arbol({
        t2:   { queSeVigila: 'El tren entero' },
        foso: { queSeVigila: 'Salida del horno y entrada al desbaste' },
      }),
      etapas, AHORA,
    );
    expect(c.queSeVigila).toBe('Salida del horno y entrada al desbaste');
  });

  it('puede venir de una zona distinta a la que aporta la criticidad', () => {
    const c = calcularContexto(
      camara,
      arbol({
        t2:   { queSeVigila: 'Línea completa del Tren 2' },
        foso: { criticidadProduccion: 'ALTA', porQueEsVital: 'x' },
      }),
      etapas, AHORA,
    );
    expect(c.zonaCriticaNombre).toBe('Foso del lecho');
    expect(c.queSeVigila).toBe('Línea completa del Tren 2');
  });
});

describe('casos de borde que no pueden colgar el sistema', () => {
  it('un activo sin ubicación no revienta', () => {
    const c = calcularContexto({ id: 'x', criticality: 'MEDIA', locationId: null }, arbol(), etapas, AHORA);
    expect(c.criticidad).toBe('MEDIA');
    expect(c.trenCode).toBeNull();
    expect(c.requiereAsignarEtapa).toBe(true);
  });

  it('un ciclo en el árbol se corta en 20 saltos en vez de colgar el proceso', () => {
    const m = new Map<string, UbicacionDelArbol>([
      ['a', { id: 'a', code: 'A', name: 'A', type: 'ZONA', parentId: 'b' }],
      ['b', { id: 'b', code: 'B', name: 'B', type: 'ZONA', parentId: 'a' }],
    ]);
    const c = calcularContexto({ id: 'y', criticality: 'BAJA', locationId: 'a' }, m, etapas, AHORA);
    expect(c.criticidad).toBe('BAJA');
  });

  it('criticidadMayor ordena bien las cuatro', () => {
    expect(criticidadMayor('BAJA', 'CRITICA')).toBe('CRITICA');
    expect(criticidadMayor('ALTA', 'MEDIA')).toBe('ALTA');
    expect(criticidadMayor('ALTA', 'ALTA')).toBe('ALTA');
  });
});
