import { PLANTILLAS_DE_ROL } from '../src/modules/roles/catalogo-permisos';

/* =============================================================================
   BLOQUE 68 · QUIÉN REPORTA UNA AVERÍA Y QUIÉN ABRE UNA ORDEN
   -----------------------------------------------------------------------------
   POR QUÉ ESTA PRUEBA EXISTE

   El usuario pidió acotar quién puede generar una incidencia y una OM desde el
   QR. El reparto se decidió POR CAPACIDAD y se aplica en dos sitios que tienen
   que decir lo mismo:

     · las plantillas de `catalogo-permisos.ts` (lo que se crea de aquí en
       adelante desde la interfaz),
     · la migración `20260904000000_quien_reporta_y_quien_abre_orden` (los
       roles que YA existen en la base).

   Si los dos se desincronizan, el rol que crees mañana desde la pantalla no
   se parecerá al que tienes hoy, y nadie se entera hasta que alguien no puede
   abrir su orden estando en planta.

   -----------------------------------------------------------------------------
   Y SIEMPRE LAS DOS DIRECCIONES

   Sólo con «el que puede, puede» se puede tener un reparto que se lo da a
   todo el mundo. Sólo con «el que no puede, no puede» se puede tener uno que
   no se lo da a nadie. Hacen falta las dos afirmaciones o no se está
   comprobando nada.
============================================================================= */

/** Reproduce la REGLA 2 de la migración, tal cual está escrita en el SQL. */
const MIRA_O_INTERVIENE = ['activos.mirar', 'om.mirar', 'asset.update'];
const conservaReporte = (permisos: string[]) =>
  MIRA_O_INTERVIENE.some((p) => permisos.includes(p));

/** Reproduce la REGLA 1 de la migración. */
const abreOrden = (permisos: string[]) => permisos.includes('om.mirar');

const plantilla = (nombre: string) => {
  const p = PLANTILLAS_DE_ROL.find((x) => x.nombre === nombre);
  if (!p) throw new Error(`No existe la plantilla «${nombre}»`);
  return p.permisos;
};

describe('Bloque 68 — quién reporta y quién abre una orden', () => {
  /* ------------------------------------------------------------------ OM */
  describe('Abrir una OM desde el QR (wo.create)', () => {
    it('lo tienen los dos cargos del tren: son los que están en la línea', () => {
      expect(plantilla('Jefe de Tren')).toContain('wo.create');
      expect(plantilla('Jefe de línea (Producción)')).toContain('wo.create');
    });

    it('NO lo tiene nadie más — abrir órdenes no es de todo el mundo', () => {
      const conPermiso = PLANTILLAS_DE_ROL
        .filter((p) => p.permisos.includes('wo.create'))
        .map((p) => p.nombre)
        .sort();
      expect(conPermiso).toEqual(['Jefe de Tren', 'Jefe de línea (Producción)']);
    });

    it('ABRIR no es CERRAR: ninguna plantilla gana wo.approve', () => {
      // El cierre lleva firma y materiales retirados. Sigue siendo del Jefe
      // de Mantenimiento, que es administrador y no sale en las plantillas.
      const cierran = PLANTILLAS_DE_ROL.filter((p) => p.permisos.includes('wo.approve'));
      expect(cierran).toEqual([]);
    });

    it('la plantilla coincide con la REGLA 1 de la migración', () => {
      for (const p of PLANTILLAS_DE_ROL) {
        expect([p.nombre, p.permisos.includes('wo.create')])
          .toEqual([p.nombre, abreOrden(p.permisos)]);
      }
    });
  });

  /* ----------------------------------------------------------- Incidencia */
  describe('Reportar una avería (incident.create)', () => {
    it('lo conserva quien MIRA las cámaras de su tren', () => {
      expect(plantilla('Operador de Púlpito')).toContain('incident.create');
      expect(plantilla('Jefe de Tren')).toContain('incident.create');
      expect(plantilla('Jefe de línea (Producción)')).toContain('incident.create');
    });

    it('lo conserva quien INTERVIENE el equipo', () => {
      expect(plantilla('Técnico de campo (CCTV)')).toContain('incident.create');
      expect(plantilla('Técnico de red')).toContain('incident.create');
      expect(plantilla('Supervisor TI / Redes')).toContain('incident.create');
    });

    it('la tercería NO abre expedientes: cuenta lo que ve dentro de la orden', () => {
      expect(plantilla('Contratista (tercería)')).not.toContain('incident.create');
      expect(plantilla('Supervisor Operativo de Tercería')).not.toContain('incident.create');
      // Pero sigue pudiendo contarlo donde queda atado al trabajo.
      expect(plantilla('Contratista (tercería)')).toContain('wo.report');
      expect(plantilla('Supervisor Operativo de Tercería')).toContain('wo.report');
    });

    it('quien sólo consulta no reporta', () => {
      expect(plantilla('Consulta')).not.toContain('incident.create');
      expect(plantilla('Gerencia / Jefatura de planta')).not.toContain('incident.create');
      expect(plantilla('Almacén')).not.toContain('incident.create');
      expect(plantilla('Auditoría / Control interno')).not.toContain('incident.create');
    });

    it('la plantilla coincide con la REGLA 2 de la migración', () => {
      for (const p of PLANTILLAS_DE_ROL) {
        expect([p.nombre, p.permisos.includes('incident.create')])
          .toEqual([p.nombre, conservaReporte(p.permisos)]);
      }
    });
  });

  /* ------------------------------------------------------ el púlpito vive */
  it('el Operador de Púlpito conserva su única escritura', () => {
    /* Es la detección más rápida que tiene la planta: la persona que está
       ocho horas delante del monitor es la primera que ve el cuadro en negro.
       Si se le quita esto, el rol se queda sin función y el camino corto de
       aviso se cierra. Quede fijado por una prueba y no por la memoria. */
    const p = plantilla('Operador de Púlpito');
    expect(p).toContain('incident.create');
    expect(p).toContain('activos.mirar');
    expect(p).not.toContain('wo.create');       // avisa, no planifica
    expect(p).not.toContain('wo.update');       // y por eso ve el botón, no el catálogo
  });

  /* ---------------------------------------------- ni un nombre en el SQL */
  it('la migración no compara por el NOMBRE de ningún rol', () => {
    // El fallo del bloque 62-A: comparar por nombre no falla, NO HACE NADA.
    // Falla abriendo, que es el peor modo de fallar.
    const fs = require('fs');
    const path = require('path');
    const sql = fs.readFileSync(
      path.join(
        __dirname, '..', 'prisma', 'migrations',
        '20260904000000_quien_reporta_y_quien_abre_orden', 'migration.sql',
      ),
      'utf8',
    );
    // Se miran sólo las sentencias, no los comentarios que sí explican los cargos.
    const sentencias = sql
      .split('\n')
      .filter((l: string) => !l.trimStart().startsWith('--'))
      .join('\n');

    for (const p of PLANTILLAS_DE_ROL) {
      expect([p.nombre, sentencias.includes(p.nombre)]).toEqual([p.nombre, false]);
    }
    expect(sentencias).not.toContain('Jefe de Mantenimiento');
    expect(sentencias).not.toContain('r."name"');
  });
});
