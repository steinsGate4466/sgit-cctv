import {
  estadoRutina, motivoBloqueo, actividadDesdeHallazgo, PuntoRutina,
} from '../src/modules/checklist/checklist.util';

/**
 * La rutina preventiva decide si una orden se puede cerrar o no. Por eso su
 * lógica está separada del servicio y probada: si falla, o deja cerrar sin
 * comprobar nada, o impide cerrar sin motivo. Las dos son graves y ninguna se
 * nota hasta que hay un técnico en el tren.
 */

const P: PuntoRutina[] = [
  { id: '1', text: 'Limpiar el lente', critical: false },
  { id: '2', text: 'Revisar el prensaestopa', critical: true },
  { id: '3', text: 'Comprobar imagen en el púlpito', critical: true },
];

describe('estadoRutina', () => {
  it('una rutina vacía no está "a medias": no hay rutina', () => {
    // Poner 0 % haría parecer que falta trabajo que nadie definió.
    const e = estadoRutina([], []);
    expect(e.porcentaje).toBe(100);
    expect(e.completa).toBe(true);
  });

  it('sin responder nada, lista exactamente lo que falta', () => {
    const e = estadoRutina(P, []);
    expect(e.completa).toBe(false);
    expect(e.faltan).toHaveLength(3);
    expect(e.porcentaje).toBe(0);
  });

  it('"No aplica" CUENTA como respondido', () => {
    // Que un punto no aplique a este equipo concreto es una respuesta
    // legítima, no una omisión.
    const e = estadoRutina(P, [
      { itemId: '1', result: 'NO_APLICA' },
      { itemId: '2', result: 'OK' },
      { itemId: '3', result: 'OK' },
    ]);
    expect(e.completa).toBe(true);
    expect(e.noAplica).toBe(1);
    expect(e.porcentaje).toBe(100);
  });

  it('un "No conforme" SIN explicar impide cerrar', () => {
    const e = estadoRutina(P, [
      { itemId: '1', result: 'OK' },
      { itemId: '2', result: 'NO_OK' },
      { itemId: '3', result: 'OK' },
    ]);
    expect(e.completa).toBe(false);
    expect(e.sinExplicar).toHaveLength(1);
  });

  it('con la explicación, sí deja cerrar', () => {
    const e = estadoRutina(P, [
      { itemId: '1', result: 'OK' },
      { itemId: '2', result: 'NO_OK', note: 'suelto, entró agua' },
      { itemId: '3', result: 'OK' },
    ]);
    expect(e.completa).toBe(true);
  });

  it('una nota en blanco no cuenta como explicación', () => {
    const e = estadoRutina(P, [{ itemId: '2', result: 'NO_OK', note: '   ' }]);
    expect(e.sinExplicar).toHaveLength(1);
  });

  it('SOLO los puntos críticos proponen correctivo', () => {
    // Si todo hallazgo generara una orden, una tarde de preventivos llenaría
    // el tablero de trabajo que nadie decidió.
    const e = estadoRutina(P, [{ itemId: '1', result: 'NO_OK', note: 'sucio' }]);
    expect(e.noOk).toBe(1);
    expect(e.paraCorrectivo).toHaveLength(0);
  });

  it('un crítico "No conforme" sí lo propone', () => {
    const e = estadoRutina(P, [{ itemId: '2', result: 'NO_OK', note: 'suelto' }]);
    expect(e.paraCorrectivo.map((p) => p.id)).toEqual(['2']);
  });

  it('respuestas de puntos que ya no existen se ignoran', () => {
    // Un punto desactivado después de responderse no debe contar como avance
    // de una rutina que ya no lo incluye.
    const e = estadoRutina(P, [{ itemId: '99', result: 'OK' }]);
    expect(e.respondidos).toBe(0);
  });
});

describe('motivoBloqueo', () => {
  it('nombra los puntos que faltan', () => {
    expect(motivoBloqueo(estadoRutina(P, []))).toMatch(/Limpiar el lente/);
  });

  it('con más de tres pendientes dice cuántos son', () => {
    const P4 = [...P, { id: '4', text: 'Cuarto punto', critical: false }];
    expect(motivoBloqueo(estadoRutina(P4, []))).toMatch(/Faltan 4 puntos/);
  });

  it('distingue el bloqueo por falta de explicación', () => {
    const e = estadoRutina(P, [
      { itemId: '1', result: 'OK' },
      { itemId: '2', result: 'NO_OK' },
      { itemId: '3', result: 'OK' },
    ]);
    expect(motivoBloqueo(e)).toMatch(/sin explicar/i);
  });

  it('sin bloqueo devuelve null', () => {
    expect(motivoBloqueo(estadoRutina([], []))).toBeNull();
  });
});

describe('actividadDesdeHallazgo', () => {
  it('incluye el equipo y lo que se encontró', () => {
    // El técnico no redacta nada: la orden propuesta ya viene escrita.
    const a = actividadDesdeHallazgo(P[1], 'suelto, entró agua', 'AA-CAM-T2-045');
    expect(a).toMatch(/AA-CAM-T2-045/);
    expect(a).toMatch(/prensaestopa/);
    expect(a).toMatch(/entró agua/);
  });

  it('sin nota sigue teniendo sentido', () => {
    expect(actividadDesdeHallazgo(P[1], null)).toMatch(/Hallazgo en preventivo/);
  });
});
