import { ContadorCompartido, claveCompartida, segundosHastaFinDeVentana } from '../src/common/contador-compartido';
import { alOirAviso, avisarCambioDePermisos, CANAL_PERMISOS } from '../src/common/aviso-de-permisos';
import { AccesoVigenteGuard } from '../src/common/guards/acceso-vigente.guard';

/* Bloque 174 · el límite de peticiones y el corte de acceso valen para TODAS
   las instancias, sin Redis: la base es lo que comparten. */

/** Una «base» falsa que suma como el INSERT … ON CONFLICT … RETURNING. */
function baseFalsa() {
  const filas = new Map<string, number>();
  return {
    filas,
    $queryRaw: jest.fn(async (_q: TemplateStringsArray, k: string, v: number) => {
      const key = `${k}@${v}`;
      const n = (filas.get(key) ?? 0) + 1;
      filas.set(key, n);
      return [{ n }];
    }),
    $executeRaw: jest.fn(async () => 0),
  };
}

describe('límite de peticiones compartido', () => {
  const regla = { maximo: 3, ventanaMs: 60_000 };

  it('DOS instancias sobre la misma base comparten el cupo (no se duplica)', async () => {
    const base = baseFalsa();
    const a = new ContadorCompartido(base);
    const b = new ContadorCompartido(base);
    const t = 1_000_000_020_000;
    expect(await a.consultar('u1', regla, t)).toBeNull();
    expect(await b.consultar('u1', regla, t)).toBeNull();
    expect(await a.consultar('u1', regla, t)).toBeNull();
    // La 4.ª, en la OTRA instancia, ya se frena: con memoria por proceso pasaría.
    expect(await b.consultar('u1', regla, t)).toBe(segundosHastaFinDeVentana(t, 60_000));
  });

  it('cada regla cuenta aparte (general y rutas caras no se mezclan)', () => {
    expect(claveCompartida('u1', { maximo: 600, ventanaMs: 60_000 }))
      .not.toBe(claveCompartida('u1', { maximo: 30, ventanaMs: 60_000 }));
  });

  it('una ventana nueva empieza de cero', async () => {
    const base = baseFalsa();
    const a = new ContadorCompartido(base);
    for (let i = 0; i < 4; i += 1) await a.consultar('u2', regla, 120_000);
    expect(await a.consultar('u2', regla, 180_000)).toBeNull();
  });

  it('si la base falla, cuenta en memoria y NO deja a la planta sin sistema', async () => {
    const rota = { $queryRaw: jest.fn(async () => { throw new Error('caída'); }), $executeRaw: jest.fn(async () => 0) };
    const a = new ContadorCompartido(rota);
    expect(await a.consultar('u3', regla, 5_000)).toBeNull();
    expect(a.fallos).toBe(1);
  });

  it('la espera dice cuánto falta para que termine la ventana', () => {
    expect(segundosHastaFinDeVentana(60_000 + 15_000, 60_000)).toBe(45);
    expect(segundosHastaFinDeVentana(119_999, 60_000)).toBe(1);
  });
});

describe('cambio de permisos avisado a todas las instancias', () => {
  it('avisar borra la caché propia y manda pg_notify por el canal', async () => {
    const olvidar = jest.spyOn(AccesoVigenteGuard, 'olvidar');
    const base = { $executeRaw: jest.fn(async () => 1) };
    await avisarCambioDePermisos(base, 'U9');
    expect(olvidar).toHaveBeenCalledWith('U9');
    const [plantilla, canal, quien] = base.$executeRaw.mock.calls[0] as unknown as [TemplateStringsArray, string, string];
    expect(plantilla.join('?')).toContain('pg_notify');
    expect(canal).toBe(CANAL_PERMISOS);
    expect(quien).toBe('U9');
    olvidar.mockRestore();
  });

  it("'*' (cambió un rol) vacía la caché entera, aquí y al oírlo en otra instancia", async () => {
    const todo = jest.spyOn(AccesoVigenteGuard, 'olvidarTodo');
    await avisarCambioDePermisos(null, '*');
    alOirAviso('*');
    expect(todo).toHaveBeenCalledTimes(2);
    todo.mockRestore();
  });

  it('al oír un usuario, se olvida sólo a ese', () => {
    const olvidar = jest.spyOn(AccesoVigenteGuard, 'olvidar');
    alOirAviso('U1');
    alOirAviso('');
    expect(olvidar).toHaveBeenCalledTimes(1);
    olvidar.mockRestore();
  });

  it('si la base no está, avisar no rompe (el corte local ya se hizo)', async () => {
    const rota = { $executeRaw: jest.fn(async () => { throw new Error('x'); }) };
    await expect(avisarCambioDePermisos(rota, 'U1')).resolves.toBeUndefined();
  });
});
