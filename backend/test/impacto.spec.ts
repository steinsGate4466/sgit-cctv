import {
  alcanzables, impactoDeCaida, impactoDeCorte, porDanoPotencial, GrafoRed,
} from '../src/modules/network/impacto';

/**
 * El caso de planta, simplificado pero con su forma real:
 *
 *   NVR ── SW-CORE ── SW-T2 ── CAM-1, CAM-2, CAM-3
 *                  └─ SW-T1 ── CAM-4
 *
 * Y una cámara suelta (CAM-9) que nunca se cableó.
 */
const esCamara = (id: string) => id.startsWith('CAM');

const planta: GrafoRed = {
  nodos: ['NVR', 'SW-CORE', 'SW-T1', 'SW-T2', 'CAM-1', 'CAM-2', 'CAM-3', 'CAM-4', 'CAM-9'],
  raices: ['NVR'],
  enlaces: [
    { a: 'NVR', b: 'SW-CORE' },
    { a: 'SW-CORE', b: 'SW-T1' },
    { a: 'SW-CORE', b: 'SW-T2' },
    { a: 'SW-T2', b: 'CAM-1' },
    { a: 'SW-T2', b: 'CAM-2' },
    { a: 'SW-T2', b: 'CAM-3' },
    { a: 'SW-T1', b: 'CAM-4' },
  ],
};

describe('alcanzables', () => {
  it('lo que llega al grabador', () => {
    const a = alcanzables(planta);
    expect(a.has('CAM-1')).toBe(true);
    // CAM-9 nunca se cableó: no llega, y eso ya era así antes de nada.
    expect(a.has('CAM-9')).toBe(false);
  });

  it('sin el NVR no se ve NADA, aunque la red esté entera', () => {
    // Es lo que distingue "hay red" de "hay vigilancia".
    expect(alcanzables(planta, ['NVR']).size).toBe(0);
  });
});

describe('impactoDeCaida', () => {
  it('cae el switch del Tren 2: se pierden SUS tres cámaras', () => {
    const i = impactoDeCaida(planta, 'SW-T2', esCamara);
    expect(i.camarasAfectadas).toBe(3);
    expect(i.pierden.sort()).toEqual(['CAM-1', 'CAM-2', 'CAM-3']);
  });

  it('cae el switch del core: se lleva TODA la planta por delante', () => {
    const i = impactoDeCaida(planta, 'SW-CORE', esCamara);
    expect(i.camarasAfectadas).toBe(4);
    expect(i.pierden).toContain('SW-T1');
    expect(i.pierden).toContain('SW-T2');
  });

  it('NO se imputa lo que ya estaba aislado', () => {
    // CAM-9 lleva un mes sin cable. Cargársela al switch que se acaba de
    // caer infla el número, y a la tercera vez nadie se cree el informe.
    const i = impactoDeCaida(planta, 'SW-T2', esCamara);
    expect(i.pierden).not.toContain('CAM-9');
    expect(i.yaAislados).toContain('CAM-9');
  });

  it('cae una cámara: no arrastra a nadie', () => {
    expect(impactoDeCaida(planta, 'CAM-1', esCamara).camarasAfectadas).toBe(0);
  });
});

