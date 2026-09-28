import {
  evaluarEventoDeParada, evaluarPedidoDeProrroga, evaluarResolucion, PRORROGA_MAX_DIAS,
} from '../src/modules/maintenance/parada-prorroga';

/**
 * BLOQUES 138 y 135 · la parada dentro de la OM y la prórroga con visto bueno.
 * Reglas puras: sin base de datos.
 */
const ahora = new Date('2026-09-28T10:00:00Z');
const h = (iso: string) => new Date(iso);
const abierta = (over: any = {}) => ({ status: 'EN_PROCESO', scheduledDate: h('2026-09-27T08:00:00Z'), ...over });

describe('Parada real (138)', () => {
  it('declara el inicio con la hora que dijo la radio', () => {
    const r = evaluarEventoDeParada(abierta(), 'INICIO', h('2026-09-28T08:12:00Z'), ahora);
    expect(r).toEqual({ campo: 'paradaInicioReal', valor: h('2026-09-28T08:12:00Z') });
  });

  it('no deja declarar el fin sin inicio', () => {
    const r = evaluarEventoDeParada(abierta(), 'FIN', ahora, ahora);
    expect(r).toEqual({ error: expect.stringMatching(/Primero/) });
  });

  it('el fin no puede ser antes del inicio', () => {
    const r = evaluarEventoDeParada(abierta({ paradaInicioReal: h('2026-09-28T09:00:00Z') }), 'FIN', h('2026-09-28T08:00:00Z'), ahora);
    expect('error' in r).toBe(true);
  });

  it('no acepta horas en el futuro (más allá del margen del reloj)', () => {
    const r = evaluarEventoDeParada(abierta(), 'INICIO', h('2026-09-28T11:00:00Z'), ahora);
    expect(r).toEqual({ error: expect.stringMatching(/futuro/) });
    const margen = evaluarEventoDeParada(abierta(), 'INICIO', h('2026-09-28T10:03:00Z'), ahora);
    expect('campo' in margen).toBe(true);
  });

  it('una orden cerrada no cambia su parada', () => {
    const r = evaluarEventoDeParada(abierta({ status: 'CERRADA' }), 'INICIO', ahora, ahora);
    expect('error' in r).toBe(true);
  });
});

describe('Prórroga (135)', () => {
  const manana = h('2026-09-29T08:00:00Z');

  it('se pide con motivo y fecha futura posterior a la actual', () => {
    expect(evaluarPedidoDeProrroga(abierta(), manana, 'Falta el manlift', false, ahora)).toEqual({ ok: true });
  });

  it('sin motivo no se pide', () => {
    expect('error' in evaluarPedidoDeProrroga(abierta(), manana, '  ', false, ahora)).toBe(true);
  });

  it('sólo una pendiente a la vez', () => {
    expect(evaluarPedidoDeProrroga(abierta(), manana, 'Falta el manlift', true, ahora))
      .toEqual({ error: expect.stringMatching(/Ya hay/) });
  });

  it('no se puede pedir una fecha anterior a la que ya tiene', () => {
    const wo = abierta({ scheduledDate: h('2026-10-05T08:00:00Z') });
    expect('error' in evaluarPedidoDeProrroga(wo, manana, 'Falta el manlift', false, ahora)).toBe(true);
  });

  it(`más de ${PRORROGA_MAX_DIAS} días no es prórroga`, () => {
    const lejos = new Date(ahora.getTime() + (PRORROGA_MAX_DIAS + 1) * 86400000);
    expect('error' in evaluarPedidoDeProrroga(abierta(), lejos, 'Falta el manlift', false, ahora)).toBe(true);
  });

  it('DOS LLAVES: quien la pidió no la aprueba, aunque tenga el permiso', () => {
    const p = { estado: 'PENDIENTE', pedidaPorId: 'jefe' };
    expect(evaluarResolucion(p, 'jefe', true, undefined)).toEqual({ error: expect.stringMatching(/propia/) });
    expect(evaluarResolucion(p, 'supervisor', true, undefined)).toEqual({ ok: true });
  });

  it('rechazar exige decir por qué', () => {
    const p = { estado: 'PENDIENTE', pedidaPorId: 'tec' };
    expect('error' in evaluarResolucion(p, 'sup', false, '')).toBe(true);
    expect(evaluarResolucion(p, 'sup', false, 'Hay parada el lunes')).toEqual({ ok: true });
  });

  it('una prórroga ya resuelta no se vuelve a resolver', () => {
    expect('error' in evaluarResolucion({ estado: 'APROBADA', pedidaPorId: 'tec' }, 'sup', true, undefined)).toBe(true);
  });
});
