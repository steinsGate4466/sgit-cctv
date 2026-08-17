import {
  accesoDeActivo, montajeDe, resumirAcceso, exigeEquipoElevador,
  ALTURA_DE_TRABAJO_EN_ALTURA_M, Acceso, CandidatoASubida,
} from '../src/common/acceso-fisico';

/**
 * PRUEBAS DEL ACCESO FÍSICO — bloque 41.
 *
 * Lo que se prueba aquí decide si Producción aprueba un gasto y si alguien
 * sube preparado o no. Las dos cosas merecen una prueba escrita a mano.
 *
 * La prueba más importante de todo el archivo es la primera: que un equipo sin
 * declarar NUNCA salga como «se llega a pie».
 */

const candidato = (p: Partial<CandidatoASubida> = {}): CandidatoASubida => ({
  id: 'a1', ubicacionId: 'z1', ubicacionNombre: 'Poste 4',
  veredicto: 'EXIGE_ELEVADOR', tienePendiente: true, ...p,
});

const fila = (acceso: Acceso, c: Partial<CandidatoASubida> = {}) => ({
  acceso,
  candidato: candidato({ veredicto: acceso.veredicto, ...c }),
});

describe('acceso · sin declarar no es «se llega a pie»', () => {
  it('un activo sin medio declarado sale SIN_DECLARAR, no A_PIE', () => {
    const a = accesoDeActivo({ id: 'x' });
    expect(a.veredicto).toBe('SIN_DECLARAR');
    expect(a.declarado).toBe(false);
    expect(a.medio).toBeNull();
  });

  it('lo dice con todas las letras, para que nadie lo lea como «no hace falta»', () => {
    const a = accesoDeActivo({ id: 'x' });
    expect(a.motivo).toContain('no quiere decir que se llegue a pie');
  });

  it('en zona de altura propone manlift, pero sigue SIN_DECLARAR', () => {
    const a = accesoDeActivo({ id: 'x', zonaRequiereAltura: true });
    expect(a.propuesta).toBe('MANLIFT');
    // La propuesta informa. NO convierte el veredicto en confirmado.
    expect(a.veredicto).toBe('SIN_DECLARAR');
    expect(a.declarado).toBe(false);
  });

  it('la propuesta NO suma al total de los que exigen elevador', () => {
    const r = resumirAcceso([
      fila(accesoDeActivo({ id: '1', zonaRequiereAltura: true })),
      fila(accesoDeActivo({ id: '2', zonaRequiereAltura: true })),
    ]);
    expect(r.exigenElevador).toBe(0);
    expect(r.sinDeclarar).toBe(2);
    // Pero se cuentan aparte: es lo que puede crecer al terminar de declarar.
    expect(r.sinDeclararEnZonaDeAltura).toBe(2);
  });
});

describe('acceso · lo declarado manda sobre la propuesta', () => {
  it('declarado A_PIE en zona de altura gana la declaración', () => {
    const a = accesoDeActivo({ id: 'x', medioAcceso: 'A_PIE', zonaRequiereAltura: true });
    expect(a.veredicto).toBe('A_PIE');
    expect(a.declarado).toBe(true);
    // La propuesta se sigue devolviendo para poder enseñar el desacuerdo.
    expect(a.propuesta).toBe('MANLIFT');
  });

  it('manlift y grúa exigen equipo elevador; escalera y andamio no', () => {
    expect(exigeEquipoElevador('MANLIFT')).toBe(true);
    expect(exigeEquipoElevador('GRUA')).toBe(true);
    expect(exigeEquipoElevador('ESCALERA')).toBe(false);
    expect(exigeEquipoElevador('ANDAMIO')).toBe(false);
    expect(exigeEquipoElevador('A_PIE')).toBe(false);
    expect(exigeEquipoElevador(null)).toBe(false);
  });

  it('escalera y andamio son subida, pero no cuentan como elevador', () => {
    expect(accesoDeActivo({ id: 'x', medioAcceso: 'ESCALERA' }).veredicto)
      .toBe('SUBIDA_SIN_ELEVADOR');
    expect(accesoDeActivo({ id: 'x', medioAcceso: 'ANDAMIO' }).veredicto)
      .toBe('SUBIDA_SIN_ELEVADOR');
  });

  it('OTRO no se lee como «a pie»: es una subida sin resolver', () => {
    expect(accesoDeActivo({ id: 'x', medioAcceso: 'OTRO' }).veredicto)
      .toBe('SUBIDA_SIN_ELEVADOR');
  });
});

