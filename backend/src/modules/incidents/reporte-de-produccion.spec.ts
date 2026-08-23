import {
  EntradaDeReporte,
  IncidenciaDelActivo,
  firmaDeQuienReporta,
  reporteDeProduccion,
} from './reporte-de-produccion';

const AHORA = new Date('2026-08-23T14:00:00Z');
const haceMin = (m: number) => new Date(AHORA.getTime() - m * 60_000);

const base = (o: Partial<EntradaDeReporte> = {}): EntradaDeReporte => ({
  activoCodigo: 'AA-CAM-T1-FX-007',
  activoNombre: 'Cámara del lecho de enfriamiento',
  zonaEscrita: null,
  quienReportaId: 'u-canasas',
  quienReportaNombre: 'Ing. Cañasas',
  trenNombre: 'Tren 1',
  criticidadZona: 'MEDIA',
  incidenciasDelActivo: [],
  ahora: AHORA,
  ...o,
});

const viva = (o: Partial<IncidenciaDelActivo> = {}): IncidenciaDelActivo => ({
  id: 'inc-1',
  code: 'INC-2026-0042',
  estado: 'ABIERTA',
  reportadaEn: haceMin(35),
  resueltaEn: null,
  prioridad: 'MEDIA',
  yaAvisaronIds: ['u-otro'],
  ...o,
});

describe('abrir o sumarse: la decisión que ahorra papeleo al técnico', () => {
  it('sin nada abierto, abre una incidencia nueva', () => {
    const r = reporteDeProduccion(base());
    expect(r.decision).toBe('NUEVA');
    expect(r.incidenciaId).toBeNull();
    expect(r.vecesReportada).toBe(1);
    expect(r.respuesta).toContain('El técnico de turno');
  });

  it('con una abierta del mismo activo, se suma en vez de duplicar', () => {
    const r = reporteDeProduccion(base({ incidenciasDelActivo: [viva()] }));
    expect(r.decision).toBe('SE_SUMA');
    expect(r.incidenciaCodigo).toBe('INC-2026-0042');
    expect(r.vecesReportada).toBe(2);
    expect(r.respuesta).toContain('van 2');
    expect(r.respuesta).toContain('hace 35 minutos');
  });

  it.each(['ABIERTA', 'EN_DIAGNOSTICO', 'EN_PROCESO', 'EN_ESPERA'])(
    'una incidencia en %s sigue viva: el aviso se suma',
    (estado) => {
      const r = reporteDeProduccion(base({ incidenciasDelActivo: [viva({ estado })] }));
      expect(r.decision).toBe('SE_SUMA');
    },
  );

  it('el mismo dedo dos veces no cuenta como dos personas sin ver', () => {
    /* En el púlpito, con el celular y mala señal, tocar «enviar» dos veces es
       lo normal. Si eso inflara el contador, el único número nuevo que aporta
       este módulo dejaría de valer. */
    const r = reporteDeProduccion(base({
      incidenciasDelActivo: [viva({ yaAvisaronIds: ['u-otro', 'u-canasas'] })],
    }));
    expect(r.decision).toBe('YA_LO_REPORTASTE');
    expect(r.vecesReportada).toBe(2);          // sigue en 2, no sube a 3
    expect(r.respuesta).toContain('Ya lo reportaste');
    expect(r.respuesta).toContain('INC-2026-0042');
  });
});

describe('la reparación que no funcionó', () => {
  it('cerrada hace poco y vuelve a caer: incidencia nueva y marcada', () => {
    /* Sumarla a la anterior la reabriría en silencio y nadie contaría que el
       arreglo falló. Ese conteo es lo que después alimenta gestión de
       problemas. */
    const r = reporteDeProduccion(base({
      incidenciasDelActivo: [viva({
        estado: 'CERRADA', resueltaEn: haceMin(120), yaAvisaronIds: ['u-otro'],
      })],
    }));
    expect(r.decision).toBe('NUEVA');
    expect(r.reaparecio).toBe(true);
    expect(r.reaparecioTrasMin).toBe(120);
    expect(r.respuesta).toContain('volvió a caer');
  });

  it('cerrada hace un mes es una falla distinta, no una reaparición', () => {
    const r = reporteDeProduccion(base({
      incidenciasDelActivo: [viva({
        estado: 'CERRADA', resueltaEn: haceMin(40 * 24 * 60),
      })],
    }));
    expect(r.decision).toBe('NUEVA');
    expect(r.reaparecio).toBe(false);
  });

  it('RESUELTA no se considera viva: si sigue sin ver, es incidencia aparte', () => {
    const r = reporteDeProduccion(base({
      incidenciasDelActivo: [viva({ estado: 'RESUELTA', resueltaEn: haceMin(30) })],
    }));
    expect(r.decision).toBe('NUEVA');
    expect(r.reaparecio).toBe(true);
  });
});

