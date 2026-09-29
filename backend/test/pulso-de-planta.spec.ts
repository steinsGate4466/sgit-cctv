/**
 * Bloque 158 · el pulso de la bandeja: día de planta, carga y movimientos.
 */
import { inicioDelDiaDePlanta, lineaDeMovimientos, ordenarCarga, textoCorto } from '../src/modules/dashboard/pulso';

describe('Pulso de la planta (Mi bandeja)', () => {
  it('el día empieza a medianoche de Perú, no de UTC', () => {
    // 28/09 02:00 UTC = 27/09 21:00 en Perú: el día de planta todavía es el 27.
    expect(inicioDelDiaDePlanta(new Date('2026-09-28T02:00:00Z'), -5).toISOString()).toBe('2026-09-27T05:00:00.000Z');
    // 28/09 06:00 UTC = 28/09 01:00 en Perú.
    expect(inicioDelDiaDePlanta(new Date('2026-09-28T06:00:00Z'), -5).toISOString()).toBe('2026-09-28T05:00:00.000Z');
  });

  it('la carga pone arriba a quien tiene vencidas, no a quien tiene más', () => {
    const r = ordenarCarga([
      { tecnicoId: 'a', tecnico: 'Ana', abiertas: 6, enProceso: 1, vencidas: 0 },
      { tecnicoId: 'b', tecnico: 'Luis', abiertas: 2, enProceso: 0, vencidas: 2 },
    ]);
    expect(r.map((x) => x.tecnico)).toEqual(['Luis', 'Ana']);
  });

  it('los movimientos van del más nuevo al más viejo, sin repetir y con texto corto', () => {
    const largo = 'x'.repeat(200) + '\nsegunda línea';
    const r = lineaDeMovimientos([
      { cuando: '2026-09-28T10:00:00Z', tipo: 'OM_CREADA', codigo: 'OM-1', texto: largo, quien: null, ruta: '/' },
      { cuando: '2026-09-28T12:00:00Z', tipo: 'INCIDENCIA', codigo: 'INC-1', texto: 'Sin imagen', quien: 'Ana', ruta: '/' },
      { cuando: '2026-09-28T09:00:00Z', tipo: 'OM_CREADA', codigo: 'OM-1', texto: 'repetida', quien: null, ruta: '/' },
    ]);
    expect(r.map((m) => m.codigo)).toEqual(['INC-1', 'OM-1']);
    expect(r[1].texto.length).toBeLessThanOrEqual(90);
    expect(r[1].texto.endsWith('…')).toBe(true);
    expect(textoCorto('uno\ndos')).toBe('uno');
  });
});

import { omVencida } from '../src/common/dia-de-planta';

describe('Cuándo vence una OM (bloque 158)', () => {
  // 28/09 21:40 en Perú = 29/09 02:40 UTC.
  const ahora = new Date('2026-09-29T02:40:00Z');
  it('programada hoy a las 08:00 NO está vencida aunque ya pasó la hora', () => {
    expect(omVencida('2026-09-28T13:00:00Z', ahora)).toBe(false);
  });
  it('programada ayer sí está vencida', () => {
    expect(omVencida('2026-09-27T13:00:00Z', ahora)).toBe(true);
  });
  it('sin fecha no vence (no se inventa un vencimiento)', () => {
    expect(omVencida(null, ahora)).toBe(false);
  });
});
