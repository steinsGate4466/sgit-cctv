/* =============================================================================
   QUÉ PROCEDIMIENTO SE LE ENSEÑA AL TÉCNICO — bloque 29
   -----------------------------------------------------------------------------
   Elegir mal aquí significa que alguien sigue, a las tres de la mañana y con
   guantes, los pasos de un equipo que no es el que tiene delante.
============================================================================= */
import { elegir, aplicables, puntuar } from '../src/modules/procedimientos/aplicabilidad';

const camara = { type: 'CAMERA', brand: 'Hikvision', model: 'DS-2CD2143' };

const generico   = { id: 'g', tipoActivo: 'CAMERA' };
const porMarca   = { id: 'm', tipoActivo: 'CAMERA', marca: 'Hikvision' };
const porModelo  = { id: 'x', tipoActivo: 'CAMERA', marca: 'Hikvision', modelo: 'DS-2CD2143' };
const otroModelo = { id: 'o', tipoActivo: 'CAMERA', marca: 'Hikvision', modelo: 'DS-2CD1023' };
const otroTipo   = { id: 't', tipoActivo: 'NVR' };

describe('gana lo más específico', () => {
  it('el del modelo gana al de la marca y al genérico', () => {
    expect(elegir([generico, porMarca, porModelo], camara)?.id).toBe('x');
  });

  it('sin uno de modelo, gana el de la marca', () => {
    expect(elegir([generico, porMarca], camara)?.id).toBe('m');
  });

  it('sin nada más, el genérico del tipo sirve', () => {
    expect(elegir([generico], camara)?.id).toBe('g');
  });

  it('el procedimiento de OTRO modelo NO se enseña, aunque sea la misma marca', () => {
    // Es el error que importa: los pasos de una DS-2CD1023 no valen para una
    // DS-2CD2143 por mucho que las dos sean Hikvision.
    expect(elegir([otroModelo], camara)).toBeNull();
  });

  it('el de otro tipo de equipo tampoco', () => {
    expect(elegir([otroTipo], camara)).toBeNull();
  });

  it('sin ninguno devuelve null, no algo parecido', () => {
    expect(elegir([], camara)).toBeNull();
  });

  it('los desactivados no se enseñan', () => {
    expect(elegir([{ ...porModelo, activo: false }], camara)).toBeNull();
  });
});

describe('detalles que muerden', () => {
  it('la marca se compara sin importar mayúsculas ni espacios', () => {
    const p = { id: 'p', tipoActivo: 'camera', marca: '  HIKVISION ' };
    expect(puntuar(p, camara)).toBe(2);
  });

  it('un equipo sin marca sólo encaja con el genérico', () => {
    const sinMarca = { type: 'CAMERA', brand: null, model: null };
    expect(elegir([porModelo, porMarca, generico], sinMarca)?.id).toBe('g');
  });

  it('a igual especificidad el resultado NO depende del orden de la lista', () => {
    const a = { id: 'a', tipoActivo: 'CAMERA' };
    const b = { id: 'b', tipoActivo: 'CAMERA' };
    expect(elegir([a, b], camara)?.id).toBe('a');
    expect(elegir([b, a], camara)?.id).toBe('b');
    // Quien llama ordena por fecha: el empate lo rompe esa consulta, no el azar.
  });

  it('aplicables los devuelve del más específico al más general', () => {
    const r = aplicables([generico, porModelo, porMarca, otroTipo], camara);
    expect(r.map((x) => x.id)).toEqual(['x', 'm', 'g']);
  });
});
