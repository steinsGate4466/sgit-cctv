import {
  soportesDeCamaras, cadenaDeCamara, resumirDependencias, nombreDeSector, papelDe,
  EquipoParaDependencias, EnlaceParaDependencias,
} from './dependencias';

/**
 * Planta de prueba, la misma en casi todos los casos:
 *
 *      CAM1 ─┐
 *      CAM2 ─┼─ ANT (con FUENTE dentro) ── SW ── NVR
 *      CAM3 ─┘
 *      CAM4 ─────────────────────────────── SW
 *      CAM5  (suelta: sin ningún enlace)
 */
const eq = (
  id: string, tipo: string, o: Partial<EquipoParaDependencias> = {},
): EquipoParaDependencias => ({
  id, codigo: id, tipo, estado: 'OPERATIVO', sector: 'T2', lugar: null, ...o,
});

const PLANTA: EquipoParaDependencias[] = [
  eq('NVR', 'NVR'),
  eq('SW', 'SWITCH'),
  eq('ANT', 'WIRELESS'),
  eq('PSU', 'PSU', { parteDeId: 'ANT' }),
  eq('CAM1', 'CAMERA'),
  eq('CAM2', 'CAMERA'),
  eq('CAM3', 'CAMERA'),
  eq('CAM4', 'CAMERA'),
  eq('CAM5', 'CAMERA'),
];

const CABLES: EnlaceParaDependencias[] = [
  { a: 'NVR', b: 'SW' },
  { a: 'SW', b: 'ANT' },
  { a: 'ANT', b: 'CAM1' },
  { a: 'ANT', b: 'CAM2' },
  { a: 'ANT', b: 'CAM3' },
  { a: 'SW', b: 'CAM4' },
];

const buscar = (id: string) => (s: { id: string }) => s.id === id;

describe('de qué depende cada cámara', () => {
  it('la antena se lleva sólo las tres que cuelgan de ella', () => {
    const s = soportesDeCamaras(PLANTA, CABLES);
    const ant = s.find(buscar('ANT'))!;
    expect(ant.camaras.map((c) => c.codigo)).toEqual(['CAM1', 'CAM2', 'CAM3']);
    // CAM4 va directa al switch: la antena no la toca.
    expect(ant.camaras.map((c) => c.codigo)).not.toContain('CAM4');
  });

  it('el switch se lleva las cuatro, porque todo pasa por él', () => {
    const sw = soportesDeCamaras(PLANTA, CABLES).find(buscar('SW'))!;
    expect(sw.camaras).toHaveLength(4);
  });

  it('la cámara suelta no se le imputa a nadie', () => {
    /* CAM5 no llega al grabador NI ANTES ni después de cualquier caída. Si se
       contase, todos los equipos aparecerían con una cámara de más y el
       número dejaría de creerse. */
    for (const s of soportesDeCamaras(PLANTA, CABLES)) {
      expect(s.camaras.map((c) => c.codigo)).not.toContain('CAM5');
    }
  });

  it('ordena por daño: grabador y switch arriba, antena después', () => {
    /* El GRABADOR sale primero y no es un fallo del cálculo: en una planta con
       un solo NVR, ese NVR es el punto único de fallo y se lleva las cuatro
       cámaras por delante. Que aparezca arriba del todo es exactamente la
       información que Producción necesita para justificar un segundo
       grabador — y es un dato que hoy nadie tiene escrito en ningún sitio. */
    const s = soportesDeCamaras(PLANTA, CABLES);
    expect(s.map((x) => x.id).slice(0, 3)).toEqual(['NVR', 'SW', 'ANT']);
    expect(s[0].camaras).toHaveLength(4);
    expect(s[2].camaras).toHaveLength(3);
  });

  it('con dos grabadores, ninguno es ya el punto único de fallo', () => {
    /* La otra cara del caso anterior: en cuanto hay un segundo grabador con su
       propio camino, el primero deja de llevarse todo por delante. Sirve para
       comprobar que el cálculo mide redundancia de verdad y no cuenta vecinos. */
    const dos = [...PLANTA, eq('NVR2', 'NVR')];
    const cables = [...CABLES, { a: 'NVR2', b: 'SW' }];
    const s = soportesDeCamaras(dos, cables);
    expect(s.find(buscar('NVR'))).toBeUndefined();  // ya no sostiene nada
    expect(s[0].id).toBe('SW');                      // ahora el cuello es el switch
  });

  it('una cámara nunca es soporte de otra', () => {
    const s = soportesDeCamaras(PLANTA, CABLES);
    expect(s.some((x) => papelDe(PLANTA.find((p) => p.id === x.id)!.tipo) === 'CAMARA'))
      .toBe(false);
  });

  it('la fuente sale DENTRO de la antena, no como un salto suelto', () => {
    const s = soportesDeCamaras(PLANTA, CABLES);
    expect(s.find(buscar('PSU'))).toBeUndefined();
    const ant = s.find(buscar('ANT'))!;
    expect(ant.piezas.map((p) => p.codigo)).toEqual(['PSU']);
    expect(ant.piezas[0].siFalla).toContain('se apaga entera');
  });

  it('sin grabador no inventa nada: devuelve vacío', () => {
    /* Si se marcase todo como caído, la pantalla sería una alarma roja falsa
       el primer día, antes de cargar el primer NVR. Sin datos, nunca cero. */
    const sinNvr = PLANTA.filter((e) => e.tipo !== 'NVR');
    expect(soportesDeCamaras(sinNvr, CABLES)).toEqual([]);
  });

  it('no lista equipos que no sostienen nada', () => {
    const conHuerfano = [...PLANTA, eq('SW-VACIO', 'SWITCH')];
    const s = soportesDeCamaras(conHuerfano, CABLES);
    expect(s.find(buscar('SW-VACIO'))).toBeUndefined();
  });
});

