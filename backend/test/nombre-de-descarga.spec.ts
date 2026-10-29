import * as fs from 'fs';
import * as path from 'path';
import { validateHeaderValue } from 'http';
import { disposicion } from '../src/common/descarga';

/**
 * BLOQUE 184 · el nombre de lo que se descarga.
 *
 * Un código de activo es de formato LIBRE. Con una raya «—» pegada desde Word,
 * Node rechazaba la cabecera entera (ERR_INVALID_CHAR) y el QR o el informe de
 * ese equipo no se podía bajar nunca: un 500 que no decía por qué.
 */
describe('nombre de descarga', () => {
  const nombreUtf8 = (cab: string) => decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(cab)![1]);
  const nombreAscii = (cab: string) => /filename="([^"]*)"/.exec(cab)![1];

  it.each([
    ['raya de Word', 'qr-AA—CAM—01.png'],
    ['comillas tipográficas', 'informe-“GAB 3”.pdf'],
    ['comillas rectas', 'qr-GAB "A".png'],
    ['salto de línea', 'informe\r\nSet-Cookie: x=1.pdf'],
    ['emoji', 'ficha 📷.pdf'],
  ])('la cabecera siempre es válida (%s)', (_caso, nombre) => {
    expect(() => validateHeaderValue('Content-Disposition', disposicion(nombre))).not.toThrow();
  });

  it('el nombre real conserva las tildes; el de respaldo es ASCII', () => {
    const cab = disposicion('Ficha técnica Hikvision 2.8 mm.pdf');
    expect(nombreUtf8(cab)).toBe('Ficha técnica Hikvision 2.8 mm.pdf');
    expect(nombreAscii(cab)).toBe('Ficha tecnica Hikvision 2.8 mm.pdf');
  });

  it('no deja rutas ni saltos de línea: no se sale de la carpeta ni parte la cabecera', () => {
    const cab = disposicion('../../etc/passwd\r\nX: y');
    expect(nombreUtf8(cab)).not.toMatch(/[\\/\r\n]/);
    expect(cab).not.toMatch(/[\r\n]/);
  });

  it('inline sólo cuando se pide; vacío no deja la cabecera sin nombre', () => {
    expect(disposicion('a.png', 'inline')).toMatch(/^inline; /);
    expect(disposicion('a.png')).toMatch(/^attachment; /);
    expect(nombreAscii(disposicion('   '))).toBe('archivo');
  });

  it('ningún controlador vuelve a armar la cabecera a mano', () => {
    const raiz = path.join(__dirname, '..', 'src', 'modules');
    const aMano: string[] = [];
    const recorrer = (dir: string) => {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) recorrer(p);
        else if (/\.ts$/.test(f.name) && !/\.spec\.ts$/.test(f.name)
          && /filename="\$\{/.test(fs.readFileSync(p, 'utf8'))) aMano.push(path.relative(raiz, p));
      }
    };
    recorrer(raiz);
    expect(aMano).toEqual([]);
  });
});
