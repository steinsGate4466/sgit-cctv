import * as fs from 'fs';
import * as path from 'path';
import { diaDePlanta, omVencida } from '../src/common/dia-de-planta';

/**
 * BLOQUE 184 · el día que se elige en un formulario es ESE día en la planta.
 *
 * `new Date('2026-10-30')` es medianoche UTC: las 19:00 del 29 en Perú. Una
 * orden asignada para el 30 salía «29/10» y vencía un día antes.
 */
describe('día del calendario en la hora de la planta', () => {
  const enLima = (d: Date) => d.toLocaleDateString('es-PE', { timeZone: 'America/Lima' });

  it('un día suelto es ese día en Perú, a mediodía', () => {
    const d = diaDePlanta('2026-10-30');
    expect(d.toISOString()).toBe('2026-10-30T17:00:00.000Z');
    expect(enLima(d)).toBe('30/10/2026');
    // Lo que pasaba antes, para que se vea la diferencia:
    expect(enLima(new Date('2026-10-30'))).toBe('29/10/2026');
  });

  it('lo que ya trae hora pasa tal cual', () => {
    expect(diaDePlanta('2026-10-30T08:00:00.000Z').toISOString()).toBe('2026-10-30T08:00:00.000Z');
    const ya = new Date('2026-01-01T10:00:00Z');
    expect(diaDePlanta(ya)).toBe(ya);
  });

  it('una orden para HOY no está vencida hoy, sí mañana', () => {
    const programada = diaDePlanta('2026-10-30');
    expect(omVencida(programada, new Date('2026-10-30T23:00:00-05:00'))).toBe(false);
    expect(omVencida(programada, new Date('2026-10-31T00:30:00-05:00'))).toBe(true);
  });

  it('ningún servicio vuelve a leer un día de formulario con `new Date(dto.…)`', () => {
    const DIAS = ['scheduledDate', 'finDeSoporte', 'revisarAntesDe', 'installedAt', 'lastServiceAt', 'desde', 'hasta'];
    const raiz = path.join(__dirname, '..', 'src', 'modules');
    const malos: string[] = [];
    const recorrer = (dir: string) => {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) recorrer(p);
        else if (/\.service\.ts$/.test(f.name)) {
          const s = fs.readFileSync(p, 'utf8');
          for (const c of DIAS) if (s.includes(`new Date(dto.${c})`)) malos.push(`${path.relative(raiz, p)}: dto.${c}`);
        }
      }
    };
    recorrer(raiz);
    expect(malos).toEqual([]);
  });
});
