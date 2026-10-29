import * as fs from 'fs';
import * as path from 'path';

/* =============================================================================
   BLOQUE 184 · EDITAR UN EQUIPO YA CONECTADO A SU SWITCH
   -----------------------------------------------------------------------------
   El formulario de Activos precarga la ficha del tipo (cámara, antena…) tal
   como la devuelve el servidor y la vuelve a mandar al guardar. El servidor
   corre con `forbidNonWhitelisted`: un campo que la ficha no admite se rechaza.

   `switchPortId` lo escribe Red › Conexiones y NO está en el DTO de la ficha.
   El formulario lo devolvía y la edición moría con
   «camera.property switchPortId should not exist»: ninguna cámara ni antena
   conectada a su switch se podía editar desde Activos.

   Esta prueba cruza las tres piezas que tienen que cuadrar —el esquema, el DTO
   y lo que el formulario quita antes de mandar— para que un campo nuevo en
   una ficha no vuelva a romper la edición sin que nadie se entere.
============================================================================= */

const RAIZ = path.join(__dirname, '..');
const schema = fs.readFileSync(path.join(RAIZ, 'prisma', 'schema.prisma'), 'utf8');
const dtos = fs.readFileSync(path.join(RAIZ, 'src', 'modules', 'assets', 'dto', 'asset-specs.dto.ts'), 'utf8');
const assets = fs.readFileSync(path.join(RAIZ, '..', 'frontend', 'src', 'pages', 'Assets.tsx'), 'utf8');

const FICHAS: Record<string, [modelo: string, dto: string]> = {
  camera: ['AssetCamera', 'CameraSpecDto'],
  nvr: ['AssetNvr', 'NvrSpecDto'],
  switchDev: ['AssetSwitch', 'SwitchSpecDto'],
  wireless: ['AssetWireless', 'WirelessSpecDto'],
  decoder: ['AssetDecoder', 'DecoderSpecDto'],
  screen: ['AssetScreen', 'ScreenSpecDto'],
  pc: ['AssetPc', 'PcSpecDto'],
};
const ESCALARES = new Set(['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Decimal', 'Json', 'BigInt']);
const enums = new Set([...schema.matchAll(/^enum (\w+) \{/gm)].map((m) => m[1]));

/** Los campos que el servidor DEVUELVE de una ficha: sus columnas (no las relaciones). */
function columnas(modelo: string): string[] {
  const cuerpo = new RegExp(`model ${modelo} \\{([\\s\\S]*?)\\n\\}`).exec(schema)?.[1];
  if (!cuerpo) throw new Error(`No encuentro el modelo ${modelo} en el esquema.`);
  return cuerpo.split('\n').map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//') && !l.startsWith('@@'))
    .map((l) => l.split(/\s+/))
    .filter(([, tipo]) => tipo && (ESCALARES.has(tipo.replace(/[?[\]]/g, '')) || enums.has(tipo.replace(/[?[\]]/g, ''))))
    .map(([nombre]) => nombre);
}

/** Los campos que la ficha ADMITE al guardar. */
function admitidos(dto: string): string[] {
  const cuerpo = new RegExp(`export class ${dto}[^{]*\\{([\\s\\S]*?)\\n\\}`).exec(dtos)?.[1];
  if (!cuerpo) throw new Error(`No encuentro ${dto}.`);
  return [...cuerpo.matchAll(/(\w+)[?!]?:\s/g)].map((m) => m[1]);
}

/** Lo que el formulario quita de la ficha guardada antes de devolverla. */
const quitados = (() => {
  const m = /const \{([^}]*)\.\.\.campos \} = guardada;/.exec(assets);
  if (!m) throw new Error('No encuentro en Assets.tsx dónde se limpia la ficha guardada.');
  return new Set(m[1].split(',').map((x) => x.trim()).filter(Boolean));
})();

describe('editar la ficha de un activo ya conectado', () => {
  it.each(Object.entries(FICHAS))('%s: todo lo que devuelve el servidor, o se admite al guardar o el formulario lo quita', (_ficha, [modelo, dto]) => {
    const permitidos = new Set(admitidos(dto));
    const sobran = columnas(modelo).filter((c) => !permitidos.has(c) && !quitados.has(c));
    expect(sobran).toEqual([]);
  });

  it('el puerto del switch lo declara Conexiones: el formulario no lo devuelve', () => {
    expect(quitados.has('switchPortId')).toBe(true);
  });

  it('la ficha técnica de la cámara SÍ se edita desde Activos (y `null` la quita)', () => {
    expect(admitidos('CameraSpecDto')).toContain('fichaOpticaId');
    expect(quitados.has('fichaOpticaId')).toBe(false);
  });
});
