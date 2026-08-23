import {
  zonasDelTren, titularDelTren, nombreDeTipo, ActivoDeZona,
} from './zonas-del-tren';

const a = (o: Partial<ActivoDeZona> & { id: string }): ActivoDeZona => ({
  codigo: o.id, tipo: 'CAMERA', estado: 'OPERATIVO',
  zonaCode: 'ENFR', zonaNombre: 'Zona de enfriamiento', criticidad: 'ALTA', ...o,
});

describe('agrupación por zona', () => {
  it('agrupa y cuenta lo que ve cada zona', () => {
    const { zonas } = zonasDelTren([
      a({ id: 'C1' }), a({ id: 'C2' }),
      a({ id: 'C3', zonaCode: 'PULP', zonaNombre: 'Púlpito' }),
      a({ id: 'SW1', tipo: 'SWITCH', zonaCode: 'PULP', zonaNombre: 'Púlpito' }),
    ]);
    expect(zonas).toHaveLength(2);
    const pulp = zonas.find((z) => z.code === 'PULP')!;
    expect(pulp.activos).toBe(2);
    expect(pulp.camaras).toBe(1);
  });

  it('los tres estados de una cámara caída cuentan como que no ve', () => {
    for (const estado of ['FUERA_SERVICIO', 'CON_INCIDENCIA', 'MANTENIMIENTO']) {
      const { zonas } = zonasDelTren([a({ id: 'C1' }), a({ id: 'C2', estado })]);
      expect(zonas[0].camarasViendo).toBe(1);
      expect(zonas[0].salud).toBe('MAL');
    }
  });

  it('una zona SIN cámaras es SIN_MEDIR, nunca BIEN', () => {
    /* Es la regla «sin datos, nunca cero». Pintarla verde es la mentira que
       hace que nadie vuelva a creerse la pantalla. */
    const { zonas } = zonasDelTren([a({ id: 'SW1', tipo: 'SWITCH' })]);
    expect(zonas[0].salud).toBe('SIN_MEDIR');
    expect(zonas[0].queDice).toContain('ninguna cámara');
  });

  it('cuenta subidas de manlift, y no aparece ningún importe', () => {
    const { zonas, totales } = zonasDelTren([
      a({ id: 'C1', exigeElevador: true }),
      a({ id: 'C2', exigeElevador: true }),
      a({ id: 'C3' }),
    ]);
    expect(zonas[0].exigenElevador).toBe(2);
    expect(totales.exigenElevador).toBe(2);
    const texto = JSON.stringify(zonas).toLowerCase();
    for (const dinero of ['sol', 's/', 'costo', 'precio', 'usd', '$']) {
      expect(texto).not.toContain(dinero);
    }
  });

  it('marca cuántos viven dentro de un tablero eléctrico', () => {
    const { zonas } = zonasDelTren([
      a({ id: 'SW1', tipo: 'SWITCH', enTablero: true }), a({ id: 'C1' }),
    ]);
    expect(zonas[0].enTablero).toBe(1);
  });

  it('los activos sin zona NO se pierden: van a su propio grupo', () => {
    /* Esconderlos haría que los totales no cuadraran con el inventario, que
       es la forma más rápida de perder la confianza en la pantalla. */
    const { zonas, totales } = zonasDelTren([
      a({ id: 'C1' }), a({ id: 'X1', zonaCode: null, zonaNombre: null }),
    ]);
    expect(totales.activos).toBe(2);
    const sin = zonas.find((z) => z.code === '')!;
    expect(sin.nombre).toBe('Sin zona asignada');
  });
});

describe('el orden de las zonas', () => {
  const set = () => zonasDelTren([
    a({ id: 'B1', zonaCode: 'BIEN', zonaNombre: 'Todo bien' }),
    a({ id: 'S1', tipo: 'SWITCH', zonaCode: 'SM', zonaNombre: 'Sin medir' }),
    a({ id: 'M1', zonaCode: 'MAL', zonaNombre: 'Con falla', estado: 'FUERA_SERVICIO' }),
    a({ id: 'M2', zonaCode: 'MAL', zonaNombre: 'Con falla' }),
    a({ id: 'X1', zonaCode: null, zonaNombre: null }),
  ]).zonas;

  it('primero lo que duele, y «sin zona» siempre al final', () => {
    expect(set().map((z) => z.code)).toEqual(['MAL', 'SM', 'BIEN', '']);
  });

  it('a igualdad de estado, las zonas vitales van delante', () => {
    const z = zonasDelTren([
      a({ id: 'N1', zonaCode: 'NORM', zonaNombre: 'Normal', estado: 'FUERA_SERVICIO' }),
      a({ id: 'V1', zonaCode: 'VIT', zonaNombre: 'Vital', estado: 'FUERA_SERVICIO', zonaVital: true }),
    ]).zonas;
    expect(z[0].code).toBe('VIT');
  });
});

