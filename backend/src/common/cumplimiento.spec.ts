import { EntradaCumplimiento, cumplimientoNormativo } from './cumplimiento';

/* =============================================================================
   BLOQUE 78 · CUMPLIMIENTO NORMATIVO — indicador ⑤ del ingeniero
   -----------------------------------------------------------------------------
   Contesta «si mañana viene una auditoría, ¿qué NO vamos a poder enseñar?».

   No mide si el trabajo se hizo —eso es el cumplimiento del preventivo—: mide
   si está DOCUMENTADO como el propio sistema exige. Para una auditoría, un
   trabajo hecho y sin firmar no se hizo.
============================================================================= */

const zona = (o: any = {}) => ({
  id: 'z1', nombre: 'Lecho de enfriamiento',
  criticidadProduccion: 'CRITICA', porQueEsVital: 'Único punto de vista del colado',
  intervencionFirmada: 'EN_MARCHA', revisarAntesDe: null, tieneActivos: true, ...o,
});
const orden = (o: any = {}) => ({ code: 'OM-001', tipo: 'CORRECTIVO', rootCause: 'Óptica sucia', ...o });
const activo = (o: any = {}) => ({ assetCode: 'AA-CAM-T1-001', medioAcceso: 'A_PIE', letraAbc: 'B', ...o });

const todo = (o: Partial<EntradaCumplimiento> = {}): EntradaCumplimiento => ({
  zonas: [zona()], ordenesCerradas: [orden()], activos: [activo()],
  ahora: new Date(2026, 8, 30), ...o,
});

const reglas = (r: ReturnType<typeof cumplimientoNormativo>) =>
  r.hallazgos.map((h) => h.regla);

describe('Bloque 78 — cumplimiento normativo', () => {
  it('con todo en regla no hay hallazgos y el porcentaje es 100', () => {
    const r = cumplimientoNormativo(todo());
    expect(r.hallazgos).toEqual([]);
    expect(r.pct).toBe(100);
  });

  describe('Las seis reglas cazan lo suyo', () => {
    it('zona crítica sin motivo escrito', () => {
      const r = cumplimientoNormativo(todo({ zonas: [zona({ porQueEsVital: '  ' })] }));
      expect(reglas(r)).toContain('zona-sin-motivo');
    });

    it('una zona MEDIA sin motivo NO incumple: sólo Alta y Crítica lo exigen', () => {
      const r = cumplimientoNormativo(todo({
        zonas: [zona({ criticidadProduccion: 'MEDIA', porQueEsVital: null })],
      }));
      expect(reglas(r)).not.toContain('zona-sin-motivo');
    });

    it('zona con equipos y sin intervención firmada', () => {
      const r = cumplimientoNormativo(todo({ zonas: [zona({ intervencionFirmada: null })] }));
      expect(reglas(r)).toContain('zona-sin-firma');
    });

    it('una zona SIN equipos no necesita firma', () => {
      /* Firmar cómo se interviene un sitio donde no hay nada es papeleo, y el
         indicador se llenaría de líneas que nadie va a resolver. */
      const r = cumplimientoNormativo(todo({
        zonas: [zona({ intervencionFirmada: null, tieneActivos: false })],
      }));
      expect(reglas(r)).not.toContain('zona-sin-firma');
    });

    it('declaración caducada', () => {
      const r = cumplimientoNormativo(todo({
        zonas: [zona({ revisarAntesDe: new Date(2026, 0, 1) })],
      }));
      expect(reglas(r)).toContain('declaracion-caducada');
    });

    it('orden correctiva cerrada sin causa raíz', () => {
      const r = cumplimientoNormativo(todo({ ordenesCerradas: [orden({ rootCause: null })] }));
      expect(reglas(r)).toContain('orden-sin-causa');
    });

    it('una PREVENTIVA sin causa no incumple: no vino de ninguna avería', () => {
      const r = cumplimientoNormativo(todo({
        ordenesCerradas: [orden({ tipo: 'PREVENTIVO', rootCause: null })],
      }));
      expect(reglas(r)).not.toContain('orden-sin-causa');
    });

    it('equipo sin acceso declarado — es el de SSOMA', () => {
      const r = cumplimientoNormativo(todo({ activos: [activo({ medioAcceso: null })] }));
      expect(reglas(r)).toContain('acceso-sin-declarar');
    });

    it('equipo sin letra A/B/C', () => {
      const r = cumplimientoNormativo(todo({ activos: [activo({ letraAbc: 'SIN_CLASIFICAR' })] }));
      expect(reglas(r)).toContain('sin-criticidad');
      const r2 = cumplimientoNormativo(todo({ activos: [activo({ letraAbc: null })] }));
      expect(reglas(r2)).toContain('sin-criticidad');
    });
  });

  describe('Lo que hace que el indicador sirva', () => {
    it('cada hallazgo dice DÓNDE se arregla', () => {
      /* Sin esto el indicador es un reproche, no una tarea. */
      const r = cumplimientoNormativo(todo({ activos: [activo({ medioAcceso: null })] }));
      expect(r.hallazgos[0].donde).toBeTruthy();
      expect(r.hallazgos[0].porque).toBeTruthy();
    });

    it('lo PEOR va primero, por proporción y no por número absoluto', () => {
      /* Cinco de cinco es más grave que cincuenta de cuatrocientas. */
      const muchos = Array.from({ length: 100 }, (_, i) => activo({
        assetCode: `A-${i}`,
        // 100 sin letra (100 %), 5 sin acceso (5 %).
        letraAbc: 'SIN_CLASIFICAR',
        medioAcceso: i < 5 ? null : 'A_PIE',
      }));
      const r = cumplimientoNormativo(todo({ activos: muchos }));
      expect(r.hallazgos[0].regla).toBe('sin-criticidad');
    });

    it('trae ejemplos para poder empezar por algo', () => {
      const r = cumplimientoNormativo(todo({
        activos: [activo({ assetCode: 'X-1', medioAcceso: null })],
      }));
      expect(r.hallazgos[0].ejemplos).toContain('X-1');
    });

    it('una regla sin nadie a quien aplicar NO cuenta como cumplida', () => {
      /* Contarla cumplida inflaría el porcentaje con reglas que no se han
         probado: la forma más fácil de que un indicador diga que todo va bien
         sin haber mirado nada. */
      const conZonas = cumplimientoNormativo(todo());
      const sinOrdenes = cumplimientoNormativo(todo({ ordenesCerradas: [] }));
      expect(sinOrdenes.totalReglas).toBe(conZonas.totalReglas - 1);
    });

    it('sin nada cargado el porcentaje es null, no 100', () => {
      /* Un 100 % sin datos es la peor cifra posible: dice que todo va perfecto
         justo cuando no hay nada que mirar, y nadie vuelve. */
      const r = cumplimientoNormativo({ zonas: [], ordenesCerradas: [], activos: [] });
      expect(r.pct).toBeNull();
      expect(r.hallazgos).toEqual([]);
    });
  });
});
