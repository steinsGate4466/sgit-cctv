import { arranqueDeDiagnostico, EntradaDeArranque } from './arranque-de-diagnostico';

/** Una cámara sana colgando de una antena con 5 vecinos que ven bien. */
const base = (o: Partial<EntradaDeArranque> = {}): EntradaDeArranque => ({
  codigo: 'AA-CAM-T1-FX-007',
  tipo: 'CAMERA',
  estado: 'FUERA_SERVICIO',
  soporteCodigo: 'ANT-T1-02',
  soportePapel: 'ANTENA',
  soporteEstado: 'OPERATIVO',
  vecinos: Array.from({ length: 5 }, (_, i) => ({
    id: `v${i}`, codigo: `CAM-0${i}`, estado: 'OPERATIVO',
  })),
  enTablero: false,
  tableroCodigo: null,
  medioAcceso: 'ESCALERA',
  alturaMetros: 2.5,
  ultimaCausa: null,
  ultimaFecha: null,
  fallasEn90Dias: 0,
  repuestoDisponible: 2,
  repuestoNombre: 'Cámara Hikvision DS-2CD',
  ...o,
});

const pista = (r: ReturnType<typeof arranqueDeDiagnostico>, clave: string) =>
  r.pistas.find((p) => p.clave === clave);

describe('el descarte, que es lo que ahorra el viaje', () => {
  it('vecinos sanos: el problema es local', () => {
    const r = arranqueDeDiagnostico(base());
    expect(r.veredicto).toBe('LOCAL');
    expect(r.queDescarta).toContain('los otros 5 equipos que cuelgan de ahí funcionan');
    expect(r.queDescarta).toContain('La antena está sana');
    expect(r.porDondeEmpezar).toContain('este equipo');
  });

  it('todos los vecinos caídos: ve al soporte, no subas aquí', () => {
    /* Éste es el viaje que se ahorra: sin esta frase el técnico sube al poste
       de la cámara y el problema estaba en la antena. */
    const r = arranqueDeDiagnostico(base({
      vecinos: Array.from({ length: 5 }, (_, i) => ({
        id: `v${i}`, codigo: `CAM-0${i}`, estado: 'FUERA_SERVICIO',
      })),
    }));
    expect(r.veredicto).toBe('COMPARTIDO');
    expect(r.queDescarta).toContain('No subas aquí');
    expect(r.queDescarta).toContain('6 equipos');   // los 5 vecinos + éste
    expect(r.porDondeEmpezar).toBe('Ve primero a ANT-T1-02.');
  });

  it('el soporte caído manda sobre el estado de los vecinos', () => {
    const r = arranqueDeDiagnostico(base({ soporteEstado: 'FUERA_SERVICIO' }));
    expect(r.veredicto).toBe('COMPARTIDO');
    expect(r.queDescarta).toContain('también está caído');
  });

  it('algunos caídos y otros no: NO adivina', () => {
    /* Decir «es local» aquí sería inventar. Se dice lo que se ve y se deja la
       decisión a quien está delante. */
    const r = arranqueDeDiagnostico(base({
      vecinos: [
        { id: 'a', codigo: 'CAM-01', estado: 'OPERATIVO' },
        { id: 'b', codigo: 'CAM-02', estado: 'FUERA_SERVICIO' },
      ],
    }));
    expect(r.veredicto).toBe('SIN_DETERMINAR');
    expect(r.queDescarta).toContain('los que fallan juntos');
  });

  it('sin enlace cargado lo dice y manda a arreglarlo', () => {
    const r = arranqueDeDiagnostico(base({ soporteCodigo: null }));
    expect(r.veredicto).toBe('SIN_DETERMINAR');
    expect(r.queDescarta).toContain('Falta registrar su enlace');
  });

  it('con soporte pero sin vecinos, no puede comparar', () => {
    const r = arranqueDeDiagnostico(base({ vecinos: [] }));
    expect(r.veredicto).toBe('SIN_DETERMINAR');
    expect(r.queDescarta).toContain('no se puede comparar');
  });

  it('singular correcto cuando hay un solo vecino', () => {
    const r = arranqueDeDiagnostico(base({
      vecinos: [{ id: 'a', codigo: 'CAM-01', estado: 'OPERATIVO' }],
    }));
    expect(r.queDescarta).toContain('el otro equipo que cuelga de ahí funciona');
  });
});