describe('las frases', () => {
  it('dicen el efecto primero', () => {
    const { zonas } = zonasDelTren([
      a({ id: 'C1', estado: 'FUERA_SERVICIO' }), a({ id: 'C2' }),
    ]);
    expect(zonas[0].queDice).toMatch(/^1 cámara sin imagen de 2\./);
  });

  it('avisan de la zona vital y de las subidas', () => {
    const { zonas } = zonasDelTren([
      a({ id: 'C1', estado: 'FUERA_SERVICIO', zonaVital: true, exigeElevador: true }),
    ]);
    expect(zonas[0].queDice).toContain('zona vital');
    expect(zonas[0].queDice).toContain('1 subida con manlift');
  });

  it('singular y plural, sin «(s)»', () => {
    const { zonas } = zonasDelTren([a({ id: 'C1' })]);
    expect(zonas[0].queDice).toBe('La cámara ve bien.');
    expect(JSON.stringify(zonas)).not.toContain('(s)');
  });

  it('no usa jerga de redes', () => {
    const { zonas } = zonasDelTren([a({ id: 'C1', estado: 'FUERA_SERVICIO' })]);
    const t = zonas[0].queDice.toLowerCase();
    for (const j of ['uplink', 'vlan', 'poe', 'nvr', 'switchport']) expect(t).not.toContain(j);
  });
});

describe('el titular del tren', () => {
  const totales = (act: ActivoDeZona[]) => zonasDelTren(act).totales;

  it('sin nada registrado lo dice', () => {
    expect(titularDelTren('Tren 1', totales([]))).toContain('Todavía no hay nada');
  });

  it('con cámaras caídas, ése es el titular', () => {
    const t = titularDelTren('Tren 1', totales([
      a({ id: 'C1', estado: 'FUERA_SERVICIO' }), a({ id: 'C2' }),
    ]));
    expect(t).toBe('1 cámara sin imagen en Tren 1.');
  });

  it('con equipos pero sin cámaras avisa de que no se mide nada', () => {
    const t = titularDelTren('Tren 3', totales([a({ id: 'SW1', tipo: 'SWITCH' })]));
    expect(t).toContain('no se está midiendo nada');
  });

  it('todo bien pero con una zona sin cámaras: no dice «vista completa»', () => {
    const t = titularDelTren('Tren 2', totales([
      a({ id: 'C1' }),
      a({ id: 'SW1', tipo: 'SWITCH', zonaCode: 'OTRA', zonaNombre: 'Otra' }),
    ]));
    // Singular correcto: «1 zona no tiene cámaras», no «no tienen».
    expect(t).toContain('1 zona no tiene cámaras');
    expect(t).not.toContain('vista completa');
  });

  it('todo medido y todo viendo', () => {
    const t = titularDelTren('Tren 1', totales([a({ id: 'C1' }), a({ id: 'C2' })]));
    expect(t).toContain('vista completa');
  });
});

describe('nombres en castellano de planta', () => {
  it('traduce los tipos y respeta el plural', () => {
    expect(nombreDeTipo('WIRELESS', 1)).toBe('antena');
    expect(nombreDeTipo('WIRELESS', 3)).toBe('antenas');
    expect(nombreDeTipo('NVR', 2)).toBe('grabadores');
    expect(nombreDeTipo('DESCONOCIDO', 2)).toBe('equipos');
  });
});

describe('rendimiento', () => {
  it('aguanta un tren de 800 activos', () => {
    const muchos = Array.from({ length: 800 }, (_, i) => a({
      id: `A${i}`, zonaCode: `Z${i % 12}`, zonaNombre: `Zona ${i % 12}`,
      tipo: i % 3 ? 'CAMERA' : 'SWITCH',
      estado: i % 17 ? 'OPERATIVO' : 'FUERA_SERVICIO',
    }));
    const t0 = Date.now();
    const { zonas, totales } = zonasDelTren(muchos);
    expect(Date.now() - t0).toBeLessThan(500);
    expect(zonas).toHaveLength(12);
    expect(totales.activos).toBe(800);
  });
});
