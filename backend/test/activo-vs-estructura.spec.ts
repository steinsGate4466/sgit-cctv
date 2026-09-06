import * as fs from 'fs';
import * as path from 'path';
import {
  TIPOS_ACTIVO, TIPOS_ESTRUCTURA, TIPOS_DE_EQUIPO, NOMBRE_DE_TIPO,
  esEstructura, motivoParaNoCrearComoActivo,
} from '../src/common/tipos-de-equipo';

/* =============================================================================
   BLOQUE 95 · UN GABINETE NO ES UN ACTIVO
   -----------------------------------------------------------------------------
   Lo vio el usuario abriendo la pantalla: en el desplegable de «Tipo» del alta
   de activos salían GABINETE y TABLERO ELÉCTRICO. Los dos son ESTRUCTURA y los
   dos tienen su propio modelo (`Cabinet`, `TableroElectrico`) y su propia
   pantalla. Se podía crear el mismo gabinete por dos caminos → dos verdades.
============================================================================= */

const raiz = path.join(__dirname, '..');
const leer = (p: string) => fs.readFileSync(path.join(raiz, p), 'utf8');

describe('Activo y estructura son cosas distintas', () => {
  it('el gabinete y el tablero son ESTRUCTURA, no activos', () => {
    expect(esEstructura('CABINET')).toBe(true);
    expect(esEstructura('TABLERO_ELECTRICO')).toBe(true);
    expect(esEstructura('CAMERA')).toBe(false);
    expect(TIPOS_ACTIVO.map((t) => t.valor)).not.toContain('CABINET');
  });

  it('no se pueden dar de alta como activo, y se dice A DÓNDE ir', () => {
    /* Un «no se puede» a secas parece una función rota: quien lo lee concluye
       que el software no deja registrar. El mensaje nombra la pantalla. */
    const m = motivoParaNoCrearComoActivo('CABINET');
    expect(m).toContain('Gabinetes');
    expect(m).toContain('estructura');
    expect(motivoParaNoCrearComoActivo('TABLERO_ELECTRICO')).toContain('Electricidad');
    expect(motivoParaNoCrearComoActivo('CAMERA')).toBeNull();
  });

  it('SIGUEN teniendo nombre para pintar: hay registros viejos', () => {
    /* Quitarlos del mapa dejaría las tablas enseñando «CABINET» en crudo, que
       para quien mira es un error del software. Y el valor del enum no se
       borra nunca: un enum de PostgreSQL sólo admite AÑADIR. */
    expect(NOMBRE_DE_TIPO.CABINET).toBe('Gabinete');
    expect(NOMBRE_DE_TIPO.TABLERO_ELECTRICO).toBe('Tablero eléctrico');
    expect(leer('prisma/schema.prisma')).toMatch(/enum AssetType[\s\S]*?CABINET/);
  });

  it('LA ESTRUCTURA SÍ LLEVA HOJA DE RUTA, y no es una excepción inventada', () => {
    /* El Excel que entregó el ingeniero trae una hoja «FORMATO GABINETE» con
       quince pasos. Por eso la lista reparte por familia en vez de prohibir:
       una lista de prohibidos habría dejado al gabinete sin rutina. */
    expect(TIPOS_ESTRUCTURA.length).toBeGreaterThan(0);
    const hojas = leer('src/modules/hojas-ruta/hojas-de-arranque.ts');
    expect(hojas).toMatch(/CABINET/);
  });

  it('el SERVIDOR lo comprueba, no sólo el desplegable', () => {
    /* Si viviera únicamente en el formulario, una petición hecha a mano —o una
       pantalla vieja cacheada en un teléfono— seguiría creando gabinetes como
       activos, y nadie sabría por dónde entraron. Lección del bloque 16. */
    const svc = leer('src/modules/assets/assets.service.ts');
    const alta = svc.slice(svc.indexOf('async createSigned'), svc.indexOf('async findAll'));
    expect(alta).toContain('motivoParaNoCrearComoActivo(dto.type');
    expect(alta).toContain('BadRequestException(noVale)');
  });

  it('la lista del frontend dice EXACTAMENTE lo mismo que la del backend', () => {
    /* Son dos archivos porque no se pueden importar entre sí. Si dijeran cosas
       distintas, el formulario ofrecería un tipo que el servidor rechaza — o,
       peor, se guardaría algo que la pantalla no sabe pintar. */
    const front = fs.readFileSync(
      path.join(raiz, '..', 'frontend', 'src', 'tipos-de-equipo.ts'), 'utf8',
    );
    for (const t of TIPOS_DE_EQUIPO) {
      const re = new RegExp(`valor:\\s*'${t.valor}'[^}]*familia:\\s*'${t.familia}'`);
      expect(front).toMatch(re);
    }
    // Y al revés: que el frontend no traiga uno de más.
    const enFront = [...front.matchAll(/valor:\s*'([A-Z_]+)'/g)].map((m) => m[1]);
    expect(enFront.sort()).toEqual(TIPOS_DE_EQUIPO.map((t) => t.valor).sort());
  });
});
