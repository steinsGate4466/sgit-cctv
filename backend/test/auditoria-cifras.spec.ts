import * as fs from 'fs';
import * as path from 'path';

/* =============================================================================
   AUDITORÍA 20/10/2026 · GRUPO B · LAS CIFRAS QUE SE CONTRADICEN
   -----------------------------------------------------------------------------
   Ninguno de estos fallos rompe nada: cada número era «correcto» en su cálculo
   y mentía al lado de otro. Estas pruebas fijan el ARREGLO leyendo el código,
   porque el fallo típico es volver a la versión corta.
============================================================================= */

const src = (f: string) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');

describe('A1 · «Quién está dentro» deja de decir «0 personas trabajando»', () => {
  it('el token de acceso lleva la sesión (`sid`) y la sesión nace con su última actividad', () => {
    const a = src('modules/auth/auth.service.ts');
    expect(a).toMatch(/sid: jti/);
    expect(a).toMatch(/ultimoUsoEn: new Date\(\),\s*\},\s*\}\)\.catch/);
    expect(src('modules/auth/jwt.strategy.ts')).toContain('sid: payload.sid');
  });

  it('cada petición apunta el uso, como mucho una vez por minuto y sin poder tumbarla', () => {
    const g = src('common/guards/acceso-vigente.guard.ts');
    expect(g).toContain('this.marcarUso(user.sid)');
    expect(g).toContain('ahora - ultima < 60_000');
    expect(g).toMatch(/updateMany\(\{ where: \{ id: sid, revocadaEn: null \}[\s\S]*?\.catch\(\(\) => null\)/);
  });
});

describe('A5 · Grabadores enseña el estado EFECTIVO, como Impacto y Activos', () => {
  const g = src('modules/network/grabadores.service.ts');
  it('lista y rejilla calculan el estado efectivo', () => {
    expect(g.match(/computeEffectiveStatuses\(/g)?.length).toBeGreaterThanOrEqual(2);
    expect(g).toContain('estado: efectivo[n.id] || n.status');
    expect(g).toContain('estado: efectivo[nvr.id] || nvr.status');
  });
});

describe('B · Dashboard: «Equipos en trabajo» cuenta también el equipo de la orden', () => {
  it('suma `assetId` de las órdenes abiertas a los apuntados como INTERVENIDO, sin repetir', () => {
    const d = src('modules/dashboard/dashboard.service.ts');
    expect(d).toContain("assetId: { not: null }");
    expect(d).toContain('const pares = new Set<string>()');
  });
});

describe('B · Indicadores no pintan 100 % sin datos', () => {
  const s = src('modules/indicadores/indicadores.service.ts');
  it('la satisfacción cuenta las vencidas sin resolver como fuera de plazo', () => {
    expect(s).toContain('const medidas = resueltas + vencidasSinResolver');
    expect(s).toContain('pct: medidas ? Math.round((enPlazo / medidas) * 100) : null');
  });
  it('sin una sola avería, la vigilancia disponible es «sin datos»', () => {
    expect(s).toContain('fallas.some((f) => !f.esFalsaAlarma) ? {} : { pct: null }');
  });
});

describe('B · Bandeja: «sin detallar» no incluye lo que ya tiene avance', () => {
  it('el filtro exige avance 0', () => {
    expect(src('modules/dashboard/bandeja.service.ts')).toContain('detailedAt: null, status: abiertas, progressPct: 0');
  });
});

describe('B · Activos: el reparto cuenta lo mismo que la lista', () => {
  it('se recorta a los ids del filtro y a la criticidad del tren del usuario', () => {
    const a = src('modules/assets/assets.service.ts');
    expect(a).toContain('this.criticidad.resumen({}, userId)');
    expect(a).toContain('if (idsDelFiltro && !idsDelFiltro.has(id)) continue;');
  });
});