describe('el anillo de fibra', () => {
  /*      NVR ── SW-A ── SW-B ── NVR   (anillo: hay dos caminos)
                          └── CAM     */
  const NODOS: EquipoParaDependencias[] = [
    eq('NVR', 'NVR'), eq('SW-A', 'SWITCH'), eq('SW-B', 'SWITCH'), eq('CAM', 'CAMERA'),
  ];
  const ANILLO: EnlaceParaDependencias[] = [
    { a: 'NVR', b: 'SW-A', esAnillo: true },
    { a: 'SW-A', b: 'SW-B', esAnillo: true },
    { a: 'SW-B', b: 'NVR', esAnillo: true },
    { a: 'SW-B', b: 'CAM' },
  ];

  it('un switch del anillo no se lleva ninguna cámara', () => {
    /* Contando cables, quitar SW-A parecería dejar sin imagen a lo que sigue.
       Contando dependencia real sale cero: el tráfico da la vuelta. */
    const a = soportesDeCamaras(NODOS, ANILLO).find(buscar('SW-A'))!;
    expect(a.camaras).toHaveLength(0);
    expect(a.salvadoPorAnillo).toBe(true);
    expect(a.siCae).toContain('anillo');
  });

  it('el switch del que cuelga la cámara sí se la lleva, anillo o no', () => {
    const b = soportesDeCamaras(NODOS, ANILLO).find(buscar('SW-B'))!;
    expect(b.camaras).toHaveLength(1);
    expect(b.salvadoPorAnillo).toBe(false);
  });
});

describe('las frases que lee Producción', () => {
  it('dice el efecto primero y agrupa por sector', () => {
    const mixto = [
      eq('NVR', 'NVR'), eq('SW', 'SWITCH'),
      eq('C1', 'CAMERA', { sector: 'T1' }),
      eq('C2', 'CAMERA', { sector: 'T2' }),
      eq('C3', 'CAMERA', { sector: 'T2' }),
    ];
    const cables = [
      { a: 'NVR', b: 'SW' }, { a: 'SW', b: 'C1' }, { a: 'SW', b: 'C2' }, { a: 'SW', b: 'C3' },
    ];
    const sw = soportesDeCamaras(mixto, cables).find(buscar('SW'))!;
    expect(sw.siCae).toBe(
      'Si se cae este switch, se dejan de ver 2 cámaras de Tren 2 y 1 cámara de Tren 1.',
    );
  });

  it('no usa jerga de redes en la explicación', () => {
    const s = soportesDeCamaras(PLANTA, CABLES);
    const texto = s.map((x) => `${x.siCae} ${x.comoFunciona}`).join(' ').toLowerCase();
    for (const jerga of ['uplink', 'vlan', 'poe', 'wireless', 'nvr', 'ip ', 'switchport']) {
      expect(texto).not.toContain(jerga);
    }
  });

  it('traduce las siglas de sector a lo que se dice en planta', () => {
    expect(nombreDeSector('T2')).toBe('Tren 2');
    expect(nombreDeSector('OFI')).toBe('Oficinas');
    expect(nombreDeSector('GRU')).toBe('Grúas');
    expect(nombreDeSector(null)).toBe('sin sector asignado');
  });

  it('singular y plural, sin «(s)»', () => {
    const uno = [eq('NVR', 'NVR'), eq('SW', 'SWITCH'), eq('C1', 'CAMERA')];
    const sw = soportesDeCamaras(uno, [{ a: 'NVR', b: 'SW' }, { a: 'SW', b: 'C1' }])
      .find(buscar('SW'))!;
    expect(sw.siCae).toContain('1 cámara de');
    expect(sw.siCae).not.toContain('(s)');
  });
});

