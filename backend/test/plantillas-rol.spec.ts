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
    /* EXCEPCIÓN DOCUMENTADA (bloque 28): la plantilla «Auditoría / Control
       interno» sí lleva `audit.read`, porque es su única razón de existir —
       una plantilla de auditoría que no deja leer la auditoría no sirve para
       nada y obligaría a marcarlo a mano, que es peor.

       La excepción es segura porque esa plantilla no lleva NI UNA escritura,
       ni credenciales. Y la regla de fondo sigue en pie para todas: nada de
       gestionar usuarios, roles ni borrar. Se deja explícita aquí en vez de
       ablandar la prueba en silencio, que es como se pierden estas reglas. */
    const PUEDEN_AUDITAR = ['Auditoría / Control interno'];
    for (const p of PLANTILLAS_DE_ROL) {
      expect(p.permisos).not.toContain('user.manage');
      expect(p.permisos).not.toContain('role.manage');
      expect(p.permisos).not.toContain('asset.delete');
      if (!PUEDEN_AUDITAR.includes(p.nombre)) {
        expect(p.permisos).not.toContain('audit.read');
      }
    }
  });

  it('la plantilla de auditoría no puede escribir NADA', () => {
    // El contrapeso de la excepción de arriba. Auditar no es tener acceso.
    const aud = permisosDe('Auditoría');
    expect(aud).toContain('audit.read');
    expect(soloMira(aud)).toBe(true);
    expect(aud).not.toContain('credential.read');
  });

  it('sólo dos plantillas pueden firmar dónde se trabaja con el tren en marcha', () => {
    /* `zona.intervencion` autoriza a acercarse a la línea con el tren
       produciendo. Si algún día aparece en una tercera plantilla, esta prueba
       se cae y obliga a decidirlo con la cabeza fría, no en caliente. */
    const conFirma = PLANTILLAS_DE_ROL
      .filter((p) => p.permisos.includes('zona.intervencion'))
      .map((p) => p.nombre);
    expect(conFirma.sort()).toEqual(['Supervisor Operativo de Tercería']);
  });

  it('EL JEFE DE LÍNEA SÓLO ESCRIBE DOS COSAS', () => {
    /* Antes esta prueba exigía `soloMira(jefe) === true` porque el ingeniero
       lo pidió con estas palabras: "solo mirar, no intervenir". Y funcionó:
       se cayó en cuanto Producción recibió capacidad de escritura, que es
       exactamente para lo que estaba puesta.

       La decisión se tomó a propósito en el bloque 26: Producción DECLARA qué
       zonas son vitales, porque nadie más sabe hacerlo. Así que la regla no se
       borra, se APRIETA: puede escribir exactamente dos cosas y ninguna más.
       Si mañana aparece una tercera, esto vuelve a caerse. */
    const jefe = permisosDe('Jefe de línea');
    const ESCRITURAS_PERMITIDAS = ['zona.criticidad', 'incident.create'];
    const escribe = jefe.filter((c) => !soloMira([c]));
    expect(escribe.sort()).toEqual([...ESCRITURAS_PERMITIDAS].sort());
    // Y sobre todo: no autoriza a nadie a acercarse a la línea.
    expect(jefe).not.toContain('zona.intervencion');
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
