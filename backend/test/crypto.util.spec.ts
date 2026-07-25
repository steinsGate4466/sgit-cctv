import { encryptSecret, decryptSecret } from '../src/common/crypto/crypto.util';

/**
 * Camino crítico: cifrado de credenciales de equipos (cámaras, NVR, switches).
 * Si esto se rompe, se pierden TODAS las contraseñas guardadas en planta.
 */
describe('crypto.util — cifrado de credenciales (AES-256-GCM)', () => {
  const OLD_KEY = process.env.CREDENTIAL_ENC_KEY;

  beforeAll(() => {
    process.env.CREDENTIAL_ENC_KEY = 'clave-de-prueba-32-caracteres-minimo!';
  });
  afterAll(() => {
    process.env.CREDENTIAL_ENC_KEY = OLD_KEY;
  });

  it('descifra correctamente lo que cifró (ida y vuelta)', () => {
    const clave = 'Admin.Camara2026';
    expect(decryptSecret(encryptSecret(clave))).toBe(clave);
  });

  it('soporta tildes y caracteres especiales de planta', () => {
    const clave = 'Púlpito#T1-ñ@2026';
    expect(decryptSecret(encryptSecret(clave))).toBe(clave);
  });

  it('genera un texto cifrado distinto cada vez (IV aleatorio)', () => {
    const clave = 'MismaClave123';
    expect(encryptSecret(clave)).not.toBe(encryptSecret(clave));
  });

  it('produce el formato esperado iv.tag.datos', () => {
    const partes = encryptSecret('x').split('.');
    expect(partes).toHaveLength(3);
    partes.forEach((p) => expect(p.length).toBeGreaterThan(0));
  });

  it('falla si el texto cifrado fue manipulado (integridad GCM)', () => {
    const cifrado = encryptSecret('SecretoDelNVR');
    const [iv, tag, datos] = cifrado.split('.');
    const manipulado = [iv, tag, Buffer.from('otro-contenido').toString('base64')].join('.');
    expect(() => decryptSecret(manipulado)).toThrow();
  });

  it('no puede descifrarse con otra clave maestra', () => {
    const cifrado = encryptSecret('SecretoDelNVR');
    process.env.CREDENTIAL_ENC_KEY = 'otra-clave-totalmente-distinta-2026';
    expect(() => decryptSecret(cifrado)).toThrow();
    process.env.CREDENTIAL_ENC_KEY = 'clave-de-prueba-32-caracteres-minimo!';
  });
});
