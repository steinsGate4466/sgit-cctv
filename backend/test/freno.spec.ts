import { evaluar, estadoInicial, barrer, clave, CUPO_PIN, EstadoFreno } from '../src/common/freno';

const CUPO = { maximo: 3, ventanaMs: 1000, castigoMs: 5000 };

describe('freno de peticiones', () => {
  it('deja pasar hasta el máximo', () => {
    let e = estadoInicial();
    for (let i = 0; i < 3; i++) {
      const v = evaluar(e, CUPO, 1000);
      expect(v.permitido).toBe(true);
      e = v.estado;
    }
  });

  it('bloquea al pasarse', () => {
    let e = estadoInicial();
    for (let i = 0; i < 3; i++) e = evaluar(e, CUPO, 1000).estado;
    const v = evaluar(e, CUPO, 1000);
    expect(v.permitido).toBe(false);
    expect(v.esperaSeg).toBe(5);
  });

  it('al bloquear VACÍA los golpes: tras el castigo se empieza limpio', () => {
    // Si no se vaciaran, saldría del bloqueo y al primer intento volvería a
    // caer. Eso no frena a un atacante; sólo castiga al que se equivocó.
    let e = estadoInicial();
    for (let i = 0; i < 4; i++) e = evaluar(e, CUPO, 1000).estado;
    expect(e.golpes).toHaveLength(0);
    const despues = evaluar(e, CUPO, 1000 + 5001);
    expect(despues.permitido).toBe(true);
  });

  it('los golpes viejos no cuentan', () => {
    let e = estadoInicial();
    for (let i = 0; i < 3; i++) e = evaluar(e, CUPO, 1000).estado;
    // Pasada la ventana, el contador arranca de cero.
    const v = evaluar(e, CUPO, 1000 + 1001);
    expect(v.permitido).toBe(true);
    expect(v.estado.golpes).toHaveLength(1);
  });

  it('sigue bloqueado durante todo el castigo', () => {
    let e = estadoInicial();
    for (let i = 0; i < 4; i++) e = evaluar(e, CUPO, 1000).estado;
    expect(evaluar(e, CUPO, 1000 + 4999).permitido).toBe(false);
    expect(evaluar(e, CUPO, 1000 + 5001).permitido).toBe(true);
  });

  it('el cupo del PIN convierte la fuerza bruta en horas', () => {
    // 4 cifras = 10.000 combinaciones. A 10 por minuto son más de 16 horas,
    // y el primer bloqueo salta a los 11 intentos.
    const porHora = (CUPO_PIN.maximo * 60_000) / CUPO_PIN.ventanaMs;
    expect((10_000 / porHora) / 60).toBeGreaterThan(16);
  });

  it('la clave separa rutas: gastar el PIN no deja sin login', () => {
    expect(clave('/users/pin/verify', '10.0.0.1')).not.toBe(clave('/auth/login', '10.0.0.1'));
  });

  it('sin origen conocido, sigue habiendo clave', () => {
    // Detrás de un proxy mal configurado la IP puede llegar vacía. Que no
    // llegue no puede significar "sin límite": significaría que basta con
    // quitar la cabecera para saltarse el freno.
    expect(clave('/x', undefined)).toBe('/x|desconocido');
    expect(clave('/x', null)).toBe('/x|desconocido');
  });
});

describe('barrer', () => {
  it('tira lo caducado y conserva lo vivo', () => {
    const m = new Map<string, EstadoFreno>([
      ['viejo', { golpes: [0], bloqueadoHasta: 0 }],
      ['vivo', { golpes: [9500], bloqueadoHasta: 0 }],
      ['castigado', { golpes: [], bloqueadoHasta: 20000 }],
    ]);
    expect(barrer(m, CUPO, 10000)).toBe(1);
    expect([...m.keys()].sort()).toEqual(['castigado', 'vivo']);
  });
});
