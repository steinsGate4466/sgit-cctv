import {
  conReintentoDeCodigo, esChoqueDeUnicidad, siguienteCorrelativo,
} from '../src/common/correlativo';

/**
 * PRUEBAS DEL CORRELATIVO — bloque 37.
 *
 * Lo que se prueba aquí no es «sabe sumar uno». Es el comportamiento cuando
 * DOS PERSONAS PULSAN A LA VEZ, que es el único momento en que esto importa y
 * el que no se puede reproducir a mano.
 */

const choque = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

describe('siguienteCorrelativo · de dónde sale el número', () => {
  it('sin ninguna orden previa, empieza en 0001', () => {
    expect(siguienteCorrelativo(null, 'OM-2026-')).toBe('OM-2026-0001');
  });

  it('sigue al mayor del año', () => {
    expect(siguienteCorrelativo('OM-2026-0041', 'OM-2026-')).toBe('OM-2026-0042');
  });

  it('el salto avanza tantas posiciones como reintentos', () => {
    // Sin esto, los tres reintentos pedirían el MISMO número y chocarían las
    // tres veces. Es el error clásico al escribir un reintento.
    expect(siguienteCorrelativo('OM-2026-0041', 'OM-2026-', 1)).toBe('OM-2026-0042'.replace('42', '43'));
    expect(siguienteCorrelativo('OM-2026-0041', 'OM-2026-', 2)).toBe('OM-2026-0044');
  });

  it('IGNORA un código de otra serie que se cuele en el listado', () => {
    /* El defecto que esto previene: la versión vieja hacía
       `code.split('-').pop()`. Con un código escrito a mano como
       «OM-2026-CAM-0007» eso devuelve «0007» —de una numeración que no es la
       nuestra— y el correlativo saltaba a 0008 pisando órdenes reales.
       Recortar por longitud del prefijo es lo único de lo que hay certeza. */
    expect(siguienteCorrelativo('OT-2025-0900', 'OM-2026-')).toBe('OM-2026-0001');
  });

  it('un código con texto donde va el número no rompe: vuelve a empezar', () => {
    expect(siguienteCorrelativo('OM-2026-XXXX', 'OM-2026-')).toBe('OM-2026-0001');
  });

  it('pasa de cuatro cifras sin recortar', () => {
    // Con 9999 órdenes en un año el formato crece. Recortarlo daría 0000 y
    // chocaría contra la primera del año.
    expect(siguienteCorrelativo('OM-2026-9999', 'OM-2026-')).toBe('OM-2026-10000');
  });
});

describe('conReintentoDeCodigo · absorber la carrera', () => {
  it('si no hay choque, no reintenta', async () => {
    const intento = jest.fn().mockResolvedValue('OM-2026-0042');
    await expect(conReintentoDeCodigo(intento)).resolves.toBe('OM-2026-0042');
    expect(intento).toHaveBeenCalledTimes(1);
  });

  it('choca una vez y a la segunda entra', async () => {
    // Éste es el caso real: dos personas crean una orden en el mismo segundo.
    const intento = jest.fn()
      .mockRejectedValueOnce(choque())
      .mockResolvedValue('OM-2026-0043');
    await expect(conReintentoDeCodigo(intento)).resolves.toBe('OM-2026-0043');
    expect(intento).toHaveBeenCalledTimes(2);
  });

  it('cada reintento pide un número DISTINTO', async () => {
    const vistos: number[] = [];
    const intento = jest.fn(async (n: number) => {
      vistos.push(n);
      if (n < 2) throw choque();
      return 'ok';
    });
    await conReintentoDeCodigo(intento);
    expect(vistos).toEqual([0, 1, 2]);
  });

  /* POR QUÉ OCHO Y NO TRES.
     La primera versión hacía tres intentos. Una prueba de concurrencia contra
     PostgreSQL de verdad —ocho peticiones a la vez— la tumbó: entraron 3 de 8.
     El motivo es que cada ronda deja pasar exactamente a UNO (todos los que
     compiten leen lo mismo y piden lo mismo), así que hacen falta tantas
     rondas como personas. Ocho cubre el peor momento real: cae algo gordo y
     el ingeniero, el jefe y dos técnicos abren órdenes a la vez. */
  it('tras ocho choques se rinde y deja subir el error', async () => {
    // No se reintenta en bucle a propósito: si tras ocho sigue chocando, el
    // problema ya no es la concurrencia, y más reintentos lo esconderían.
    const intento = jest.fn().mockRejectedValue(choque());
    await expect(conReintentoDeCodigo(intento)).rejects.toMatchObject({ code: 'P2002' });
    expect(intento).toHaveBeenCalledTimes(8);
  });

  it('espera entre intentos, para romper la sincronía', async () => {
    /* Sin la espera, los siete que perdieron la primera ronda vuelven a leer
       y a escribir al unísono y chocan otra vez. La espera es al azar a
       propósito: si todos esperaran lo mismo, sólo se retrasaría el choque. */
    const inicio = Date.now();
    const intento = jest.fn()
      .mockRejectedValueOnce(choque())
      .mockResolvedValue('ok');
    await conReintentoDeCodigo(intento);
    expect(Date.now() - inicio).toBeGreaterThanOrEqual(4);
  });

  it('NO espera después del último intento', async () => {
    // Nadie va a usar esa pausa: sólo retrasa el error que ya es seguro.
    const inicio = Date.now();
    await expect(
      conReintentoDeCodigo(jest.fn().mockRejectedValue(choque()), 1),
    ).rejects.toBeDefined();
    expect(Date.now() - inicio).toBeLessThan(40);
  });

  it('un error QUE NO ES choque sube a la primera, sin reintentar', async () => {
    /* Lo importante de esta prueba: reintentar a ciegas convertiría un fallo
       real —un campo obligatorio vacío, una relación que no existe— en tres
       intentos con el mismo fallo, el triple de ruido en el registro y
       ninguna pista más. */
    const otro = Object.assign(new Error('El activo no existe'), { code: 'P2025' });
    const intento = jest.fn().mockRejectedValue(otro);
    await expect(conReintentoDeCodigo(intento)).rejects.toThrow('El activo no existe');
    expect(intento).toHaveBeenCalledTimes(1);
  });

  it('respeta el máximo que se le pase (1 = no reintentar)', async () => {
    // Se usa cuando el código lo escribió una persona: repetirlo daría el
    // mismo choque, y ese conflicto tiene que llegarle a quien lo tecleó.
    const intento = jest.fn().mockRejectedValue(choque());
    await expect(conReintentoDeCodigo(intento, 1)).rejects.toMatchObject({ code: 'P2002' });
    expect(intento).toHaveBeenCalledTimes(1);
  });
});

describe('esChoqueDeUnicidad · distinguir el choque de todo lo demás', () => {
  it('reconoce P2002', () => {
    expect(esChoqueDeUnicidad({ code: 'P2002' })).toBe(true);
  });

  it('no confunde otros códigos de Prisma', () => {
    expect(esChoqueDeUnicidad({ code: 'P2025' })).toBe(false);
  });

  it('aguanta null y undefined sin reventar', () => {
    expect(esChoqueDeUnicidad(null)).toBe(false);
    expect(esChoqueDeUnicidad(undefined)).toBe(false);
    expect(esChoqueDeUnicidad(new Error('cualquier cosa'))).toBe(false);
  });
});
