/* =============================================================================
   RIESGO DE QUEDARSE SIN RECAMBIO — bloque 32
   -----------------------------------------------------------------------------
   Este análisis se hace SIN precios, que es lo que lo vuelve posible hoy. Lo
   que se juega es que el jefe sepa dónde está expuesto ANTES de que falle,
   no el día que falla.
============================================================================= */
import {
  riesgoDeRepuesto, riesgoDeEquipo, ordenarPorRiesgo, anosDesde, titularDeRiesgo,
} from '../src/common/obsolescencia';

const AHORA = new Date('2026-08-13T12:00:00Z').getTime();
const hace = (anos: number) => new Date(AHORA - anos * 365.25 * 86_400_000);

const rep = (o: any = {}) => ({
  id: 'r', codigo: 'REP-001', nombre: 'Fuente PoE', stock: 5, minimo: 2,
  equiposQueLoUsan: 3, equiposEnZonaVital: 0, zonasVitales: [], ...o,
});

describe('repuesto crítico', () => {
  it('cero unidades sosteniendo zona vital es CRÍTICO', () => {
    const r = riesgoDeRepuesto(rep({ stock: 0, equiposEnZonaVital: 2, zonasVitales: ['Salida del horno'] }));
    expect(r.nivel).toBe('CRITICO');
    expect(r.porQue).toContain('Salida del horno');
  });

  it('no alcanza para los equipos vitales que sostiene: ALTO', () => {
    // 1 unidad para 3 cámaras vitales. Si fallan dos a la vez —y fallan, porque
    // la causa suele ser común— no hay con qué.
    const r = riesgoDeRepuesto(rep({ stock: 1, equiposEnZonaVital: 3, zonasVitales: ['Colada'] }));
    expect(r.nivel).toBe('ALTO');
    expect(r.porQue).toContain('dos a la vez');
  });

  it('cero unidades pero sin zona vital es MEDIO, no crítico', () => {
    // La diferencia que hace útil la pantalla: no todo lo que está a cero urge.
    expect(riesgoDeRepuesto(rep({ stock: 0, equiposEnZonaVital: 0 })).nivel).toBe('MEDIO');
  });

  it('stock suficiente para lo vital que sostiene es BAJO', () => {
    expect(riesgoDeRepuesto(rep({ stock: 5, equiposEnZonaVital: 2 })).nivel).toBe('BAJO');
  });

  it('un repuesto que NADIE usa sale SIN_DATOS, no «bajo»', () => {
    // Marcarlo verde escondería que el problema es de datos, no de almacén.
    const r = riesgoDeRepuesto(rep({ equiposQueLoUsan: 0, stock: 9 }));
    expect(r.nivel).toBe('SIN_DATOS');
    expect(r.porQue).toContain('Falta enlazarlo');
  });

  it('bajo mínimo sin zona vital es MEDIO', () => {
    expect(riesgoDeRepuesto(rep({ stock: 1, minimo: 4 })).nivel).toBe('MEDIO');
  });

  it('ordena por lo que duele, y desempata por equipos vitales', () => {
    const lista = [
      riesgoDeRepuesto(rep({ codigo: 'B', stock: 5 })),
      riesgoDeRepuesto(rep({ codigo: 'A', stock: 0, equiposEnZonaVital: 1, zonasVitales: ['X'] })),
      riesgoDeRepuesto(rep({ codigo: 'C', stock: 0, equiposEnZonaVital: 4, zonasVitales: ['Y'] })),
    ];
    expect(ordenarPorRiesgo(lista).map((x) => x.codigo)).toEqual(['C', 'A', 'B']);
  });
});

describe('obsolescencia del equipo', () => {
  const eq = (o: any = {}) => ({ id: 'a', assetCode: 'AA-CAM-T2-LECHO-001', ...o });

  it('sin recambio y en zona vital es CRÍTICO, tenga la edad que tenga', () => {
    const r = riesgoDeEquipo(eq({ sinRecambio: true, zonaVital: true, zonaNombre: 'Foso', desde: hace(1) }), AHORA);
    expect(r.nivel).toBe('CRITICO');
    expect(r.porQue).toContain('Foso');
  });

  it('sin recambio fuera de zona vital es ALTO', () => {
    expect(riesgoDeEquipo(eq({ sinRecambio: true, desde: hace(2) }), AHORA).nivel).toBe('ALTO');
  });

  it('soporte del fabricante vencido en zona vital es ALTO', () => {
    const r = riesgoDeEquipo(eq({ finDeSoporte: new Date('2025-01-01'), zonaVital: true, desde: hace(3) }), AHORA);
    expect(r.nivel).toBe('ALTO');
    expect(r.porQue).toContain('firmware');
  });

  it('viejo pero con soporte y sin zona vital es BAJO', () => {
    expect(riesgoDeEquipo(eq({ desde: hace(10) }), AHORA).nivel).toBe('BAJO');
  });

  it('el umbral de «viejo» lo pone la planta, no el código', () => {
    // Una cámara en el horno envejece distinto que una en el púlpito.
    expect(riesgoDeEquipo(eq({ desde: hace(6), zonaVital: true }), AHORA, 8).nivel).toBe('BAJO');
    expect(riesgoDeEquipo(eq({ desde: hace(6), zonaVital: true }), AHORA, 5).nivel).toBe('MEDIO');
  });

  it('sin fecha de instalación sale SIN_DATOS, nunca «bajo riesgo»', () => {
    // Un inventario donde la mitad sale en verde por estar vacío es peor que
    // uno que admite lo que no sabe.
    const r = riesgoDeEquipo(eq({}), AHORA);
    expect(r.nivel).toBe('SIN_DATOS');
    expect(r.anosInstalado).toBeNull();
  });

  it('una fecha futura es un dato malo: no se inventa una edad', () => {
    const r = riesgoDeEquipo(eq({ desde: new Date('2030-01-01') }), AHORA);
    expect(r.anosInstalado).toBeNull();
    expect(r.nivel).toBe('SIN_DATOS');
  });

  it('anosDesde cuenta años cumplidos', () => {
    expect(anosDesde(hace(3.9), AHORA)).toBe(3);
    expect(anosDesde(null, AHORA)).toBeNull();
  });
});

describe('el titular', () => {
  it('lo primero que dice es lo que no se arregla hoy', () => {
    expect(titularDeRiesgo(2, 5, 3, 40)).toContain('no se arreglan hoy');
  });
  it('sin críticos menciona los altos y tranquiliza con matiz', () => {
    expect(titularDeRiesgo(0, 3, 0, 40)).toContain('Ninguno deja una zona vital');
  });
  it('sin riesgos pero con huecos, lo dice', () => {
    expect(titularDeRiesgo(0, 0, 7, 40)).toContain('faltan datos');
  });
  it('sin nada cargado no finge un resultado', () => {
    expect(titularDeRiesgo(0, 0, 0, 0)).toContain('Todavía no hay nada');
  });
});
