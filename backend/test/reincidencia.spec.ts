jest.mock('@prisma/client', () => ({ PrismaClient: class {}, Prisma: {} }));

import {
  evaluarReincidencia, severidadGlobal, VENTANA_DIAS, UMBRAL_ORDENES,
} from '../src/common/reincidencia';

/**
 * Camino crítico: la detección de reincidencia.
 *
 * Es la respuesta a la queja concreta del Jefe de Mantenimiento —"se soluciona
 * y vuelve a fallar y no sabemos por qué"—, así que tiene que acertar. Una
 * regla que marca de más es tan inútil como una que no marca nada: en los dos
 * casos la gente deja de mirarla.
 */
describe('reincidencia — detección de patrones', () => {
  const hoy = Date.now();
  const dias = (n: number) => new Date(hoy - n * 24 * 60 * 60 * 1000);

  const om = (over: any = {}) => ({
    type: 'CORRECTIVO', status: 'CERRADA', endedAt: dias(10), ...over,
  });

  // ------------------------------------------------------------ sin patrón
  it('no inventa señales cuando no hay historial', () => {
    expect(evaluarReincidencia({ ordenes: [] })).toEqual([]);
  });

  it('una sola orden no es reincidencia', () => {
    expect(evaluarReincidencia({ ordenes: [om()] })).toEqual([]);
  });

  it('varias órdenes ANTIGUAS no cuentan como patrón', () => {
    // Tres fallas hace un año no dicen nada sobre el estado de hoy.
    const viejas = [om({ endedAt: dias(400) }), om({ endedAt: dias(380) }), om({ endedAt: dias(360) })];
    expect(evaluarReincidencia({ ordenes: viejas })).toEqual([]);
  });

  it('el preventivo NO cuenta como falla', () => {
    // Tres preventivos son buena señal, no un problema. Contarlos como fallas
    // marcaría precisamente los equipos mejor atendidos.
    const prev = [om({ type: 'PREVENTIVO' }), om({ type: 'PREVENTIVO' }), om({ type: 'PREVENTIVO' })];
    expect(evaluarReincidencia({ ordenes: prev })).toEqual([]);
  });

  // ------------------------------------------------- órdenes que se repiten
  it('marca CONFIRMADA con 3 correctivas en la ventana', () => {
    const s = evaluarReincidencia({ ordenes: [om(), om({ endedAt: dias(30) }), om({ endedAt: dias(60) })] });
    const r = s.find((x) => x.codigo === 'ORDENES_REPETIDAS');
    expect(r?.severidad).toBe('CONFIRMADA');
    expect(r?.sugerencia).toMatch(/no se ha resuelto/i);
  });

  it('con 2 correctivas queda en SOSPECHA, no en confirmada', () => {
    const s = evaluarReincidencia({ ordenes: [om(), om({ endedAt: dias(40) })] });
    expect(s.find((x) => x.codigo === 'ORDENES_REPETIDAS')?.severidad).toBe('SOSPECHA');
  });

  // -------------------------------------------- sin falla encontrada
  it('dos cierres SIN FALLA ENCONTRADA es la señal más fuerte', () => {
    // El técnico fue, revisó, no halló nada, y volvió a fallar. No es un
    // fracaso del técnico: es la huella de una falla intermitente.
    const s = evaluarReincidencia({
      ordenes: [
        om({ rootCause: 'SIN_FALLA_ENCONTRADA' }),
        om({ rootCause: 'SIN_FALLA_ENCONTRADA', endedAt: dias(45) }),
      ],
    });
    const r = s.find((x) => x.codigo === 'SIN_FALLA_REPETIDA');
    expect(r?.severidad).toBe('CONFIRMADA');
    expect(r?.sugerencia).toMatch(/intermitente/i);
    expect(r?.sugerencia).toMatch(/tramo|blindaje|PoE/i);
  });

  it('un solo "sin falla" aislado no confirma nada', () => {
    const s = evaluarReincidencia({ ordenes: [om({ rootCause: 'SIN_FALLA_ENCONTRADA' })] });
    expect(s.find((x) => x.codigo === 'SIN_FALLA_REPETIDA')).toBeUndefined();
  });

  it('un "sin falla" MÁS otras órdenes ya levanta sospecha', () => {
    const s = evaluarReincidencia({
      ordenes: [om({ rootCause: 'SIN_FALLA_ENCONTRADA' }), om({ endedAt: dias(20) })],
    });
    expect(s.find((x) => x.codigo === 'SIN_FALLA_REPETIDA')?.severidad).toBe('SOSPECHA');
  });

  // ---------------------------------------------- marcado por el técnico
  it('respeta lo que marcó el técnico dos veces', () => {
    const s = evaluarReincidencia({
      ordenes: [om({ isRecurrent: true }), om({ isRecurrent: true, endedAt: dias(50) })],
    });
    expect(s.find((x) => x.codigo === 'MARCADA_POR_TECNICO')?.severidad).toBe('CONFIRMADA');
  });

  // ------------------------------------------------------ tramo de cable
  it('un tramo sobre 90 m con historial es causa confirmada', () => {
    const s = evaluarReincidencia({
      ordenes: [om()],
      tramos: [{ meters: 118, metersEstimated: false }],
    });
    const r = s.find((x) => x.codigo === 'TRAMO_FUERA_NORMA');
    expect(r?.severidad).toBe('CONFIRMADA');
    expect(r?.sugerencia).toMatch(/repetidor|fibra/i);
  });

  it('un tramo largo SIN historial es solo sospecha', () => {
    // Todavía no ha dado problemas: se avisa, pero no se afirma que sea la causa.
    const s = evaluarReincidencia({ ordenes: [], tramos: [{ meters: 118 }] });
    expect(s.find((x) => x.codigo === 'TRAMO_FUERA_NORMA')?.severidad).toBe('SOSPECHA');
  });

  it('aclara cuando la medida del tramo es estimada', () => {
    const s = evaluarReincidencia({ ordenes: [om()], tramos: [{ meters: 118, metersEstimated: true }] });
    expect(s.find((x) => x.codigo === 'TRAMO_FUERA_NORMA')?.mensaje).toMatch(/estimada/i);
  });

  it('un tramo dentro de norma no genera señal', () => {
    const s = evaluarReincidencia({ ordenes: [om()], tramos: [{ meters: 45 }] });
    expect(s.find((x) => x.codigo === 'TRAMO_FUERA_NORMA')).toBeUndefined();
  });

  it('avisa por cable sin blindaje en bandeja CON historial', () => {
    const s = evaluarReincidencia({
      ordenes: [om()],
      tramos: [{ meters: 40, route: 'BANDEJA', shielded: false }],
    });
    expect(s.find((x) => x.codigo === 'RUIDO_BANDEJA')?.severidad).toBe('SOSPECHA');
  });

  it('no avisa de la bandeja si el cable está blindado', () => {
    const s = evaluarReincidencia({
      ordenes: [om()],
      tramos: [{ meters: 40, route: 'BANDEJA', shielded: true }],
    });
    expect(s.find((x) => x.codigo === 'RUIDO_BANDEJA')).toBeUndefined();
  });

  // ------------------------------------------ infraestructura compartida
  it('señala cuando los vecinos también fallan', () => {
    // Es la pieza que responde al Jefe: si 4 de 6 cámaras de la misma antena
    // fallaron, el problema no está en la cámara que se está mirando.
    const s = evaluarReincidencia({
      ordenes: [om()],
      compartida: { vecinos: 6, vecinosConFalla: 4, via: 'la misma antena' },
    });
    const r = s.find((x) => x.codigo === 'FALLA_COMPARTIDA');
    expect(r?.severidad).toBe('CONFIRMADA');
    expect(r?.mensaje).toMatch(/4 de 6/);
    expect(r?.sugerencia).toMatch(/aguas arriba/i);
  });

  it('un solo vecino con falla no basta para señalar', () => {
    const s = evaluarReincidencia({
      ordenes: [om()],
      compartida: { vecinos: 6, vecinosConFalla: 1, via: 'la misma antena' },
    });
    expect(s.find((x) => x.codigo === 'FALLA_COMPARTIDA')).toBeUndefined();
  });

  it('sin vecinos no hay señal compartida', () => {
    const s = evaluarReincidencia({
      ordenes: [om()],
      compartida: { vecinos: 0, vecinosConFalla: 0, via: null },
    });
    expect(s.find((x) => x.codigo === 'FALLA_COMPARTIDA')).toBeUndefined();
  });

  // ----------------------------------------------------- severidad global
  describe('severidad global', () => {
    it('devuelve NINGUNA sin señales', () => {
      expect(severidadGlobal([])).toBe('NINGUNA');
    });
    it('una confirmada manda sobre las sospechas', () => {
      expect(severidadGlobal([
        { codigo: 'a', mensaje: '', severidad: 'SOSPECHA' },
        { codigo: 'b', mensaje: '', severidad: 'CONFIRMADA' },
      ])).toBe('CONFIRMADA');
    });
    it('solo sospechas devuelve SOSPECHA', () => {
      expect(severidadGlobal([{ codigo: 'a', mensaje: '', severidad: 'SOSPECHA' }])).toBe('SOSPECHA');
    });
  });

  it('las constantes son las acordadas', () => {
    expect(VENTANA_DIAS).toBe(90);
    expect(UMBRAL_ORDENES).toBe(3);
  });

  // ------------------------------------------------------- caso completo
  it('el caso real: cámara con tramo largo, sin falla hallada y vecinos caídos', () => {
    const s = evaluarReincidencia({
      ordenes: [
        om({ rootCause: 'SIN_FALLA_ENCONTRADA' }),
        om({ rootCause: 'SIN_FALLA_ENCONTRADA', endedAt: dias(35) }),
        om({ rootCause: 'FUENTE_POE', endedAt: dias(70) }),
      ],
      tramos: [{ meters: 118, metersEstimated: true, route: 'BANDEJA', shielded: false }],
      compartida: { vecinos: 6, vecinosConFalla: 4, via: 'la misma antena' },
    });
    // Debe juntar todas las señales, no quedarse con la primera.
    const codigos = s.map((x) => x.codigo);
    expect(codigos).toContain('ORDENES_REPETIDAS');
    expect(codigos).toContain('SIN_FALLA_REPETIDA');
    expect(codigos).toContain('TRAMO_FUERA_NORMA');
    expect(codigos).toContain('RUIDO_BANDEJA');
    expect(codigos).toContain('FALLA_COMPARTIDA');
    expect(severidadGlobal(s)).toBe('CONFIRMADA');
  });
});
