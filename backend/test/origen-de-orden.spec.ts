/* Bloque 164 · «43 preventivas, 37 correctivos: eso debe salir de las OM registradas». */
import { condicionDeOrigen, esDeDemo, origenDeOrden, repartoDeTrabajo } from '../src/modules/indicadores/calculo';
import { autogenApagadaPorEntorno } from '../src/modules/preventive/autogen-entorno';

/** Aplica a mano la condición de Prisma sobre una fila: si discrepara de `origenDeOrden`, la lista de Órdenes no cuadraría con el indicador. */
function cumple(c: any, f: any): boolean {
  if (c.NOT) return !c.NOT.some((x: any) => cumple(x, f));
  return Object.entries(c).every(([k, v]: any) =>
    v && typeof v === 'object' && 'not' in v ? f[k] !== v.not : f[k] === v);
}

describe('origen de cada orden', () => {
  const filas = [
    { type: 'PREVENTIVO', createdById: null, requestChannel: null, incidentId: null }, // programador
    { type: 'PREVENTIVO', createdById: 'u1', requestChannel: null, incidentId: null }, // a mano
    { type: 'CORRECTIVO', createdById: null, requestChannel: null, incidentId: 'i1' }, // de incidencia
    { type: 'CORRECTIVO', createdById: 'u1', requestChannel: 'WHATSAPP', incidentId: null },
    { type: 'PREVENTIVO', createdById: null, requestChannel: 'RADIO', incidentId: null }, // pedida por radio
    { type: 'PREVENTIVO', createdById: null, requestChannel: null, incidentId: 'i2' },
  ];

  it('clasifica automática / incidencia / manual', () => {
    expect(filas.map((f) => origenDeOrden({ tipo: f.type, ...f }))).toEqual(
      ['AUTOMATICA', 'MANUAL', 'INCIDENCIA', 'MANUAL', 'MANUAL', 'INCIDENCIA']);
  });

  it('el filtro de Órdenes elige EXACTAMENTE las mismas que el indicador', () => {
    for (const o of ['AUTOMATICA', 'INCIDENCIA', 'MANUAL'] as const) {
      const c = condicionDeOrigen(o);
      filas.forEach((f) => expect(cumple(c, f)).toBe(origenDeOrden({ tipo: f.type, ...f }) === o));
    }
  });

  it('el reparto desglosa el origen y avisa si casi todo lo programó el sistema', () => {
    const om = (tipo: string, origen: any, demo = false) => ({ id: Math.random().toString(), tipo, estado: 'ABIERTA', creada: new Date(), origen, demo });
    const r = repartoDeTrabajo([
      ...Array.from({ length: 30 }, () => om('PREVENTIVO', 'AUTOMATICA')),
      ...Array.from({ length: 13 }, () => om('PREVENTIVO', 'MANUAL')),
      ...Array.from({ length: 37 }, (_, i) => om('CORRECTIVO', i < 5 ? 'INCIDENCIA' : 'MANUAL', i < 2)),
    ]);
    expect(r.preventivo).toBe(43);
    expect(r.origen.preventivo).toEqual({ AUTOMATICA: 30, INCIDENCIA: 0, MANUAL: 13 });
    expect(r.origen.correctivo).toEqual({ AUTOMATICA: 0, INCIDENCIA: 5, MANUAL: 32 });
    expect(r.demo).toBe(2);
    expect(r.lectura).toMatch(/30 de las 43 preventivas las generó el sistema/);
  });

  it('sin órdenes, el desglose existe y en cero', () => {
    const r = repartoDeTrabajo([]);
    expect(r.pct).toBeNull();
    expect(r.origen.preventivo.AUTOMATICA).toBe(0);
  });

  it('marca lo de demostración por el código de la OM o del equipo', () => {
    expect(esDeDemo('DEMO-OM-0001', null)).toBe(true);
    expect(esDeDemo('OM-2026-0040', 'DEMO-CAM-T1-01')).toBe(true);
    expect(esDeDemo('OM-2026-0040', 'AA-CAM-T1-001')).toBe(false);
  });
});

describe('PREVENTIVE_AUTOGEN en el .env', () => {
  it.each(['off', 'false', 'FALSE', '0', 'no', ' Off '])('«%s» apaga', (v) => expect(autogenApagadaPorEntorno(v)).toBe(true));
  it.each([undefined, 'on', 'true', '1'])('«%s» deja encendido', (v) => expect(autogenApagadaPorEntorno(v as any)).toBe(false));
});
