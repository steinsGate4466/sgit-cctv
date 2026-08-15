/* =============================================================================
   SI SE CAE ESTE TABLERO, ¿QUÉ SE APAGA? — bloque 31
   -----------------------------------------------------------------------------
   La respuesta decide si alguien coge el manlift a las tres de la mañana, y
   sobre todo si hay que avisar a Producción antes de que llame el púlpito.
============================================================================= */
import {
  tablerosAfectados, calcularImpacto, TableroNodo, EquipoAlimentado, ColgadosDeSwitch,
} from '../src/modules/electricidad/impacto-tablero';

const arbol: TableroNodo[] = [
  { id: 'gen', codigo: 'TAB-GEN', nombre: 'General', alimentadoDeId: null },
  { id: 'mcc', codigo: 'TAB-T2-MCC-01', nombre: 'MCC Tren 2', alimentadoDeId: 'gen' },
  { id: 'sub', codigo: 'TAB-T2-SUB-01', nombre: 'Subtablero lecho', alimentadoDeId: 'mcc' },
  { id: 'otro', codigo: 'TAB-T1-MCC-01', nombre: 'MCC Tren 1', alimentadoDeId: 'gen' },
];

const eq = (id: string, tipo: string, tableroId: string, vital = false, zona?: string): EquipoAlimentado =>
  ({ id, assetCode: id.toUpperCase(), tipo, tableroId, zonaVital: vital, zonaNombre: zona });

describe('la cadena de tableros', () => {
  it('arrastra a los de aguas abajo', () => {
    const r = tablerosAfectados('mcc', arbol).map((t) => t.id);
    expect(r).toEqual(['mcc', 'sub']);
  });

  it('el general se lleva la planta entera', () => {
    expect(tablerosAfectados('gen', arbol).map((t) => t.id).sort())
      .toEqual(['gen', 'mcc', 'otro', 'sub']);
  });

  it('una hoja no arrastra a nadie', () => {
    expect(tablerosAfectados('sub', arbol).map((t) => t.id)).toEqual(['sub']);
  });

  it('NO sube hacia arriba: el subtablero no apaga a su padre', () => {
    expect(tablerosAfectados('sub', arbol).map((t) => t.id)).not.toContain('mcc');
  });

  it('un ciclo por dato corrupto no cuelga el servidor', () => {
    const ciclo: TableroNodo[] = [
      { id: 'a', codigo: 'A', nombre: 'A', alimentadoDeId: 'b' },
      { id: 'b', codigo: 'B', nombre: 'B', alimentadoDeId: 'a' },
    ];
    const r = tablerosAfectados('a', ciclo);
    expect(r.length).toBe(2);
  });

  it('un tablero que no existe devuelve vacío, no revienta', () => {
    expect(tablerosAfectados('fantasma', arbol)).toEqual([]);
  });
});

describe('qué se apaga de verdad', () => {
  const colgados: ColgadosDeSwitch = new Map([
    ['sw1', [eq('cam9', 'CAMERA', 'otro', true, 'Salida del horno'), eq('cam10', 'CAMERA', 'otro')]],
  ]);

  it('suma lo directo, la cascada eléctrica y la de red', () => {
    const alimentados = [
      eq('sw1', 'SWITCH', 'mcc'),
      eq('cam1', 'CAMERA', 'mcc'),
      eq('cam2', 'CAMERA', 'sub'),
      eq('cam99', 'CAMERA', 'otro'),   // otro tablero: NO se apaga
    ];
    const r = calcularImpacto(['mcc', 'sub'], alimentados, colgados);
    expect(r.directos.map((d) => d.id).sort()).toEqual(['cam1', 'cam2', 'sw1']);
    expect(r.porRed.map((d) => d.id).sort()).toEqual(['cam10', 'cam9']);
    expect(r.total).toBe(5);
    expect(r.camaras).toBe(4);
  });

  it('LO QUE MÁS SORPRENDE: cámaras de otro tablero se apagan por quedarse sin switch', () => {
    // cam9 cuelga eléctricamente de «otro», que sigue con luz. Se apaga igual
    // porque su switch estaba en el tablero que cayó. Es el caso que la gente
    // subestima y el que hace que el técnico vuelva a subir dos veces.
    const r = calcularImpacto(['mcc'], [eq('sw1', 'SWITCH', 'mcc')], colgados);
    expect(r.porRed.map((d) => d.id)).toContain('cam9');
    expect(r.titular).toContain('sin switch');
  });

  it('no cuenta dos veces al equipo que está alimentado Y colgado del switch', () => {
    const dobles: ColgadosDeSwitch = new Map([['sw1', [eq('cam1', 'CAMERA', 'mcc')]]]);
    const r = calcularImpacto(['mcc'], [eq('sw1', 'SWITCH', 'mcc'), eq('cam1', 'CAMERA', 'mcc')], dobles);
    expect(r.total).toBe(2);
    expect(r.porRed).toHaveLength(0);
  });

  it('el titular nombra las ZONAS VITALES, que es lo que importa', () => {
    const r = calcularImpacto(['mcc'], [eq('sw1', 'SWITCH', 'mcc')], colgados);
    expect(r.zonasVitalesAfectadas).toEqual(['Salida del horno']);
    expect(r.titular).toContain('Salida del horno');
  });

  it('sin zonas vitales el titular no las menciona', () => {
    const r = calcularImpacto(['mcc'], [eq('cam1', 'CAMERA', 'mcc')], new Map());
    expect(r.zonasVitalesAfectadas).toHaveLength(0);
    expect(r.titular).not.toContain('vital');
  });

  it('un tablero sin nada colgado lo dice, y sugiere que falten circuitos', () => {
    const r = calcularImpacto(['mcc'], [], new Map());
    expect(r.total).toBe(0);
    expect(r.titular).toContain('falte cargar los circuitos');
  });

  it('avisa de cuántos tableros arrastra', () => {
    const r = calcularImpacto(['mcc', 'sub'], [eq('cam1', 'CAMERA', 'mcc')], new Map());
    expect(r.titular).toContain('1 tablero(s) aguas abajo');
  });
});