describe('acceso · trabajo en altura y contradicciones', () => {
  it(`marca trabajo en altura desde ${ALTURA_DE_TRABAJO_EN_ALTURA_M} m`, () => {
    expect(accesoDeActivo({ id: 'x', alturaMetros: 1.79 }).esTrabajoEnAltura).toBe(false);
    expect(accesoDeActivo({ id: 'x', alturaMetros: 1.8 }).esTrabajoEnAltura).toBe(true);
    expect(accesoDeActivo({ id: 'x', alturaMetros: 8 }).esTrabajoEnAltura).toBe(true);
  });

  it('«se llega a pie» a 4 m es una contradicción y se enseña', () => {
    const a = accesoDeActivo({ id: 'x', medioAcceso: 'A_PIE', alturaMetros: 4 });
    expect(a.contradiccion).toContain('trabajo en altura');
    // NO se corrige sola: corregirla sería inventar cuál de los dos datos vale.
    expect(a.veredicto).toBe('A_PIE');
  });

  it('manlift para 1 m también se avisa: infla el gasto de Producción', () => {
    const a = accesoDeActivo({ id: 'x', medioAcceso: 'MANLIFT', alturaMetros: 1 });
    expect(a.contradiccion).toContain('escalera');
    expect(a.veredicto).toBe('EXIGE_ELEVADOR');
  });

  it('sin altura declarada no hay contradicción que inventar', () => {
    expect(accesoDeActivo({ id: 'x', medioAcceso: 'MANLIFT' }).contradiccion).toBeNull();
    expect(accesoDeActivo({ id: 'x', medioAcceso: 'A_PIE' }).contradiccion).toBeNull();
  });

  it('altura 0 es un dato válido, no un hueco', () => {
    const a = accesoDeActivo({ id: 'x', medioAcceso: 'A_PIE', alturaMetros: 0 });
    expect(a.alturaMetros).toBe(0);
    expect(a.contradiccion).toBeNull();
  });
});

describe('montaje', () => {
  it('tablero manda sobre gabinete si por error tuviera los dos', () => {
    expect(montajeDe({ cabinetId: 'g1', tableroId: 't1' })).toBe('TABLERO');
  });
  it('sin gabinete ni tablero, está en campo', () => {
    expect(montajeDe({})).toBe('CAMPO');
    expect(montajeDe({ cabinetId: null, tableroId: null })).toBe('CAMPO');
  });
  it('sólo gabinete', () => {
    expect(montajeDe({ cabinetId: 'g1' })).toBe('GABINETE');
  });
});