describe('el camino de una cámara hasta el grabador', () => {
  it('va de la cámara al grabador, en ese orden', () => {
    const c = cadenaDeCamara('CAM1', PLANTA, CABLES);
    expect(c.llegaAlGrabador).toBe(true);
    expect(c.eslabones.map((e) => e.codigo)).toEqual(['CAM1', 'ANT', 'SW', 'NVR']);
  });

  it('arrastra la fuente dentro del eslabón de la antena', () => {
    const c = cadenaDeCamara('CAM1', PLANTA, CABLES);
    const ant = c.eslabones.find((e) => e.codigo === 'ANT')!;
    expect(ant.piezas.map((p) => p.codigo)).toEqual(['PSU']);
  });

  it('lo dice sin siglas', () => {
    const c = cadenaDeCamara('CAM1', PLANTA, CABLES);
    expect(c.resumen).toContain('cámara → antena → switch → grabador');
  });

  it('una cámara sin camino lo dice claro, no falla', () => {
    const c = cadenaDeCamara('CAM5', PLANTA, CABLES);
    expect(c.llegaAlGrabador).toBe(false);
    expect(c.eslabones).toEqual([]);
    expect(c.resumen).toContain('no tiene camino');
  });

  it('una cámara que no existe no revienta', () => {
    const c = cadenaDeCamara('NO-EXISTE', PLANTA, CABLES);
    expect(c.llegaAlGrabador).toBe(false);
    expect(c.resumen).toContain('no está en el sistema');
  });

  it('sin grabador lo explica en vez de dibujar un camino falso', () => {
    const sinNvr = PLANTA.filter((e) => e.tipo !== 'NVR');
    expect(cadenaDeCamara('CAM1', sinNvr, CABLES).resumen).toContain('ningún grabador');
  });
});

describe('el titular de la pantalla', () => {
  it('sin enlaces lo dice, no dice «todo bien»', () => {
    expect(resumirDependencias([])).toContain('no se puede decir');
  });

  it('si hay un soporte caído con cámaras, ése es el titular', () => {
    const rota = PLANTA.map((e) => (e.id === 'ANT' ? { ...e, estado: 'FUERA_SERVICIO' } : e));
    const t = resumirDependencias(soportesDeCamaras(rota, CABLES));
    expect(t).toContain('1 equipo está fallando');
    expect(t).toContain('3 cámaras dependen');
  });

  it('con todo operativo señala el equipo más crítico', () => {
    const t = resumirDependencias(soportesDeCamaras(PLANTA, CABLES));
    expect(t).toContain('Todo en orden');
    // El más crítico de esta planta es el único grabador. Ver la prueba de
    // orden más arriba: no es un error, es el punto único de fallo.
    expect(t).toContain('NVR');
    expect(t).toContain('4 cámaras dependen');
  });
});

describe('rendimiento', () => {
  it('aguanta una planta de 600 cámaras sin colgarse', () => {
    /* La comprobación que importa: `soportesDeCamaras` corre un recorrido por
       cada equipo de red. Si eso se va de las manos, la pantalla tarda y el
       jefe de tren deja de abrirla. */
    const grande: EquipoParaDependencias[] = [eq('NVR', 'NVR')];
    const cables: EnlaceParaDependencias[] = [];
    for (let s = 0; s < 20; s++) {
      grande.push(eq(`SW${s}`, 'SWITCH'));
      cables.push({ a: 'NVR', b: `SW${s}` });
      for (let c = 0; c < 30; c++) {
        grande.push(eq(`C${s}-${c}`, 'CAMERA'));
        cables.push({ a: `SW${s}`, b: `C${s}-${c}` });
      }
    }
    const t0 = Date.now();
    const s = soportesDeCamaras(grande, cables);
    expect(Date.now() - t0).toBeLessThan(4000);
    expect(s.find(buscar('SW0'))!.camaras).toHaveLength(30);
  });
});