describe('EL ANILLO DE FIBRA — la razón de calcular alcanzabilidad', () => {
  //   NVR ── SW-A ── SW-B ── SW-C ── (vuelve a SW-A)
  //                    └── CAM-1
  const anillo: GrafoRed = {
    nodos: ['NVR', 'SW-A', 'SW-B', 'SW-C', 'CAM-1'],
    raices: ['NVR'],
    enlaces: [
      { a: 'NVR', b: 'SW-A' },
      { a: 'SW-A', b: 'SW-B', esAnillo: true },
      { a: 'SW-B', b: 'SW-C', esAnillo: true },
      { a: 'SW-C', b: 'SW-A', esAnillo: true },
      { a: 'SW-B', b: 'CAM-1' },
    ],
  };

  it('cae un switch del anillo y NO se pierde nada', () => {
    // Contando vecinos, SW-C "dejaría sin servicio" a lo que sigue. Falso:
    // el anillo existe justo para que el tráfico dé la vuelta.
    const i = impactoDeCaida(anillo, 'SW-C', esCamara);
    expect(i.camarasAfectadas).toBe(0);
    expect(i.salvadoPorAnillo).toBe(true);
  });

  it('cae el switch del que cuelga la cámara: ahí sí se pierde', () => {
    // El anillo salva el TRÁNSITO, no la última rama. Distinguirlo es todo.
    const i = impactoDeCaida(anillo, 'SW-B', esCamara);
    expect(i.camarasAfectadas).toBe(1);
    expect(i.salvadoPorAnillo).toBe(false);
  });

  it('se corta UN tramo de fibra del anillo y no pasa nada', () => {
    const i = impactoDeCorte(anillo, { a: 'SW-B', b: 'SW-C', esAnillo: true }, esCamara);
    expect(i.pierden).toEqual([]);
    expect(i.salvadoPorAnillo).toBe(true);
  });

  it('se corta la bajada del NVR y se cae todo', () => {
    const i = impactoDeCorte(anillo, { a: 'NVR', b: 'SW-A' }, esCamara);
    expect(i.camarasAfectadas).toBe(1);
    expect(i.salvadoPorAnillo).toBe(false);
  });

  it('un ciclo no cuelga el recorrido', () => {
    // Un anillo ES un ciclo. Sin marca de visitados, esto daría vueltas para
    // siempre y tumbaría el servidor.
    expect(alcanzables(anillo).size).toBe(5);
  });
});

describe('porDanoPotencial', () => {
  it('ordena por cuántas cámaras se lleva, no por tamaño ni precio', () => {
    // Es lo que decide dónde poner el repuesto en caliente y qué revisar
    // primero en la parada.
    //
    // OJO: el NVR y el switch del core EMPATAN a 4. La primera versión de
    // esta prueba exigía que SW-CORE fuese el primero y falló — y el
    // equivocado era yo, no el código: si se muere el grabador tampoco se ve
    // nada, así que le corresponde el mismo daño. Se comprueba el empate,
    // no un orden entre iguales que no significa nada.
    const r = porDanoPotencial(planta, esCamara);
    expect(r[0].camarasAfectadas).toBe(4);
    expect(r.slice(0, 2).map((x) => x.id).sort()).toEqual(['NVR', 'SW-CORE']);
    // Lo que sí importa: los de tren van por debajo, y entre ellos ordenados.
    const t2 = r.findIndex((x) => x.id === 'SW-T2');
    const t1 = r.findIndex((x) => x.id === 'SW-T1');
    expect(t2).toBeLessThan(t1);
    expect(r[t2].camarasAfectadas).toBe(3);
    expect(r[t1].camarasAfectadas).toBe(1);
  });

  it('las cámaras no salen en el ranking', () => {
    expect(porDanoPotencial(planta, esCamara).some((x) => x.id.startsWith('CAM'))).toBe(false);
  });
});

describe('bordes', () => {
  it('una red vacía no revienta', () => {
    const g: GrafoRed = { nodos: [], enlaces: [], raices: [] };
    expect(alcanzables(g).size).toBe(0);
    expect(impactoDeCaida(g, 'X').pierden).toEqual([]);
  });

  it('un enlace a un equipo que ya no existe se ignora', () => {
    // Pasa de verdad: se borra un activo y el enlace queda huérfano. Si
    // reventara aquí, la pantalla de topología se caería entera.
    const g: GrafoRed = {
      nodos: ['NVR', 'SW'], raices: ['NVR'],
      enlaces: [{ a: 'NVR', b: 'SW' }, { a: 'SW', b: 'FANTASMA' }],
    };
    expect(alcanzables(g).size).toBe(2);
  });

  it('sin raíces declaradas, nadie alcanza nada', () => {
    // Y se dice así, en vez de suponer una raíz: suponerla haría que el
    // sistema informara de que todo va bien cuando no hay ni grabador.
    expect(alcanzables({ ...planta, raices: [] }).size).toBe(0);
  });
});
