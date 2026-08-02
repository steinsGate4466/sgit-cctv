import {
  CATALOGO_PERMISOS, CODIGOS_VALIDOS, PLANTILLAS_DE_ROL, soloMira,
} from '../src/modules/roles/catalogo-permisos';

/**
 * LAS PLANTILLAS DE ROL SON LA PUERTA POR DONDE ENTRA TODO.
 *
 * El ingeniero va a crear roles pulsando una plantilla. Si una plantilla
 * lleva de más un permiso peligroso, ese error se replica en cada rol que se
 * cree a partir de ella, y nadie lo revisa nunca porque "venía puesto".
 *
 * Por eso las plantillas se prueban como si fueran código de producción.
 */

const permisosDe = (nombre: string) =>
  PLANTILLAS_DE_ROL.find((p) => p.nombre.startsWith(nombre))!.permisos;

describe('catálogo de permisos', () => {
  it('no hay códigos repetidos', () => {
    const todos = CATALOGO_PERMISOS.flatMap((g) => g.permisos.map((p) => p.code));
    expect(todos.length).toBe(new Set(todos).size);
  });

  it('cada permiso explica qué deja hacer, en castellano', () => {
    for (const g of CATALOGO_PERMISOS) {
      for (const p of g.permisos) {
        expect(p.nombre.length).toBeGreaterThan(3);
        // Una explicación de tres palabras no explica nada: la pantalla la
        // enseña para que el ingeniero decida, no para rellenar hueco.
        expect(p.explica.length).toBeGreaterThan(20);
        expect(p.explica).not.toMatch(/\bTODO\b|pendiente|TBD/i);
      }
    }
  });

  it('los permisos peligrosos llevan aviso', () => {
    const peligrosos = ['user.manage', 'role.manage', 'credential.read', 'credential.manage', 'asset.delete'];
    const conAviso = CATALOGO_PERMISOS
      .flatMap((g) => g.permisos)
      .filter((p) => p.cuidado)
      .map((p) => p.code);
    for (const p of peligrosos) expect(conAviso).toContain(p);
  });
});

describe('plantillas de rol', () => {
  it('todas usan códigos que existen', () => {
    for (const p of PLANTILLAS_DE_ROL) {
      for (const c of p.permisos) expect(CODIGOS_VALIDOS.has(c)).toBe(true);
    }
  });

  it('ninguna plantilla reparte credenciales de cámaras', () => {
    // Son el usuario y la contraseña de los equipos de planta: acceso
    // directo al vídeo. Eso se da a mano, uno por uno, nunca de serie.
    for (const p of PLANTILLAS_DE_ROL) {
      expect(p.permisos).not.toContain('credential.read');
      expect(p.permisos).not.toContain('credential.manage');
    }
  });

  it('ninguna plantilla reparte administración', () => {
    for (const p of PLANTILLAS_DE_ROL) {
      expect(p.permisos).not.toContain('user.manage');
      expect(p.permisos).not.toContain('role.manage');
      expect(p.permisos).not.toContain('audit.read');
      expect(p.permisos).not.toContain('asset.delete');
    }
  });

  it('EL JEFE DE LÍNEA NO PUEDE TOCAR NADA', () => {
    // Lo pidió el ingeniero con estas palabras: "solo mirar, no intervenir".
    // Si algún día alguien le añade wo.update "para que pueda cerrar las
    // suyas", esta prueba se cae y obliga a decidirlo a propósito.
    const jefe = permisosDe('Jefe de línea');
    expect(soloMira(jefe)).toBe(true);
    expect(jefe).toContain('wo.report');   // sí puede descargar el informe
    expect(jefe).toContain('dashboard.read');
    expect(jefe).not.toContain('wo.create');
    expect(jefe).not.toContain('wo.update');
    expect(jefe).not.toContain('wo.approve');
    expect(jefe).not.toContain('incident.close');
  });

  it('el técnico de red SÍ puede trabajar la orden, pero no cerrarla', () => {
    // El cierre lo firma el ingeniero: es lo que decidimos en 4A.
    const tec = permisosDe('Técnico de red');
    expect(tec).toContain('wo.update');
    expect(tec).not.toContain('wo.approve');
    expect(soloMira(tec)).toBe(false);
  });

  it('el contratista NO ve el almacén ni las incidencias de otros', () => {
    const ext = permisosDe('Contratista');
    expect(ext).not.toContain('inventory.read');
    expect(ext).not.toContain('incident.read');
    expect(ext).toContain('wo.update');
  });

  it('soloMira distingue leer de escribir', () => {
    expect(soloMira(['dashboard.read', 'wo.read'])).toBe(true);
    expect(soloMira(['dashboard.read', 'wo.update'])).toBe(false);
    // Una lista vacía no es "sólo lectura": es un rol que no puede ni entrar.
    expect(soloMira([])).toBe(false);
  });
});
