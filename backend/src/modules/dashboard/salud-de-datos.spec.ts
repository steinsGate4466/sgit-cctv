import { saludDeDatos, ipValida, ActivoParaSalud } from './salud-de-datos';

/** Un activo completo. Cada prueba estropea sólo lo que va a comprobar. */
const ok = (id: string, o: Partial<ActivoParaSalud> = {}): ActivoParaSalud => ({
  id, codigo: id, tipo: 'CAMERA', tren: 'T1', tieneUbicacion: true,
  ip: '192.168.1.10', nvrId: 'NVR-1', medioAcceso: 'ESCALERA', alturaMetros: 2.5,
  marca: 'Hikvision', modelo: 'DS-2CD', serie: 'SN-001',
  editadoEn: new Date(), ...o,
});

const dim = (s: ReturnType<typeof saludDeDatos>, d: string) =>
  s.dimensiones.find((x) => x.dimension === d)!;
const hueco = (s: ReturnType<typeof saludDeDatos>, txt: string) =>
  s.huecos.find((h) => h.falta.toLowerCase().includes(txt.toLowerCase()));

describe('validación de direcciones', () => {
  it('acepta una IPv4 correcta y rechaza lo que no lo es', () => {
    expect(ipValida('10.1.2.3')).toBe(true);
    expect(ipValida('192.168.1.300')).toBe(false);  // octeto fuera de rango
    expect(ipValida('10.1.2')).toBe(false);         // faltan octetos
    expect(ipValida('')).toBe(false);
    expect(ipValida(null)).toBe(false);
  });
});

describe('sin datos', () => {
  it('no puntúa nada y lo dice', () => {
    const s = saludDeDatos([]);
    expect(s.puntos).toBeNull();
    expect(s.total).toBe(0);
    expect(s.titular).toContain('no hay ningún activo');
    // Ninguna dimensión inventa un 100 sobre cero activos.
    expect(s.dimensiones.every((d) => d.puntos === null)).toBe(true);
  });
});

describe('todo bien', () => {
  it('con las fichas completas da 100 en lo medible', () => {
    // IP distinta en cada uno: `ok()` las repite a propósito para la prueba
    // de duplicados de más abajo, y aquí eso sería un fallo real.
    const s = saludDeDatos([ok('C1'), ok('C2', { ip: '192.168.1.11' })]);
    expect(dim(s, 'COMPLETITUD').puntos).toBe(100);
    expect(dim(s, 'VALIDEZ').puntos).toBe(100);
    expect(dim(s, 'UNICIDAD').puntos).toBe(100);
    expect(s.huecos).toEqual([]);
    expect(s.titular).toContain('ninguna falta');
  });

  it('la exactitud NUNCA se puntúa, y explica por qué', () => {
    /* Que la IP registrada sea la real sólo lo puede decir el agente. Poner
       un número aquí subiría la nota y sería mentira. */
    const s = saludDeDatos([ok('C1')]);
    const e = dim(s, 'EXACTITUD');
    expect(e.puntos).toBeNull();
    expect(e.porQueNo).toContain('agente de monitoreo');
  });

  it('la nota global promedia sólo lo que se pudo medir', () => {
    /* Contar exactitud como cero castigaría a la planta por una pieza que
       todavía no existe. */
    const s = saludDeDatos([ok('C1')]);
    expect(s.puntos).toBe(100);
  });
});

describe('completitud', () => {
  it('detecta lo que falta y dice quién lo carga', () => {
    const s = saludDeDatos([ok('C1', { ip: null }), ok('C2')]);
    const h = hueco(s, 'sin dirección IP')!;
    expect(h.cuantos).toBe(1);
    expect(h.ejemplos).toEqual(['C1']);
    expect(h.quien).toBe('Técnico de red');
  });

  it('NO penaliza un campo que ese tipo de equipo no lleva', () => {
    /* Un switch no necesita grabador. Contarlo como incompleto daría una nota
       falsa hacia abajo, y una nota que no se puede subir se deja de mirar
       igual que una que siempre está en verde. */
    const s = saludDeDatos([ok('SW1', { tipo: 'SWITCH', nvrId: null })]);
    expect(hueco(s, 'sin grabador')).toBeUndefined();
    expect(dim(s, 'COMPLETITUD').puntos).toBe(100);
  });

  it('la ubicación pesa más que el número de serie', () => {
    const sinSerie = saludDeDatos([ok('A', { serie: null })]);
    const sinUbi = saludDeDatos([ok('B', { tieneUbicacion: false })]);
    expect(sinUbi.puntos!).toBeLessThan(sinSerie.puntos!);
  });
});

