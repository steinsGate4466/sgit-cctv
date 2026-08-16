import {
  construirLineaDeTiempo, enPalabras, resumirTiempo,
  titularDeMateriales, veredictoDeMaterial,
} from '../src/common/linea-de-tiempo';

/**
 * PRUEBAS DE LA LÍNEA DE TIEMPO — bloque 39.
 *
 * Lo que se protege aquí no es que sepa restar horas. Es que NO MIENTA sobre
 * cuándo se cayó una cámara, que es el número que el jefe de tren va a usar
 * para decidir si esto va bien o va mal.
 */

const H = (hhmm: string) => new Date(`2026-08-16T${hhmm}:00Z`);

describe('línea de tiempo · caída y reporte son datos DISTINTOS', () => {
  it('con agente fiable, el reloj arranca en la CAÍDA', () => {
    const l = construirLineaDeTiempo({
      dejoDeResponderEn: H('06:12'), fallosSeguidos: 3,
      reportadaEn: H('06:31'),
    });
    const r = resumirTiempo(l, H('09:12').getTime());

    expect(r.contadoDesde).toBe('CAIDA');
    expect(r.horaDeCaidaDesconocida).toBe(false);
    expect(r.totalMin).toBe(180);
    // 19 minutos hasta que alguien avisó. Ese tramo NO es de Mantenimiento.
    expect(r.minHastaQueAvisaron).toBe(19);
  });

  it('SIN agente, arranca en el reporte y lo declara', () => {
    /* EL ERROR QUE ESTO PREVIENE, con números:
       la cámara se fue a las 06:12 y alguien avisó a las 09:30. Contar desde
       el reporte da 3 h cuando son 6 h 30 — más del doble— y encima favorece
       a quien tardó en mirar la pantalla. Como no hay agente, no se puede
       saber: se dice que no se sabe. */
    const l = construirLineaDeTiempo({ reportadaEn: H('09:30') });
    const r = resumirTiempo(l, H('12:30').getTime());

    expect(r.contadoDesde).toBe('REPORTE');
    expect(r.horaDeCaidaDesconocida).toBe(true);
    expect(r.minHastaQueAvisaron).toBeNull();
  });

  it('con UN solo fallo NO se declara caída', () => {
    /* Una pérdida suelta en una wifi industrial es lo normal. Pintarla como
       caída llenaría la pantalla del jefe de falsas alarmas hasta que dejara
       de mirarla — y entonces la que importe pasará desapercibida. */
    const l = construirLineaDeTiempo({
      dejoDeResponderEn: H('06:12'), fallosSeguidos: 1,
      reportadaEn: H('06:31'),
    });
    expect(l.find((h) => h.clave === 'CAIDA')).toBeUndefined();
    expect(resumirTiempo(l).contadoDesde).toBe('REPORTE');
  });

  it('con tres fallos sí, que es el mismo umbral que usa el monitoreo', () => {
    const l = construirLineaDeTiempo({
      dejoDeResponderEn: H('06:12'), fallosSeguidos: 3,
    });
    expect(l[0].clave).toBe('CAIDA');
    expect(l[0].origen).toBe('AGENTE');
  });
});

describe('línea de tiempo · dónde se va el tiempo', () => {
  const completa = construirLineaDeTiempo({
    dejoDeResponderEn: H('06:12'), fallosSeguidos: 4,
    reportadaEn: H('06:31'), reportadaPor: 'J. Ramos',
    ordenAbiertaEn: H('06:44'), asignadaA: 'M. Cruz',
    trabajoIniciadoEn: H('07:58'), inicioFirmadoPor: 'M. Cruz',
  });

  it('separa los tres tramos', () => {
    const r = resumirTiempo(completa, H('09:32').getTime());
    expect(r.minHastaQueAvisaron).toBe(19);    // nadie miraba la pantalla
    expect(r.minHastaQueAsignaron).toBe(13);   // el ingeniero, rápido
    expect(r.minHastaQueEmpezaron).toBe(74);   // caminar hasta el sitio
    expect(r.totalMin).toBe(200);
  });

  it('cada hito sabe cuánto pasó desde el anterior', () => {
    expect(completa.map((h) => h.desdeElAnterior)).toEqual([null, 19, 13, 74]);
  });

  it('sólo aparecen los hitos que YA ocurrieron', () => {
    /* Con hitos grises de «pendiente», la tarjeta parece decir que falta
       información cuando lo que pasa es que el trabajo va por la mitad. */
    expect(completa.map((h) => h.clave)).toEqual(['CAIDA', 'REPORTE', 'ASIGNACION', 'INICIO']);
  });

  it('al cerrarse, el total deja de correr', () => {
    const l = construirLineaDeTiempo({
      reportadaEn: H('06:00'), cerradaEn: H('08:00'), cerradaPor: 'M. Cruz',
    });
    // Aunque «ahora» sean las 20:00, el total son las 2 h que duró.
    expect(resumirTiempo(l, H('20:00').getTime()).totalMin).toBe(120);
  });

  it('unas horas cruzadas devuelven null, no un negativo', () => {
    /* Un reloj mal puesto o una fecha escrita hacia atrás. «-40 min» en una
       pantalla no lo entiende nadie, y restaría del total dejándolo más corto
       de lo real. */
    const l = construirLineaDeTiempo({
      dejoDeResponderEn: H('10:00'), fallosSeguidos: 3,
      reportadaEn: H('08:00'),
    });
    expect(resumirTiempo(l).minHastaQueAvisaron).toBeNull();
  });

  it('sin ningún hito, no se inventa un total', () => {
    const r = resumirTiempo(construirLineaDeTiempo({}));
    expect(r.totalMin).toBeNull();
    expect(r.contadoDesde).toBeNull();
  });
});

