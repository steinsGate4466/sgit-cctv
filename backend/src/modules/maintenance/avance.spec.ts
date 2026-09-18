import {
  estadoDeAvance, horasSinNoticias, FRASE_DE_AVANCE, UMBRAL_POR_ACABAR,
} from './avance';

/**
 * Bloque 113. Lo que se prueba aquí no es «que devuelva algo»: es el ORDEN de
 * las comprobaciones, que es donde está toda la decisión.
 */
describe('estadoDeAvance', () => {
  it('sin nada tocado es SIN_EMPEZAR — que es la respuesta que pidió Producción', () => {
    expect(estadoDeAvance({ status: 'ABIERTA', progressPct: 0 })).toBe('SIN_EMPEZAR');
  });

  it('detallada pero sin arrancar es PREPARADA, no SIN_EMPEZAR', () => {
    expect(estadoDeAvance({
      status: 'ABIERTA', progressPct: 0, detailedAt: new Date(),
    })).toBe('PREPARADA');
  });

  it('arrancada en campo con 0 % es EN_CURSO: el técnico está allí', () => {
    expect(estadoDeAvance({
      status: 'EN_PROCESO', progressPct: 0, startedAt: new Date(),
    })).toBe('EN_CURSO');
  });

  it('un avance declarado sin arranque también cuenta como EN_CURSO', () => {
    expect(estadoDeAvance({
      status: 'ABIERTA', progressPct: 0, ultimoAvanceEn: new Date(),
    })).toBe('EN_CURSO');
  });

  it(`del ${UMBRAL_POR_ACABAR} % para arriba es POR_ACABAR`, () => {
    expect(estadoDeAvance({ status: 'EN_PROCESO', progressPct: UMBRAL_POR_ACABAR }))
      .toBe('POR_ACABAR');
    expect(estadoDeAvance({ status: 'EN_PROCESO', progressPct: UMBRAL_POR_ACABAR - 1 }))
      .toBe('EN_CURSO');
  });

  /* EL CASO QUE JUSTIFICA EL ORDEN. Si `EN_ESPERA` se mirara DESPUÉS del
     porcentaje, esta orden saldría «por acabar» y nadie iría a desbloquearla:
     está al 90 % y lleva tres días parada por falta de repuesto. */
  it('EN_ESPERA manda sobre el porcentaje, aunque esté al 90 %', () => {
    expect(estadoDeAvance({ status: 'EN_ESPERA', progressPct: 90 })).toBe('DETENIDA');
  });

  it('EN_ESPERA manda también con 0 %', () => {
    expect(estadoDeAvance({ status: 'EN_ESPERA', progressPct: 0 })).toBe('DETENIDA');
  });

  it('un progressPct nulo se trata como 0 y no revienta', () => {
    expect(estadoDeAvance({ status: 'ABIERTA', progressPct: null })).toBe('SIN_EMPEZAR');
    expect(estadoDeAvance({ status: 'ABIERTA' })).toBe('SIN_EMPEZAR');
  });

  it('todos los estados tienen su frase escrita', () => {
    for (const e of ['SIN_EMPEZAR', 'PREPARADA', 'EN_CURSO', 'POR_ACABAR', 'DETENIDA'] as const) {
      expect(FRASE_DE_AVANCE[e]).toBeTruthy();
    }
  });
});

describe('horasSinNoticias', () => {
  const ahora = new Date('2026-09-17T12:00:00Z');

  it('mide desde el último avance cuando lo hay', () => {
    expect(horasSinNoticias(
      { status: 'EN_PROCESO', ultimoAvanceEn: '2026-09-17T09:00:00Z', startedAt: '2026-09-17T06:00:00Z' },
      '2026-09-16T00:00:00Z', ahora,
    )).toBe(3);
  });

  it('sin avances cae en el arranque, y sin arranque en el detalle', () => {
    expect(horasSinNoticias(
      { status: 'EN_PROCESO', startedAt: '2026-09-17T06:00:00Z' },
      '2026-09-16T00:00:00Z', ahora,
    )).toBe(6);
    expect(horasSinNoticias(
      { status: 'ABIERTA', detailedAt: '2026-09-17T10:00:00Z' },
      '2026-09-16T00:00:00Z', ahora,
    )).toBe(2);
  });

  it('sin nada, se mide desde que se creó la orden', () => {
    expect(horasSinNoticias({ status: 'ABIERTA' }, '2026-09-17T02:00:00Z', ahora)).toBe(10);
  });

  /* Un reloj adelantado en el móvil del técnico no puede producir «-3 horas
     sin noticias» en la pantalla del púlpito. */
  it('una fecha en el futuro da 0, nunca un negativo', () => {
    expect(horasSinNoticias(
      { status: 'EN_PROCESO', ultimoAvanceEn: '2026-09-17T20:00:00Z' },
      '2026-09-16T00:00:00Z', ahora,
    )).toBe(0);
  });
});