describe('agrupar subidas · el número que le importa a Producción', () => {
  const conElevador = (id: string) =>
    accesoDeActivo({ id, medioAcceso: 'MANLIFT' });

  it('tres equipos del mismo punto son UNA subida', () => {
    const r = resumirAcceso([
      fila(conElevador('1'), { id: '1', ubicacionId: 'poste4' }),
      fila(conElevador('2'), { id: '2', ubicacionId: 'poste4' }),
      fila(conElevador('3'), { id: '3', ubicacionId: 'poste4' }),
    ]);
    expect(r.pendientesConElevador).toBe(3);
    expect(r.subidas).toHaveLength(1);
    expect(r.subidas[0].equipos).toBe(3);
    expect(r.subidasQueSeAhorran).toBe(2);
  });

  it('equipos en puntos distintos no se pueden juntar', () => {
    const r = resumirAcceso([
      fila(conElevador('1'), { id: '1', ubicacionId: 'poste4' }),
      fila(conElevador('2'), { id: '2', ubicacionId: 'horno' }),
    ]);
    expect(r.subidas).toHaveLength(2);
    expect(r.subidasQueSeAhorran).toBe(0);
  });

  it('SIN UBICACIÓN no se agrupa: no hay forma de saber si están cerca', () => {
    /* Si se metieran todos en el mismo saco, el sistema prometería un ahorro
       que no existe y alguien planificaría una jornada sobre esa promesa. */
    const r = resumirAcceso([
      fila(conElevador('1'), { id: '1', ubicacionId: null }),
      fila(conElevador('2'), { id: '2', ubicacionId: null }),
    ]);
    expect(r.subidas).toHaveLength(2);
    expect(r.subidasQueSeAhorran).toBe(0);
  });

  it('lo que no tiene trabajo pendiente NO cuenta como subida', () => {
    const r = resumirAcceso([
      fila(conElevador('1'), { id: '1', tienePendiente: false }),
      fila(conElevador('2'), { id: '2', tienePendiente: false }),
    ]);
    expect(r.exigenElevador).toBe(2);
    expect(r.pendientesConElevador).toBe(0);
    expect(r.subidas).toHaveLength(0);
  });

  it('lo que se llega a pie nunca entra en una subida', () => {
    const r = resumirAcceso([
      fila(accesoDeActivo({ id: '1', medioAcceso: 'A_PIE' }), { id: '1' }),
      fila(accesoDeActivo({ id: '2', medioAcceso: 'ESCALERA' }), { id: '2' }),
    ]);
    expect(r.subidas).toHaveLength(0);
    expect(r.aPie).toBe(1);
    expect(r.subidaSinElevador).toBe(1);
  });

  it('las subidas salen ordenadas por cuántos equipos juntan', () => {
    const r = resumirAcceso([
      fila(conElevador('1'), { id: '1', ubicacionId: 'a', ubicacionNombre: 'A' }),
      fila(conElevador('2'), { id: '2', ubicacionId: 'b', ubicacionNombre: 'B' }),
      fila(conElevador('3'), { id: '3', ubicacionId: 'b', ubicacionNombre: 'B' }),
    ]);
    expect(r.subidas[0].ubicacionNombre).toBe('B');
    expect(r.subidas[0].equipos).toBe(2);
  });
});

describe('el titular', () => {
  const conElevador = (id: string) => accesoDeActivo({ id, medioAcceso: 'MANLIFT' });

  it('sin equipos no inventa nada', () => {
    expect(resumirAcceso([]).titular).toContain('Todavía no hay equipos');
  });

  it('cuando hay algo que juntar, lo dice primero: es lo que ahorra hoy', () => {
    const r = resumirAcceso([
      fila(conElevador('1'), { id: '1', ubicacionId: 'p' }),
      fila(conElevador('2'), { id: '2', ubicacionId: 'p' }),
    ]);
    expect(r.titular).toContain('1 subida');
    expect(r.titular).toContain('en vez de 2');
  });

  it('avisa de que la cifra puede crecer si falta declarar en zonas de altura', () => {
    const r = resumirAcceso([
      fila(conElevador('1'), { id: '1', tienePendiente: false }),
      fila(accesoDeActivo({ id: '2', zonaRequiereAltura: true }), { id: '2' }),
    ]);
    expect(r.titular).toContain('todavía puede subir');
  });

  it('cuando todo está declarado y nada exige elevador, lo dice y ya', () => {
    const r = resumirAcceso([
      fila(accesoDeActivo({ id: '1', medioAcceso: 'A_PIE' }), { id: '1' }),
    ]);
    expect(r.titular).toContain('sin equipo elevador');
  });

  it('nunca dice «0 %» ni una cifra tranquilizadora con datos incompletos', () => {
    const r = resumirAcceso([
      fila(accesoDeActivo({ id: '1' }), { id: '1' }),
      fila(accesoDeActivo({ id: '2' }), { id: '2' }),
    ]);
    expect(r.titular).toContain('no tienen');
    expect(r.titular).not.toMatch(/0 ?%/);
  });
});
