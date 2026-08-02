import * as fs from 'fs';
import * as path from 'path';

/**
 * NINGÚN ENDPOINT QUE ESCRIBA PUEDE QUEDARSE SIN PERMISO.
 *
 * Esta prueba no mira el comportamiento: mira el CÓDIGO. Recorre todos los
 * controladores y comprueba que cada @Post, @Patch, @Put y @Delete declara
 * @RequirePermissions o está en la lista de excepciones justificadas.
 *
 * Existe porque el fallo típico no es escribir mal un permiso: es OLVIDARLO.
 * Se añade un endpoint nuevo, funciona en las pruebas manuales —quien prueba
 * es administrador y lo puede todo— y queda abierto a cualquiera con sesión.
 * Nadie se entera hasta que alguien borra algo que no debía.
 *
 * Si esta prueba falla al añadir un endpoint, hay dos salidas honestas:
 * ponerle su permiso, o añadirlo abajo EXPLICANDO por qué no lo necesita.
 */

const SRC = path.join(__dirname, '..', 'src');

/** Endpoints que escriben y NO llevan permiso, con su motivo. */
const EXCEPCIONES: Record<string, string> = {
  'auth.controller.ts:login':
    'Es la puerta de entrada: exigir un permiso para iniciar sesión no tiene sentido. Va con @Public y con freno de intentos.',
  'auth.controller.ts:refresh':
    'Renueva el token con el token de refresco, que ya es la credencial. Va con @Public y con freno.',
  'users.controller.ts:setPin':
    'Cada uno gestiona SU pin. El identificador sale del token, nunca de la URL, así que no hay forma de tocar el de otro.',
  'users.controller.ts:verifyPin':
    'Igual que el anterior: identidad del token y freno de intentos.',
};

function controladores(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) controladores(p, acc);
    else if (/\.controller\.ts$/.test(e.name)) acc.push(p);
  }
  return acc;
}

describe('cobertura de permisos', () => {
  const archivos = controladores(SRC);

  it('hay controladores que revisar', () => {
    expect(archivos.length).toBeGreaterThan(10);
  });

  it('todo endpoint que ESCRIBE declara permiso (o está justificado)', () => {
    const huerfanos: string[] = [];

    for (const f of archivos) {
      const txt = fs.readFileSync(f, 'utf8');
      const nombre = path.basename(f);
      // Cada método con su bloque de decoradores justo encima.
      const re = /((?:^[ \t]*@[\w.]+\([\s\S]*?\)[ \t]*\n)+)[ \t]*(?:async[ \t]+)?(\w+)\s*\(/gm;
      let m: RegExpExecArray | null;
      while ((m = re.exec(txt))) {
        const decoradores = m[1];
        const metodo = m[2];
        const escribe = /@(Post|Patch|Put|Delete)\(/.test(decoradores);
        if (!escribe) continue;
        if (/@RequirePermissions\(/.test(decoradores)) continue;
        const clave = `${nombre}:${metodo}`;
        if (EXCEPCIONES[clave]) continue;
        huerfanos.push(clave);
      }
    }

    if (huerfanos.length) {
      throw new Error(
        'Estos endpoints escriben y no declaran permiso:\n  ' +
        huerfanos.join('\n  ') +
        '\n\nPonles @RequirePermissions, o añádelos a EXCEPCIONES en esta ' +
        'prueba explicando por qué no lo necesitan.',
      );
    }
  });

  it('cada excepción sigue existiendo', () => {
    // Si se borra un endpoint y su excepción se queda, la lista se convierte
    // en una colección de permisos falsamente justificados que nadie revisa.
    const todo = archivos.map((f) => ({ n: path.basename(f), t: fs.readFileSync(f, 'utf8') }));
    for (const clave of Object.keys(EXCEPCIONES)) {
      const [archivo, metodo] = clave.split(':');
      const f = todo.find((x) => x.n === archivo);
      expect(f).toBeDefined();
      expect(f!.t).toMatch(new RegExp(`\\b${metodo}\\s*\\(`));
    }
  });

  it('cada excepción tiene un motivo escrito, no una línea vacía', () => {
    for (const [clave, motivo] of Object.entries(EXCEPCIONES)) {
      expect(motivo.length).toBeGreaterThan(40);
      expect(clave).toMatch(/\.controller\.ts:\w+/);
    }
  });
});