describe('unicidad', () => {
  it('encuentra el código repetido', () => {
    const s = saludDeDatos([ok('X'), { ...ok('otro'), codigo: 'X' }]);
    expect(hueco(s, 'código de activo repetido')!.cuantos).toBe(2);
  });

  it('encuentra la IP duplicada, que es la avería más cara de diagnosticar', () => {
    /* Los dos equipos funcionan a ratos y la falla parece intermitente. */
    const s = saludDeDatos([ok('C1'), ok('C2')]);   // los dos con 192.168.1.10
    expect(hueco(s, 'misma dirección ip')!.cuantos).toBe(2);
    expect(dim(s, 'UNICIDAD').puntos).toBe(0);
  });

  it('no cuenta como duplicada una IP mal escrita', () => {
    // Ya se penaliza en validez; contarla dos veces infla el castigo.
    const s = saludDeDatos([ok('C1', { ip: '999.1.1.1' }), ok('C2', { ip: '999.1.1.1' })]);
    expect(hueco(s, 'misma dirección ip')).toBeUndefined();
    expect(hueco(s, 'mal escritas')!.cuantos).toBe(2);
  });
});

describe('consistencia', () => {
  it('marca lo que está en altura sin decir cómo se sube', () => {
    /* Es la contradicción más peligrosa del sistema: dice que hay que subir y
       no dice cómo, y alguien puede ir sin preparar nada. */
    const s = saludDeDatos([ok('C1', { alturaMetros: 6, medioAcceso: null })]);
    expect(hueco(s, 'no dicen cómo se sube')!.cuantos).toBe(1);
  });

  it('por debajo de 1,80 m no es trabajo en altura', () => {
    const s = saludDeDatos([ok('C1', { alturaMetros: 1.5, medioAcceso: null })]);
    expect(hueco(s, 'no dicen cómo se sube')).toBeUndefined();
  });

  it('una IP en algo que no es equipo de red se señala', () => {
    const s = saludDeDatos([ok('U1', { tipo: 'UPS', ip: '10.1.1.1', nvrId: null })]);
    expect(hueco(s, 'no son equipos de red')!.cuantos).toBe(1);
  });
});

describe('validez y vigencia', () => {
  it('una IP mal escrita baja la validez', () => {
    const s = saludDeDatos([ok('C1', { ip: '192.168.1.300' }), ok('C2', { ip: '10.1.1.2' })]);
    expect(dim(s, 'VALIDEZ').puntos).toBe(50);
  });

  it('una altura imposible se detecta', () => {
    const s = saludDeDatos([ok('C1', { alturaMetros: -3 })]);
    expect(hueco(s, 'fuera de lo posible')!.cuantos).toBe(1);
  });

  it('la vigencia admite que mide la edición, no la verificación', () => {
    const s = saludDeDatos([ok('C1')]);
    expect(dim(s, 'VIGENCIA').porQueNo).toContain('no cuándo se verificó');
  });

  it('una ficha sin fecha cuenta como vieja', () => {
    const s = saludDeDatos([ok('C1', { editadoEn: null })]);
    expect(hueco(s, 'sin tocar en más de un año')!.cuantos).toBe(1);
  });
});

describe('la lista de trabajo', () => {
  it('ordena por cuántos activos afecta', () => {
    const s = saludDeDatos([
      ok('A', { ip: null, serie: null }),
      ok('B', { ip: null }),
      ok('C', { ip: null }),
    ]);
    expect(s.huecos[0].falta).toContain('dirección IP');
    expect(s.huecos[0].cuantos).toBe(3);
  });

  it('enseña como mucho cinco ejemplos', () => {
    const muchos = Array.from({ length: 30 }, (_, i) => ok(`C${i}`, { ip: null }));
    expect(saludDeDatos(muchos).huecos[0].ejemplos).toHaveLength(5);
  });

  it('todo hueco dice quién lo carga', () => {
    const s = saludDeDatos([ok('A', { ip: null, tieneUbicacion: false, medioAcceso: null })]);
    expect(s.huecos.every((h) => !!h.quien)).toBe(true);
  });
});

describe('el titular', () => {
  it('con nota alta señala lo que más falta', () => {
    const muchos = Array.from({ length: 20 }, (_, i) => ok(`C${i}`, { ip: `10.1.1.${i}` }));
    muchos[0].serie = null;
    const s = saludDeDatos(muchos);
    expect(s.puntos!).toBeGreaterThanOrEqual(85);
    expect(s.titular).toContain('Lo que más falta');
  });

  it('con nota baja avisa de que las pantallas saldrán con huecos', () => {
    const malos = Array.from({ length: 5 }, (_, i) => ok(`C${i}`, {
      ip: null, tieneUbicacion: false, tren: null, medioAcceso: null,
      marca: null, serie: null, nvrId: null, editadoEn: null,
    }));
    const s = saludDeDatos(malos);
    expect(s.puntos!).toBeLessThan(60);
    expect(s.titular).toContain('huecos');
  });
});

describe('rendimiento', () => {
  it('puntúa 2.000 activos sin colgarse', () => {
    const muchos = Array.from({ length: 2000 }, (_, i) => ok(`C${i}`, {
      ip: `10.${Math.floor(i / 250)}.${Math.floor(i / 25) % 10}.${i % 25}`,
    }));
    const t0 = Date.now();
    const s = saludDeDatos(muchos);
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(s.total).toBe(2000);
  });
});