describe('la prioridad se deriva, no se inventa', () => {
  it('zona crítica entra como ALTA, no como CRÍTICA', () => {
    /* CRÍTICA despierta gente de madrugada. Esa decisión la toma una persona
       mirando la planta, no una tabla. */
    const r = reporteDeProduccion(base({ criticidadZona: 'CRITICA' }));
    expect(r.prioridad).toBe('ALTA');
    expect(r.prioridadPorque).toContain('lo decide una persona');
  });

  it.each([
    ['ALTA', 'ALTA'],
    ['MEDIA', 'MEDIA'],
    ['BAJA', 'BAJA'],
  ] as const)('zona %s da prioridad %s', (zona, esperada) => {
    expect(reporteDeProduccion(base({ criticidadZona: zona })).prioridad).toBe(esperada);
  });

  it('zona sin criticidad declarada: MEDIA y lo dice, no supone BAJA', () => {
    const r = reporteDeProduccion(base({ criticidadZona: null }));
    expect(r.prioridad).toBe('MEDIA');
    expect(r.prioridadPorque).toContain('Nadie declaró');
  });

  it('al sumarse NO toca la prioridad de la incidencia abierta', () => {
    const r = reporteDeProduccion(base({
      criticidadZona: 'CRITICA',
      incidenciasDelActivo: [viva({ prioridad: 'BAJA' })],
    }));
    expect(r.prioridad).toBe('BAJA');
  });

  it('al tercer aviso lo SUGIERE, pero no la sube solo', () => {
    const r = reporteDeProduccion(base({
      incidenciasDelActivo: [viva({ prioridad: 'MEDIA', yaAvisaronIds: ['a', 'b'] })],
    }));
    expect(r.vecesReportada).toBe(3);
    expect(r.sugiereSubirPrioridad).toBe(true);
    expect(r.prioridad).toBe('MEDIA');   // sigue igual: la propuesta sugiere
  });

  it('si ya está en ALTA no sugiere nada', () => {
    const r = reporteDeProduccion(base({
      incidenciasDelActivo: [viva({ prioridad: 'ALTA', yaAvisaronIds: ['a', 'b', 'c'] })],
    }));
    expect(r.sugiereSubirPrioridad).toBe(false);
  });
});

describe('el título, que es lo que lee el técnico en la bandeja', () => {
  it('lleva el código y la zona que escribió Producción', () => {
    const r = reporteDeProduccion(base({ zonaEscrita: 'Lecho de enfriamiento' }));
    expect(r.titulo).toBe('Sin visión: AA-CAM-T1-FX-007 — Lecho de enfriamiento');
  });

  it('sin zona escrita cae al nombre del activo', () => {
    expect(reporteDeProduccion(base()).titulo)
      .toBe('Sin visión: AA-CAM-T1-FX-007 — Cámara del lecho de enfriamiento');
  });

  it('sin zona ni nombre queda sólo el código, sin guion suelto', () => {
    const r = reporteDeProduccion(base({ activoNombre: null }));
    expect(r.titulo).toBe('Sin visión: AA-CAM-T1-FX-007');
    expect(r.titulo).not.toContain('—');
  });

  it('una zona en blanco se trata como no escrita', () => {
    const r = reporteDeProduccion(base({ zonaEscrita: '   ', activoNombre: null }));
    expect(r.titulo).toBe('Sin visión: AA-CAM-T1-FX-007');
  });

  it('no usa jerga técnica: lo escribe alguien de Producción', () => {
    const r = reporteDeProduccion(base({ zonaEscrita: 'Púlpito' }));
    const t = `${r.titulo} ${r.respuesta} ${r.prioridadPorque}`.toLowerCase();
    for (const j of ['nvr', 'vlan', 'poe', 'switch', 'uplink', 'ip ']) {
      expect(t).not.toContain(j);
    }
  });
});

describe('la firma de quien reporta', () => {
  it('dice quién y de qué tren', () => {
    /* «Hay una cámara caída» no mueve a nadie. «El Ing. Cañasas, del Tren 1,
       no está viendo» sí. */
    expect(firmaDeQuienReporta('Ing. Cañasas', 'Tren 1')).toBe('Reportó Ing. Cañasas · Tren 1');
  });

  it('sin tren derivado no inventa uno', () => {
    expect(firmaDeQuienReporta('Ing. Cañasas', null)).toBe('Reportó Ing. Cañasas');
  });
});
