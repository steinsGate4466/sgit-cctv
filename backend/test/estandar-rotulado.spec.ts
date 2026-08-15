/* =============================================================================
   ESTÁNDAR DE ROTULADO Y COLOR (TIA-606-C) — bloque 30
   -----------------------------------------------------------------------------
   El rótulo es lo único del sistema que existe FÍSICAMENTE en la planta. Si el
   generador se equivoca, alguien imprime doscientas etiquetas mal y hay que
   volver a subir a doscientos postes.
============================================================================= */
import {
  generarCodigo, revisarCodigo, normalizarSegmento, colorDe,
  CODIGO_DE_COLOR, ABREVIATURA_TIPO, textoDeEtiqueta, PATRON_CODIGO,
} from '../src/common/estandar-rotulado';

describe('generar el código', () => {
  it('arma el rótulo completo con tren y zona', () => {
    const r = generarCodigo({ tipoActivo: 'CAMERA', trenCode: 'AASA-PISCO-T2', zonaNombre: 'Lecho', secuencia: 14 });
    expect(r.codigo).toBe('AA-CAM-T2-LECHO-014');
    expect(r.avisos).toHaveLength(0);
  });

  it('quita tildes, espacios y signos de la zona', () => {
    const r = generarCodigo({ tipoActivo: 'SWITCH', trenCode: 'AASA-PISCO-T1', zonaNombre: 'Púlpito Nº 1', secuencia: 2 });
    expect(r.codigo).toBe('AA-SW-T1-PULPIT-002');
  });

  it('sin tren y sin zona genera igual, pero AVISA', () => {
    // Genera igual a propósito: bloquear obligaría al técnico a inventarse una
    // zona para poder guardar, y un dato inventado es peor que uno marcado.
    const r = generarCodigo({ tipoActivo: 'NVR', secuencia: 1 });
    expect(r.codigo).toBe('AA-NVR-SIN-SINUB-001');
    expect(r.avisos).toHaveLength(2);
  });

  it('un tipo desconocido cae en GEN y lo dice', () => {
    const r = generarCodigo({ tipoActivo: 'DRON', trenCode: 'AASA-PISCO-T3', zonaNombre: 'Patio', secuencia: 5 });
    expect(r.codigo).toContain('-GEN-');
    expect(r.avisos[0]).toContain('DRON');
  });

  it('la secuencia siempre lleva tres dígitos', () => {
    expect(generarCodigo({ tipoActivo: 'CAMERA', trenCode: 'T1', zonaNombre: 'A', secuencia: 7 }).codigo).toContain('-007');
    expect(generarCodigo({ tipoActivo: 'CAMERA', trenCode: 'T1', zonaNombre: 'A', secuencia: 999 }).codigo).toContain('-999');
  });

  it('nunca genera secuencia cero ni negativa', () => {
    expect(generarCodigo({ tipoActivo: 'CAMERA', trenCode: 'T1', zonaNombre: 'A', secuencia: 0 }).codigo).toContain('-001');
    expect(generarCodigo({ tipoActivo: 'CAMERA', trenCode: 'T1', zonaNombre: 'A', secuencia: -3 }).codigo).toContain('-001');
  });

  it('lo que genera SIEMPRE pasa su propia validación', () => {
    // Un generador que produce códigos que su validador rechaza es el peor
    // error posible aquí: nadie podría guardar nada.
    for (const tipo of Object.keys(ABREVIATURA_TIPO)) {
      const r = generarCodigo({ tipoActivo: tipo, trenCode: 'AASA-PISCO-T2', zonaNombre: 'Colada', secuencia: 33 });
      expect(PATRON_CODIGO.test(r.codigo)).toBe(true);
      expect(revisarCodigo(r.codigo).valido).toBe(true);
    }
  });
});

describe('revisar un código escrito a mano', () => {
  it('acepta el formato bueno', () => {
    expect(revisarCodigo('AA-CAM-T2-LECHO-014').valido).toBe(true);
  });

  it('rechaza lo que no sigue el formato', () => {
    for (const malo of ['CAM-014', 'AA-CAM-T2-LECHO-14', 'aa cam t2', 'AA_CAM_T2_LECHO_014', '']) {
      expect(revisarCodigo(malo).valido).toBe(false);
    }
  });

  it('AVISA (no bloquea) si el tipo del rótulo no cuadra con el registrado', () => {
    const r = revisarCodigo('AA-SW-T2-LECHO-014', { tipoActivo: 'CAMERA' });
    expect(r.valido).toBe(true);
    expect(r.avisos[0]).toContain('CAM');
  });

  it('AVISA si el tren del rótulo no cuadra con el árbol: puede que se haya movido', () => {
    // Bloquearlo obligaría al técnico a mentir para poder guardar.
    const r = revisarCodigo('AA-CAM-T1-LECHO-014', { trenCode: 'AASA-PISCO-T2' });
    expect(r.valido).toBe(true);
    expect(r.avisos[0]).toContain('T2');
  });

  it('un código con tren SIN no avisa de desfase: ya se sabe que falta', () => {
    const r = revisarCodigo('AA-CAM-SIN-SINUB-001', { trenCode: 'AASA-PISCO-T2' });
    expect(r.avisos).toHaveLength(0);
  });
});

describe('el código de color', () => {
  it('no hay dos propósitos con el mismo color', () => {
    const colores = CODIGO_DE_COLOR.map((c) => c.color.toLowerCase());
    expect(new Set(colores).size).toBe(colores.length);
  });

  it('todos llevan escrito de dónde sale el criterio', () => {
    // Para poder contestar «¿por qué verde?» sin depender de la memoria.
    for (const c of CODIGO_DE_COLOR) expect(c.origen.length).toBeGreaterThan(10);
  });

  it('CCTV es verde, y proceso es rojo', () => {
    expect(colorDe('CCTV')?.color).toBe('Verde');
    expect(colorDe('PROCESO')?.color).toBe('Rojo');
  });

  it('la etiqueta lleva dos líneas: el código y de qué color va el cable', () => {
    const e = textoDeEtiqueta('AA-CAM-T2-LECHO-014', 'CCTV');
    expect(e.linea1).toBe('AA-CAM-T2-LECHO-014');
    expect(e.linea2).toContain('VERDE');
  });

  it('sin propósito la etiqueta sale igual, sólo con el código', () => {
    expect(textoDeEtiqueta('AA-NVR-T1-SALA-001').linea1).toBeTruthy();
  });
});

describe('normalizar', () => {
  it('quita tildes y eñes', () => {
    expect(normalizarSegmento('Cañón Ñandú')).toBe('CANONN');
  });
  it('recorta al largo pedido', () => {
    expect(normalizarSegmento('LABORATORIO', 4)).toBe('LABO');
  });
});
