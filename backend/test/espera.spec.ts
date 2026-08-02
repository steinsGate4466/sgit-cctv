import {
  evaluarEspera, plazoDe, ordenarPorUrgencia, PLAZO_POR_DEFECTO, EsperaEvaluada,
} from '../src/modules/maintenance/espera';

const AHORA = new Date('2026-08-02T12:00:00Z').getTime();
const haceDias = (d: number) => new Date(AHORA - d * 86400000);

describe('plazoDe', () => {
  it('reconoce el motivo aunque el código no sea exacto', () => {
    // Los códigos los escribe el ingeniero desde la pantalla. Exigir una
    // cadena exacta obligaría a adivinar cómo los va a nombrar.
    expect(plazoDe('FALTA_REPUESTO')).toBe(21);
    expect(plazoDe('ESPERA_REPUESTO')).toBe(21);
    expect(plazoDe('SIN_REPUESTO_ALMACEN')).toBe(21);
  });

  it('el permiso tiene el plazo más corto', () => {
    // Depende de una firma: si tarda una semana, lo atascado es el circuito
    // de aprobación, no la orden.
    expect(plazoDe('ESPERA_PERMISO')).toBe(7);
    expect(plazoDe('ESPERA_PERMISO')).toBeLessThan(plazoDe('ESPERA_PARADA'));
  });

  it('sin motivo declarado, plazo por defecto', () => {
    expect(plazoDe(null)).toBe(PLAZO_POR_DEFECTO);
    expect(plazoDe('ALGO_QUE_NO_ESTA_EN_LA_TABLA')).toBe(PLAZO_POR_DEFECTO);
  });
});

describe('evaluarEspera', () => {
  const om = (p: any = {}) => ({ id: '1', code: 'OM-1', desde: haceDias(5), ...p });

  it('dentro de plazo no se marca como excedida', () => {
    const e = evaluarEspera(om({ desde: haceDias(5), motivo: 'FALTA_REPUESTO' }), AHORA);
    expect(e.excedida).toBe(false);
    expect(e.dias).toBe(5);
  });

  it('pasado el plazo, lo dice Y dice cuál era el normal', () => {
    const e = evaluarEspera(om({ desde: haceDias(30), motivo: 'FALTA_REPUESTO' }), AHORA);
    expect(e.excedida).toBe(true);
    expect(e.texto).toMatch(/30 día/);
    expect(e.texto).toMatch(/serían 21/);
  });

  it('el texto dice CUÁNTO lleva y QUÉ espera', () => {
    // "En espera" a secas no mueve a nadie; "23 días esperando un repuesto" sí.
    const e = evaluarEspera(om({ desde: haceDias(23), motivo: 'FALTA_REPUESTO' }), AHORA);
    expect(e.texto).toMatch(/23 día/);
    expect(e.texto).toMatch(/repuesto/);
  });

  it('una parada de línea aguanta un mes sin ser problema', () => {
    // Llega cuando llega: avisar a los diez días sería ruido.
    expect(evaluarEspera(om({ desde: haceDias(25), motivo: 'ESPERA_PARADA' }), AHORA).excedida).toBe(false);
    expect(evaluarEspera(om({ desde: haceDias(31), motivo: 'ESPERA_PARADA' }), AHORA).excedida).toBe(true);
  });

  it('puesta en espera hoy no dice "0 días"', () => {
    const e = evaluarEspera(om({ desde: new Date(AHORA) }), AHORA);
    expect(e.texto).toMatch(/hoy/);
    expect(e.texto).not.toMatch(/0 día/);
  });

  it('sin fecha de inicio no revienta', () => {
    // Pasa con órdenes anteriores a que se registrara el momento de la espera.
    const e = evaluarEspera(om({ desde: null }), AHORA);
    expect(e.dias).toBe(0);
    expect(e.excedida).toBe(false);
  });

  it('una fecha inválida tampoco revienta', () => {
    expect(evaluarEspera(om({ desde: 'no soy una fecha' }), AHORA).dias).toBe(0);
  });

  it('el texto del motivo escrito a mano gana al código', () => {
    // Si el técnico escribió "esperando la grúa de mantenimiento mecánico",
    // eso dice más que traducir su código a "un repuesto".
    const e = evaluarEspera(
      om({ desde: haceDias(3), motivo: 'OTRO', motivoTexto: 'la grúa de mecánica' }), AHORA,
    );
    expect(e.texto).toMatch(/grúa de mecánica/);
  });
});

describe('ordenarPorUrgencia', () => {
  it('primero lo excedido, y dentro de eso lo más antiguo', () => {
    // Ordenar por fecha de creación pondría arriba las recién paradas, que
    // son justo las que NO hay que tocar.
    const lista = [
      { code: 'A', dias: 2, excedida: false },
      { code: 'B', dias: 40, excedida: true },
      { code: 'C', dias: 12, excedida: true },
      { code: 'D', dias: 9, excedida: false },
    ] as EsperaEvaluada[];
    expect(ordenarPorUrgencia(lista).map((x) => x.code)).toEqual(['B', 'C', 'D', 'A']);
  });

  it('no modifica la lista original', () => {
    const l = [{ code: 'A', dias: 1, excedida: false }, { code: 'B', dias: 9, excedida: true }] as EsperaEvaluada[];
    ordenarPorUrgencia(l);
    expect(l[0].code).toBe('A');
  });
});
