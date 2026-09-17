import {
  CASTIGO_MS, MAX_FALLOS, VENTANA_MS, claveDeCuenta, estadoLimpio,
  estaBloqueada, intentosRestantes, registrarFallo,
} from '../src/common/bloqueo-de-cuenta';

const MIN = 60_000;

describe('Bloqueo de cuenta (bloque 104)', () => {
  it('cinco fallos seguidos dentro de la ventana cierran la puerta', () => {
    let e = estadoLimpio(0);
    let v = { bloqueada: false } as any;
    for (let i = 0; i < MAX_FALLOS; i++) {
      v = registrarFallo(e, i * 1000);
      e = v.estado;
    }
    expect(v.bloqueada).toBe(true);
    expect(v.minutosRestantes).toBe(15);
  });

  /* EL BUG QUE ESTE BLOQUE CIERRA. Antes no había ventana: los fallos se
     acumulaban para siempre y un técnico que se equivocaba dos veces el lunes
     y tres el viernes quedaba bloqueado el viernes. */
  it('los fallos de ventanas distintas NO se suman', () => {
    let e = estadoLimpio(0);
    // Lunes: dos fallos.
    e = registrarFallo(e, 0).estado;
    e = registrarFallo(e, 1000).estado;
    expect(e.fallos).toBe(2);

    // Días después: tres fallos más. No puede bloquear.
    const viernes = 4 * 24 * 3600_000;
    let v = registrarFallo(e, viernes);
    expect(v.estado.fallos).toBe(1);          // empezó de cero
    v = registrarFallo(v.estado, viernes + 1000);
    v = registrarFallo(v.estado, viernes + 2000);
    expect(v.bloqueada).toBe(false);
    expect(v.estado.fallos).toBe(3);
  });

  it('justo en el borde de la ventana ya no cuenta el fallo viejo', () => {
    let e = estadoLimpio(0);
    for (let i = 0; i < MAX_FALLOS - 1; i++) e = registrarFallo(e, i).estado;
    expect(e.fallos).toBe(MAX_FALLOS - 1);
    const v = registrarFallo(e, VENTANA_MS + 1);
    expect(v.bloqueada).toBe(false);
    expect(v.estado.fallos).toBe(1);
  });

  /* EL CASTIGO ES FIJO, NO ESCALONADO. Decisión del usuario: un primer castigo
     corto le da a quien prueba contraseñas una ventana barata. Esta prueba
     existe para que nadie lo "mejore" sin leer el motivo. */
  it('el castigo son SIEMPRE 15 minutos, tambien al reincidir', () => {
    /* Se mide la DURACIÓN desde el instante del fallo que bloquea, no un
       valor absoluto: el quinto fallo no cae en t=0 y comparar contra la
       constante a secas hacía fallar la prueba señalando código correcto. */
    let e = estadoLimpio(0);
    let v: any;
    let instante = 0;
    for (let i = 0; i < MAX_FALLOS; i++) { instante = i; v = registrarFallo(e, instante); e = v.estado; }
    expect(e.bloqueadaHasta - instante).toBe(CASTIGO_MS);

    // Pasa el castigo, vuelve a fallar cinco veces: el castigo NO crece.
    const despues = e.bloqueadaHasta + 1;
    let e2 = e;
    for (let i = 0; i < MAX_FALLOS; i++) { instante = despues + i; v = registrarFallo(e2, instante); e2 = v.estado; }
    expect(v.bloqueada).toBe(true);
    expect(e2.bloqueadaHasta - instante).toBe(CASTIGO_MS);
    expect(v.minutosRestantes).toBe(15);
  });

  it('al bloquear se vacia el contador: no se vuelve a caer al primer fallo', () => {
    let e = estadoLimpio(0);
    for (let i = 0; i < MAX_FALLOS; i++) e = registrarFallo(e, i).estado;
    expect(e.fallos).toBe(0);
  });

  it('estaBloqueada no toca el estado y dice los minutos que faltan', () => {
    const e = { fallos: 0, ventanaDesde: 0, bloqueadaHasta: 10 * MIN };
    const v = estaBloqueada(e, 2 * MIN);
    expect(v.bloqueada).toBe(true);
    expect(v.minutosRestantes).toBe(8);
    expect(v.estado).toBe(e);
  });

  it('pasado el castigo deja pasar', () => {
    const e = { fallos: 0, ventanaDesde: 0, bloqueadaHasta: 10 * MIN };
    expect(estaBloqueada(e, 10 * MIN + 1).bloqueada).toBe(false);
  });

  it('se puede decir cuantos intentos quedan, y caducan con la ventana', () => {
    let e = estadoLimpio(0);
    e = registrarFallo(e, 0).estado;
    e = registrarFallo(e, 1000).estado;
    expect(intentosRestantes(e, 2000)).toBe(MAX_FALLOS - 2);
    expect(intentosRestantes(e, VENTANA_MS + 1)).toBe(MAX_FALLOS);
  });

  /* La clave convive con la del freno por origen en la MISMA tabla. Si las dos
     pudieran chocar, gastar el cupo del login por IP bloquearía una cuenta. */
  it('la clave de cuenta lleva su prefijo y normaliza el correo', () => {
    expect(claveDeCuenta('  Admin@AASA.local ')).toBe('cuenta|admin@aasa.local');
    expect(claveDeCuenta('a@b.c').startsWith('cuenta|')).toBe(true);
  });
});