describe('lo que hay que preparar antes de salir', () => {
  it('el tablero eléctrico sale como peligro y el primero', () => {
    const r = arranqueDeDiagnostico(base({ enTablero: true, tableroCodigo: 'TAB-T1-03' }));
    expect(r.pistas[0].clave).toBe('BLOQUEO');
    expect(r.pistas[0].texto).toContain('TAB-T1-03');
    expect(r.pistas[0].texto).toContain('bloqueo y etiquetado');
    expect(r.exigePreparacion).toBe(true);
  });

  it('el manlift se avisa para reservarlo antes de ir', () => {
    const r = arranqueDeDiagnostico(base({ medioAcceso: 'MANLIFT' }));
    expect(pista(r, 'ELEVADOR')!.texto).toContain('Resérvalo antes de ir');
    expect(r.exigePreparacion).toBe(true);
  });

  it('acceso SIN DECLARAR no se asume «a pie»', () => {
    /* Suponerlo hace que alguien salga sin nada y se encuentre el equipo a
       ocho metros, de noche. */
    const r = arranqueDeDiagnostico(base({ medioAcceso: null }));
    expect(pista(r, 'ACCESO_SIN_DECLARAR')!.texto).toContain('no se sabe');
    expect(pista(r, 'ELEVADOR')).toBeUndefined();
  });

  it('desde 1,80 m es trabajo en altura', () => {
    expect(pista(arranqueDeDiagnostico(base({ alturaMetros: 1.8 })), 'ALTURA')).toBeDefined();
    expect(pista(arranqueDeDiagnostico(base({ alturaMetros: 1.7 })), 'ALTURA')).toBeUndefined();
  });

  it('sin nada que preparar, no lo marca', () => {
    /* Por debajo de 1,80 m y con escalera: nada que reservar ni bloquear.
       El fixture base está a 2,5 m, que SÍ es trabajo en altura. */
    const r = arranqueDeDiagnostico(base({ alturaMetros: 1.5 }));
    expect(r.exigePreparacion).toBe(false);
  });
});

describe('historial y reincidencia', () => {
  it('dice cuándo falló y por qué, en lenguaje normal', () => {
    const hace90 = new Date(Date.now() - 90 * 86400000);
    const r = arranqueDeDiagnostico(base({
      ultimaCausa: 'humedad en el prensaestopas', ultimaFecha: hace90,
    }));
    const p = pista(r, 'ULTIMA_CAUSA')!;
    expect(p.texto).toContain('hace 3 meses');
    expect(p.texto).toContain('humedad en el prensaestopas');
  });

  it('sin historial lo dice, no lo calla', () => {
    expect(pista(arranqueDeDiagnostico(base()), 'SIN_HISTORIAL')).toBeDefined();
  });

  it('tres fallas en 90 días deja de ser mala suerte', () => {
    const r = arranqueDeDiagnostico(base({ fallasEn90Dias: 3 }));
    expect(pista(r, 'REINCIDENTE')!.texto).toContain('causa raíz');
  });

  it('dos fallas todavía no levantan la bandera', () => {
    expect(pista(arranqueDeDiagnostico(base({ fallasEn90Dias: 2 })), 'REINCIDENTE'))
      .toBeUndefined();
  });
});

describe('repuesto', () => {
  it('con stock lo dice y da el nombre', () => {
    expect(pista(arranqueDeDiagnostico(base()), 'REPUESTO_HAY')!.texto)
      .toContain('Hay 2 repuestos en almacén: Cámara Hikvision');
  });

  it('sin stock avisa de que hoy no se resuelve', () => {
    const p = pista(arranqueDeDiagnostico(base({ repuestoDisponible: 0 })), 'REPUESTO_CERO')!;
    expect(p.tono).toBe('PELIGRO');
    expect(p.texto).toContain('no se resuelve hoy');
  });

  it('«no consta» es distinto de «no hay»', () => {
    /* Cero significa que se buscó y no había. Null significa que nadie lo
       registró. Confundirlos manda al técnico a por un repuesto que quizá
       existe, o le hace desistir de uno que sí está. */
    const r = arranqueDeDiagnostico(base({ repuestoDisponible: null }));
    expect(pista(r, 'REPUESTO_SIN_SABER')).toBeDefined();
    expect(pista(r, 'REPUESTO_CERO')).toBeUndefined();
  });
});

describe('cómo se presenta', () => {
  it('lo peligroso va primero: se lee de arriba abajo y se para', () => {
    const r = arranqueDeDiagnostico(base({
      enTablero: true, tableroCodigo: 'TAB-1', medioAcceso: 'MANLIFT',
      repuestoDisponible: 3,
    }));
    const tonos = r.pistas.map((p) => p.tono);
    expect(tonos[0]).toBe('PELIGRO');
    expect(tonos[tonos.length - 1]).toBe('BIEN');
  });

  it('no usa jerga de redes: lo lee un técnico con prisa, no un ingeniero', () => {
    const r = arranqueDeDiagnostico(base({ enTablero: true, tableroCodigo: 'TAB-1' }));
    const t = `${r.queDescarta} ${r.porDondeEmpezar} ${r.pistas.map((p) => p.texto).join(' ')}`
      .toLowerCase();
    for (const j of ['uplink', 'vlan', 'poe', 'cidr', 'switchport', 'subred']) {
      expect(t).not.toContain(j);
    }
  });

  it('siempre da un primer paso, aunque no sepa nada', () => {
    const r = arranqueDeDiagnostico(base({ soporteCodigo: null }));
    expect(r.porDondeEmpezar.length).toBeGreaterThan(10);
  });
});
