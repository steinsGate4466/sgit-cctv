import { AllExceptionsFilter, esArchivoQueYaNoEsta, esServicioCaido } from '../src/common/filters/all-exceptions.filter';

/** Bloque 171 · una dependencia caída responde 503 con un mensaje que se entiende, no 500. */
describe('filtro de errores · servicio caído', () => {
  it('reconoce las conexiones rechazadas o sin respuesta', () => {
    for (const code of ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENOTFOUND']) {
      expect(esServicioCaido(Object.assign(new Error('x'), { code }))).toBe(true);
    }
    expect(esServicioCaido({ cause: { code: 'ECONNREFUSED' } })).toBe(true);
    expect(esServicioCaido(new Error('otra cosa'))).toBe(false);
    expect(esServicioCaido(null)).toBe(false);
  });

  it('responde 503 y no 500', () => {
    let estado = 0; let cuerpo: any = null;
    const res: any = { status: (s: number) => { estado = s; return { json: (b: any) => { cuerpo = b; } }; } };
    const host: any = { switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ method: 'GET', url: '/api/v1/planos/x/imagen' }) }) };
    const f = new AllExceptionsFilter();
    (f as any).logger = { error: () => undefined, warn: () => undefined };
    f.catch(Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:9000'), { code: 'ECONNREFUSED' }), host);
    expect(estado).toBe(503);
    expect(JSON.stringify(cuerpo)).toContain('no responde');
  });
});

/* Bloque 174 · archivo que el almacén ya no tiene: 404 con mensaje, no 500. */
describe('archivo perdido en el almacén', () => {
  it('NoSuchKey de MinIO se reconoce', () => {
    expect(esArchivoQueYaNoEsta(Object.assign(new Error('The specified key does not exist.'), { code: 'NoSuchKey', name: 'S3Error' }))).toBe(true);
    expect(esArchivoQueYaNoEsta(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }))).toBe(false);
  });
});
