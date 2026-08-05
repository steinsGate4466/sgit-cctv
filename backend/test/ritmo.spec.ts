import {
  RITMO_GENERAL, RITMO_PESADO, claveRitmo, estadoRitmoInicial, evaluarRitmo,
} from '../src/common/ritmo';

/**
 * El tope general existe para frenar bucles, NO para estorbar a quien
 * trabaja. Estas pruebas fijan las dos cosas.
 */
describe('ritmo general', () => {
  it('deja trabajar a ritmo humano sin rechistar', () => {
    let e = estadoRitmoInicial();
    const t0 = 1_000_000;
    // 120 peticiones en un minuto: una pantalla pesada abierta 20 veces.
    for (let i = 0; i < 120; i++) {
      const v = evaluarRitmo(e, RITMO_GENERAL, t0 + i * 500);
      expect(v.permitido).toBe(true);
      e = v.estado;
    }
  });

  it('corta el bucle al llegar al tope', () => {
    let e = estadoRitmoInicial();
    const t0 = 1_000_000;
    for (let i = 0; i < RITMO_GENERAL.maximo; i++) {
      e = evaluarRitmo(e, RITMO_GENERAL, t0 + i).estado;
    }
    const v = evaluarRitmo(e, RITMO_GENERAL, t0 + RITMO_GENERAL.maximo);
    expect(v.permitido).toBe(false);
    expect(v.esperaSeg).toBeGreaterThan(0);
  });

  it('la ventana desliza: pasado el minuto se puede seguir', () => {
    let e = estadoRitmoInicial();
    const t0 = 1_000_000;
    for (let i = 0; i < RITMO_GENERAL.maximo; i++) {
      e = evaluarRitmo(e, RITMO_GENERAL, t0 + i).estado;
    }
    // Un minuto y pico después, los golpes viejos ya no cuentan.
    const v = evaluarRitmo(e, RITMO_GENERAL, t0 + 61_000);
    expect(v.permitido).toBe(true);
  });

  it('no hay castigo añadido: en cuanto hay hueco, se trabaja', () => {
    // Es a propósito. Un castigo largo en el tope general sería el estorbo
    // que este freno quiere evitar.
    let e = estadoRitmoInicial();
    const t0 = 1_000_000;
    for (let i = 0; i < RITMO_GENERAL.maximo; i++) {
      e = evaluarRitmo(e, RITMO_GENERAL, t0 + i).estado;
    }
    const bloqueado = evaluarRitmo(e, RITMO_GENERAL, t0 + 100);
    expect(bloqueado.permitido).toBe(false);
    // El primer golpe cae a los 60 s de su marca: la espera es ~60 s, no más.
    expect(bloqueado.esperaSeg).toBeLessThanOrEqual(61);
  });

  it('lo pesado se corta a las 5 por minuto', () => {
    let e = estadoRitmoInicial();
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) {
      const v = evaluarRitmo(e, RITMO_PESADO, t0 + i * 100);
      expect(v.permitido).toBe(true);
      e = v.estado;
    }
    expect(evaluarRitmo(e, RITMO_PESADO, t0 + 600).permitido).toBe(false);
  });

  it('cada quien tiene su propio contador', () => {
    // Dos claves distintas no se estorban. Es lo que evita que un usuario
    // agote el cupo de todos los demás.
    expect(claveRitmo('u1', 'general')).not.toBe(claveRitmo('u2', 'general'));
    expect(claveRitmo('u1', 'general')).not.toBe(claveRitmo('u1', '/exportacion/todo'));
  });

  it('informa de cuántas quedan', () => {
    const v = evaluarRitmo(estadoRitmoInicial(), RITMO_PESADO, 1_000_000);
    expect(v.restantes).toBe(4);
  });
});
