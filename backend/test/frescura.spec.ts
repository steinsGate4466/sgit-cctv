import {
  evaluar, siguienteEstado, textoTiempo, VIGENCIA_MIN, FALLOS_PARA_CAIDO,
} from '../src/modules/monitoreo/frescura';

const AHORA = new Date('2026-08-02T12:00:00Z').getTime();
const haceMin = (m: number) => new Date(AHORA - m * 60000);

describe('evaluar — un dato viejo es PEOR que no tener dato', () => {
  it('sin observación: lo dice, y dice por qué', () => {
    const v = evaluar(null, AHORA);
    expect(v.estado).toBe('SIN_DATO');
    // No basta con "sin datos": quien lo lee piensa que el sistema se rompió.
    expect(v.texto).toMatch(/automáticamente/);
  });

  it('observación reciente y responde', () => {
    const v = evaluar({ result: 'RESPONDE', checkedAt: haceMin(2), latencyMs: 12 }, AHORA);
    expect(v.estado).toBe('RESPONDE');
    expect(v.texto).toMatch(/12 ms/);
  });

  it('OBSERVACIÓN CADUCADA: deja de decir "responde"', () => {
    // Éste es el fallo que evita la caducidad. Si el agente lleva dos horas
    // caído y la pantalla sigue diciendo "responde", el sistema miente con
    // cara de estar informado. Y a un dato con aspecto de verdad se le hace
    // caso.
    const v = evaluar({ result: 'RESPONDE', checkedAt: haceMin(120), lastSeenAt: haceMin(120) }, AHORA);
    expect(v.estado).toBe('SIN_DATO');
    expect(v.caducada).toBe(true);
    expect(v.texto).toMatch(/agente no está reportando/);
  });

  it('justo en el límite de vigencia todavía vale', () => {
    expect(evaluar({ result: 'RESPONDE', checkedAt: haceMin(VIGENCIA_MIN) }, AHORA).estado).toBe('RESPONDE');
    expect(evaluar({ result: 'RESPONDE', checkedAt: haceMin(VIGENCIA_MIN + 1) }, AHORA).estado).toBe('SIN_DATO');
  });
});

describe('evaluar — no se da nada por caído al primer fallo', () => {
  it('un fallo suelto es INESTABLE, no caído', () => {
    // En una wifi industrial, con hornos y motores, una pérdida suelta es lo
    // normal. Llamarla avería es cómo se pierde la confianza en las alertas.
    const v = evaluar({ result: 'NO_RESPONDE', checkedAt: haceMin(1), consecutiveFails: 1 }, AHORA);
    expect(v.estado).toBe('INESTABLE');
    expect(v.texto).toMatch(/pérdida puntual/);
  });

  it(`a partir de ${FALLOS_PARA_CAIDO} fallos seguidos sí se afirma que está caído`, () => {
    const v = evaluar(
      { result: 'NO_RESPONDE', checkedAt: haceMin(1), consecutiveFails: FALLOS_PARA_CAIDO, lastSeenAt: haceMin(40) },
      AHORA,
    );
    expect(v.estado).toBe('CAIDO');
    // El dato que de verdad sirve: cuánto lleva.
    expect(v.texto).toMatch(/40 minuto/);
  });

  it('latencia alta se marca como inestable, que suele anticipar la caída', () => {
    const v = evaluar({ result: 'DEGRADADO', checkedAt: haceMin(1), latencyMs: 800 }, AHORA);
    expect(v.estado).toBe('INESTABLE');
    expect(v.texto).toMatch(/800 ms/);
  });
});

describe('siguienteEstado', () => {
  it('al fallar NO se pisa la última vez que se vio', () => {
    // Es el dato con el que se dice "lleva 40 minutos caída". Si se
    // machacara en cada fallo, siempre diría "caída desde hace 1 minuto".
    const visto = haceMin(40);
    const s = siguienteEstado(
      { result: 'RESPONDE', checkedAt: haceMin(1), lastSeenAt: visto, consecutiveFails: 0 },
      { responde: false },
      new Date(AHORA),
    );
    expect(s.lastSeenAt!.getTime()).toBe(visto.getTime());
    expect(s.consecutiveFails).toBe(1);
  });

  it('los fallos se acumulan', () => {
    let s: any = { result: 'RESPONDE', checkedAt: haceMin(5), lastSeenAt: haceMin(5), consecutiveFails: 0 };
    for (let i = 1; i <= 4; i++) {
      s = siguienteEstado(s, { responde: false }, new Date(AHORA));
      expect(s.consecutiveFails).toBe(i);
    }
  });

  it('una respuesta buena pone el contador a cero', () => {
    const s = siguienteEstado(
      { result: 'NO_RESPONDE', checkedAt: haceMin(1), consecutiveFails: 7 },
      { responde: true, latencyMs: 20 },
      new Date(AHORA),
    );
    expect(s.consecutiveFails).toBe(0);
    expect(s.result).toBe('RESPONDE');
    expect(s.lastSeenAt!.getTime()).toBe(AHORA);
  });

  it('latencia alta se guarda como DEGRADADO, no como caída', () => {
    const s = siguienteEstado(null, { responde: true, latencyMs: 900 }, new Date(AHORA));
    expect(s.result).toBe('DEGRADADO');
    // Responde: la última vez que se vio ES ahora, aunque vaya lento.
    expect(s.lastSeenAt!.getTime()).toBe(AHORA);
  });

  it('sin observación previa no revienta', () => {
    expect(siguienteEstado(null, { responde: false }, new Date(AHORA)).consecutiveFails).toBe(1);
  });
});

describe('textoTiempo', () => {
  it('escala a horas y días: 4.320 minutos no se entiende', () => {
    expect(textoTiempo(0)).toMatch(/menos de un minuto/);
    expect(textoTiempo(45)).toMatch(/45 minuto/);
    expect(textoTiempo(90)).toMatch(/1 hora/);
    expect(textoTiempo(4320)).toMatch(/3 día/);
    expect(textoTiempo(null)).toBe('un tiempo');
  });
});
