import { revisarFicha, defectosDeConjunto, tieneBloqueantes, ActivoParaRevisar } from '../src/modules/campanas/calidad-ficha';

/**
 * QUÉ SE CONSIDERA UNA FICHA MAL CARGADA (12.5)
 *
 * Estas pruebas son el contrato del control de calidad del mapeo. Si alguien
 * afloja una regla de aquí, el dato malo entra — y contra un dato malo el
 * respaldo no sirve, porque lo devuelve tal cual.
 *
 * Cada `it` prueba las DOS caras: qué se rechaza y qué NO. Un control que lo
 * rechaza todo se salta por la vía rápida (dejar de usarlo) y entonces no
 * protege nada.
 */

const BUENA: ActivoParaRevisar = {
  id: 'a1',
  assetCode: 'AA-CAM-T2-LE-014',
  type: 'CAMERA',
  brand: 'Hikvision',
  model: 'DS-2CD2T47',
  serialNumber: 'F1234567',
  locationId: 'L-T2',
  cabinetId: null,
  referencePlace: 'Lecho de enfriamiento, columna 14',
  isDraft: false,
  ipAddress: '10.20.4.14',
  fotos: 2,
};

describe('calidad de ficha · una ficha completa pasa limpia', () => {
  it('sin defectos cuando está todo', () => {
    expect(revisarFicha(BUENA)).toEqual([]);
  });

  it('un NVR bien cargado tampoco necesita foto', () => {
    // La foto se exige donde de verdad ahorra la segunda visita.
    const nvr = { ...BUENA, type: 'NVR', cabinetId: 'G-1', fotos: 0, assetCode: 'AA-NVR-T2-001' };
    expect(revisarFicha(nvr)).toEqual([]);
  });
});

describe('calidad de ficha · lo que IMPIDE usar el registro', () => {
  const bloqueantes = (a: ActivoParaRevisar) =>
    revisarFicha(a).filter((d) => d.gravedad === 'BLOQUEANTE').map((d) => d.campo);

  it('la ficha marcada como incompleta no se aprueba', () => {
    // El propio técnico dijo que falta terminarla. Aprobarla es contradecirle.
    expect(bloqueantes({ ...BUENA, isDraft: true })).toContain('isDraft');
  });

  it('sin ubicación no se aprueba: nadie lo va a encontrar', () => {
    expect(bloqueantes({ ...BUENA, locationId: null })).toContain('locationId');
  });

  it('un código fuera de patrón no se aprueba', () => {
    // `camara1`, `zzz`, `prueba` — el tecleo de campo.
    expect(bloqueantes({ ...BUENA, assetCode: 'camara1' })).toContain('assetCode');
    expect(bloqueantes({ ...BUENA, assetCode: 'zzz' })).toContain('assetCode');
  });

  it('el patrón acepta minúsculas: el técnico escribe con guantes', () => {
    // Rechazar por mayúsculas sería castigar la forma en vez del contenido.
    expect(bloqueantes({ ...BUENA, assetCode: 'aa-cam-t2-le-014' })).not.toContain('assetCode');
  });

  it('un equipo de rack sin gabinete no se aprueba', () => {
    expect(bloqueantes({ ...BUENA, type: 'SWITCH', assetCode: 'AA-SW-T2-003', cabinetId: null }))
      .toContain('cabinetId');
  });

  it('una cámara sin foto no se aprueba', () => {
    expect(bloqueantes({ ...BUENA, fotos: 0 })).toContain('fotos');
  });

  it('un UPS sin foto SÍ se aprueba: ahí la foto no es lo que falta', () => {
    expect(bloqueantes({ ...BUENA, type: 'UPS', assetCode: 'AA-UPS-T2-001', fotos: 0 })).toEqual([]);
  });
});

