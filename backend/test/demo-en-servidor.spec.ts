/* Bloque 166 · la demo se carga desde la app (Railway) con los mismos scripts compilados. */
import { limpiarSalida } from '../src/modules/purga/demo-en-servidor.service';

describe('salida de los scripts de demo en pantalla', () => {
  it('quita colores y líneas de pila, y deja lo que pasó', () => {
    const t = '\u001b[32mCargando…\u001b[0m\n  Listo: plano\nError: boom\n    at main (/app/dist/prisma/demo.js:1:1)\n\n';
    expect(limpiarSalida(t)).toEqual(['Cargando…', '  Listo: plano', 'Error: boom']);
  });
  it('se queda con las últimas líneas', () => {
    const t = Array.from({ length: 300 }, (_, i) => `l${i}`).join('\n');
    const r = limpiarSalida(t, 160);
    expect(r).toHaveLength(160);
    expect(r[159]).toBe('l299');
  });
});