describe('enPalabras · como lo dice la gente', () => {
  it('minutos, horas y días', () => {
    expect(enPalabras(0)).toBe('hace un momento');
    expect(enPalabras(45)).toBe('45 min');
    expect(enPalabras(60)).toBe('1 h');
    expect(enPalabras(195)).toBe('3 h 15 min');
    expect(enPalabras(1500)).toBe('1 d 1 h');
    expect(enPalabras(2880)).toBe('2 d');
  });

  it('sin dato se dice, no se pone cero', () => {
    expect(enPalabras(null)).toBe('sin dato');
  });
});

describe('materiales · lo que dispara una compra', () => {
  it('lo que falta se dice con el número y el código de SAP', () => {
    const v = veredictoDeMaterial({
      descripcion: 'Conector RJ45 cat6', sapCode: '4711', estado: 'SOLICITADO',
      previsto: 3, stock: 1,
    });
    expect(v.bloquea).toBe(true);
    expect(v.faltan).toBe(2);
    expect(v.texto).toContain('Faltan 2 de 3');
    expect(v.texto).toContain('4711');
  });

  it('si hay stock no bloquea, sólo está pendiente de retirar', () => {
    const v = veredictoDeMaterial({
      descripcion: 'Patch cord 2 m', estado: 'SOLICITADO', previsto: 2, stock: 10,
    });
    expect(v.bloquea).toBe(false);
    expect(v.texto).toContain('pendiente de retirar');
  });

  it('lo ya retirado no bloquea nada', () => {
    const v = veredictoDeMaterial({
      descripcion: 'Cable UTP', estado: 'RETIRADO', previsto: 50, retirado: 50, stock: 0,
    });
    expect(v.bloquea).toBe(false);
    expect(v.faltan).toBe(0);
  });

  it('un material FUERA del catálogo no dice que falta: dice que no se sabe', () => {
    /* Decir «faltan 3» de algo que no está en el catálogo obligaría a comprar
       lo que quizá está en el estante. Y decir que hay sería peor. */
    const v = veredictoDeMaterial({
      descripcion: 'Abrazadera especial', estado: 'SOLICITADO', previsto: 3, stock: null,
    });
    expect(v.bloquea).toBe(false);
    expect(v.faltan).toBe(0);
    expect(v.texto).toContain('no se puede saber');
  });

  it('lo rechazado explica el motivo', () => {
    const v = veredictoDeMaterial({
      descripcion: 'Cámara de repuesto', estado: 'RECHAZADO',
      motivoRechazo: 'la actual se puede reparar',
    });
    expect(v.bloquea).toBe(false);
    expect(v.texto).toContain('la actual se puede reparar');
  });

  it('lo parcialmente retirado sólo cuenta lo que queda', () => {
    const v = veredictoDeMaterial({
      descripcion: 'Conector', estado: 'SOLICITADO', previsto: 10, retirado: 6, stock: 2,
    });
    expect(v.faltan).toBe(2);   // quedan 4 por sacar y sólo hay 2
  });
});

describe('titularDeMateriales · la frase que llega al jefe', () => {
  const ok = veredictoDeMaterial({ descripcion: 'A', estado: 'RETIRADO' });
  const falta = (d: string) =>
    veredictoDeMaterial({ descripcion: d, estado: 'SOLICITADO', previsto: 5, stock: 0 });

  it('sin nada bloqueando, no hay titular', () => {
    expect(titularDeMateriales([ok])).toBeNull();
  });

  it('con uno, lo nombra', () => {
    expect(titularDeMateriales([ok, falta('Conector RJ45')])).toContain('Conector RJ45');
  });

  it('con varios, cuenta cuántos', () => {
    expect(titularDeMateriales([falta('A'), falta('B'), falta('C')])).toContain('3 materiales');
  });
});
