import { construirRejilla, buscarPorLoQueDiceElPulpito, CamaraDelGrabador } from '../src/modules/network/canales';

const cam = (o: Partial<CamaraDelGrabador> & { assetId: string; code: string }): CamaraDelGrabador => ({
  nombreEnGrabador: 'NOMBRE',
  canal: 1,
  estado: 'OPERATIVO',
  lugar: null,
  ...o,
});

describe('rejilla de canales', () => {
  it('dibuja tantas casillas como capacidad tenga el grabador', () => {
    const r = construirRejilla([cam({ assetId: '1', code: 'C1', canal: 3 })], 16);
    expect(r.total).toBe(16);
    expect(r.ocupados).toBe(1);
    expect(r.libres).toBe(15);
    expect(r.celdas[2].camara?.code).toBe('C1');
    expect(r.celdas[0].camara).toBeNull();
  });

  it('sin capacidad registrada NO se inventa un número de canales', () => {
    // Si dijera "16" sin saberlo, la pantalla afirmaría que quedan canales
    // libres y alguien planificaría cámaras nuevas sobre esa suposición.
    const r = construirRejilla([cam({ assetId: '1', code: 'C1', canal: 4 })], null);
    expect(r.capacidad).toBeNull();
    expect(r.total).toBe(4);
    expect(r.libres).toBe(3);
  });

  it('una cámara sin canal no se pierde: sale aparte y avisa', () => {
    const r = construirRejilla([cam({ assetId: '1', code: 'C1', canal: null })], 8);
    expect(r.sinCanal).toHaveLength(1);
    expect(r.ocupados).toBe(0);
    expect(r.problemas.map((p) => p.tipo)).toContain('SIN_CANAL');
  });

  it('dos cámaras en el mismo canal se marcan como conflicto', () => {
    const r = construirRejilla(
      [cam({ assetId: '1', code: 'C1', canal: 5 }), cam({ assetId: '2', code: 'C2', canal: 5 })],
      8,
    );
    expect(r.celdas[4].duplicado).toBe(true);
    const p = r.problemas.find((x) => x.tipo === 'CANAL_DUPLICADO');
    expect(p?.canal).toBe(5);
    expect(p?.camaras).toHaveLength(2);
  });

  it('un canal por encima de la capacidad se denuncia, pero se sigue dibujando', () => {
    // Esconder la cámara "que no cabe" haría que desapareciera del sistema.
    const r = construirRejilla([cam({ assetId: '1', code: 'C1', canal: 20 })], 16);
    expect(r.problemas.map((p) => p.tipo)).toContain('FUERA_DE_RANGO');
    expect(r.total).toBe(20);
    expect(r.celdas[19].camara?.code).toBe('C1');
  });

  it('sin nombre en el grabador se avisa: es lo que traduce el aviso por radio', () => {
    const r = construirRejilla([cam({ assetId: '1', code: 'C1', nombreEnGrabador: '  ' })], 4);
    expect(r.problemas.map((p) => p.tipo)).toContain('SIN_NOMBRE');
  });

  it('un grabador vacío no revienta', () => {
    const r = construirRejilla([], 8);
    expect(r.total).toBe(8);
    expect(r.ocupados).toBe(0);
    expect(r.problemas).toHaveLength(0);
  });
});

describe('buscar lo que dice el púlpito', () => {
  const lista = [
    cam({ assetId: '1', code: 'AA-CAM-T2-045', canal: 7, nombreEnGrabador: 'GRUA 2 PATIO', lugar: 'Nave 3' }),
    cam({ assetId: '2', code: 'AA-CAM-T2-046', canal: 8, nombreEnGrabador: 'HORNO ENTRADA', lugar: 'Nave 1' }),
  ];

  it('"el canal 7" encuentra la cámara del canal 7', () => {
    expect(buscarPorLoQueDiceElPulpito(lista, 'canal 7')[0].code).toBe('AA-CAM-T2-045');
    expect(buscarPorLoQueDiceElPulpito(lista, '7')[0].code).toBe('AA-CAM-T2-045');
    expect(buscarPorLoQueDiceElPulpito(lista, 'c7')[0].code).toBe('AA-CAM-T2-045');
  });

  it('"la de la grúa" encuentra por el nombre que ve el operador', () => {
    expect(buscarPorLoQueDiceElPulpito(lista, 'grua')[0].code).toBe('AA-CAM-T2-045');
  });

  it('también encuentra por código y por sitio', () => {
    expect(buscarPorLoQueDiceElPulpito(lista, 't2-046')[0].assetId).toBe('2');
    expect(buscarPorLoQueDiceElPulpito(lista, 'nave 1')[0].assetId).toBe('2');
  });

  it('un número que no es de ningún canal no devuelve cualquier cosa', () => {
    expect(buscarPorLoQueDiceElPulpito(lista, '99')).toHaveLength(0);
  });

  it('texto vacío no devuelve la planta entera', () => {
    expect(buscarPorLoQueDiceElPulpito(lista, '   ')).toHaveLength(0);
  });
});