describe('calidad de ficha · lo que se puede completar después', () => {
  const avisos = (a: ActivoParaRevisar) =>
    revisarFicha(a).filter((d) => d.gravedad === 'AVISO').map((d) => d.campo);

  it('sin marca ni modelo avisa, pero NO bloquea', () => {
    const d = revisarFicha({ ...BUENA, brand: null, model: null });
    expect(avisos({ ...BUENA, brand: null, model: null })).toContain('marca');
    expect(tieneBloqueantes(d)).toBe(false);
  });

  it('sin número de serie avisa', () => {
    expect(avisos({ ...BUENA, serialNumber: null })).toContain('serialNumber');
  });

  it('sin referencia de dónde está, avisa', () => {
    expect(avisos({ ...BUENA, referencePlace: null })).toContain('referencePlace');
    // Una referencia demasiado corta ("ahí") tampoco sirve a nadie.
    expect(avisos({ ...BUENA, referencePlace: 'ahi' })).toContain('referencePlace');
  });

  it('con marca pero sin modelo NO avisa: con una de las dos basta para identificarlo', () => {
    expect(avisos({ ...BUENA, model: null })).not.toContain('marca');
  });
});

describe('calidad · lo que sólo se ve mirando el conjunto', () => {
  it('dos activos con el MISMO CÓDIGO se marcan los dos', () => {
    // Es el defecto más caro del mapeo: corrompe el inventario entero y no se
    // puede detectar mirando una ficha suelta.
    const m = defectosDeConjunto([
      { ...BUENA, id: 'a1', assetCode: 'AA-CAM-T2-014' },
      { ...BUENA, id: 'a2', assetCode: 'AA-CAM-T2-014', ipAddress: '10.20.4.15' },
    ]);
    expect(m.get('a1')![0].gravedad).toBe('BLOQUEANTE');
    expect(m.get('a2')![0].texto).toContain('repetido');
  });

  it('el código repetido no distingue mayúsculas', () => {
    const m = defectosDeConjunto([
      { ...BUENA, id: 'a1', assetCode: 'AA-CAM-T2-014' },
      { ...BUENA, id: 'a2', assetCode: 'aa-cam-t2-014', ipAddress: '10.20.4.15' },
    ]);
    expect(m.size).toBe(2);
  });

  it('dos activos con la MISMA IP se marcan: se tumban entre ellos', () => {
    const m = defectosDeConjunto([
      { ...BUENA, id: 'a1', assetCode: 'AA-CAM-T2-014', ipAddress: '10.20.4.14' },
      { ...BUENA, id: 'a2', assetCode: 'AA-CAM-T2-015', ipAddress: '10.20.4.14' },
    ]);
    expect(m.get('a1')![0].campo).toBe('ipAddress');
    expect(m.get('a2')![0].texto).toContain('misma IP');
  });

  it('activos sin IP no se cuentan como repetidos', () => {
    // Si el vacío contara como repetición, media zona saldría en rojo.
    const m = defectosDeConjunto([
      { ...BUENA, id: 'a1', assetCode: 'AA-CAM-T2-014', ipAddress: null },
      { ...BUENA, id: 'a2', assetCode: 'AA-CAM-T2-015', ipAddress: '' },
    ]);
    expect(m.size).toBe(0);
  });

  it('una zona correcta no produce ningún defecto de conjunto', () => {
    const m = defectosDeConjunto([
      { ...BUENA, id: 'a1', assetCode: 'AA-CAM-T2-014', ipAddress: '10.20.4.14' },
      { ...BUENA, id: 'a2', assetCode: 'AA-CAM-T2-015', ipAddress: '10.20.4.15' },
    ]);
    expect(m.size).toBe(0);
  });
});

describe('calidad · la decisión final', () => {
  it('basta UN bloqueante para no poder aprobar', () => {
    expect(tieneBloqueantes(revisarFicha({ ...BUENA, locationId: null }))).toBe(true);
  });

  it('sólo avisos: se puede aprobar', () => {
    expect(tieneBloqueantes(revisarFicha({ ...BUENA, serialNumber: null, brand: null, model: null }))).toBe(false);
  });
});
