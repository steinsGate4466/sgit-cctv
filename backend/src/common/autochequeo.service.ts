import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  autochequeo, resumirChequeo, FotoDeLaBase, LoQueEsperaElCodigo,
} from './autochequeo';
import { CODIGOS_VALIDOS } from '../modules/roles/catalogo-permisos';

/**
 * EL AUTOCHEQUEO, CONECTADO AL ARRANQUE — bloque 44.
 *
 * =============================================================================
 *  POR QUÉ `OnApplicationBootstrap` Y NO `OnModuleInit`
 * =============================================================================
 *  `OnModuleInit` corre mientras Nest todavía está montando módulos. Si la
 *  conexión a la base aún no está lista, el chequeo falla por un motivo que no
 *  tiene nada que ver con lo que viene a comprobar — y un chequeo que se
 *  equivoca al arrancar es peor que no tenerlo: enseña a ignorarlo.
 *
 *  `OnApplicationBootstrap` corre cuando TODO está montado.
 *
 * =============================================================================
 *  NO BLOQUEA EL ARRANQUE. NUNCA.
 * =============================================================================
 *  Está entero dentro de un try/catch, y si el propio chequeo revienta se
 *  registra y se sigue.
 *
 *  La razón es de planta, no de código: un autochequeo que tumba el servicio
 *  convierte un problema de DATOS en una caída de LAMINACIÓN. Si alguien
 *  renombra un rol un martes por la tarde, la cuadrilla no puede quedarse sin
 *  sistema por eso.
 *
 *  El objetivo no es impedir: es que deje de ser silencioso. Un ERROR en el
 *  registro de Railway se ve; un menú que falta, no.
 */
@Injectable()
export class AutochequeoService implements OnApplicationBootstrap {
  private readonly log = new Logger('Autochequeo');

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    try {
      const foto = await this.leerLaBase();
      const hallazgos = autochequeo(foto, this.loQueEsperaElCodigo());

      const resumen = resumirChequeo(hallazgos);
      if (hallazgos.some((h) => h.gravedad === 'ERROR')) this.log.error(resumen);
      else this.log.log(resumen);

      /* Cada hallazgo en su propia línea. Un bloque de texto largo en el
         registro de Railway se lee como un volcado de error y se salta; una
         línea por hallazgo, con su clave delante, se puede buscar. */
      for (const h of hallazgos) {
        const linea = `[${h.clave}] ${h.que} → ${h.queHacer}`;
        if (h.gravedad === 'ERROR') this.log.error(linea);
        else this.log.warn(linea);
      }
    } catch (e: any) {
      /* Si el chequeo se cae, el sistema sigue. Se dice que NO se pudo
         comprobar, que es distinto de decir que todo está bien: lo segundo
         sería exactamente la mentira silenciosa que esto viene a eliminar. */
      this.log.error(
        'No se pudo ejecutar el autochequeo, así que NO se sabe si la base '
        + `coincide con el código: ${e?.message ?? e}`,
      );
    }
  }

  /**
   * La foto de la base, en cuatro consultas.
   *
   * Se hace UNA vez al arrancar, así que no importa que sean cuatro. Lo que sí
   * importa es que no traiga filas de más: en una planta con miles de activos,
   * esto tiene que seguir tardando lo mismo. Por eso los activos se CUENTAN, no
   * se leen.
   */
  private async leerLaBase(): Promise<FotoDeLaBase> {
    const [permisos, roles, trenes, activos] = await Promise.all([
      this.prisma.permission.findMany({ select: { code: true } }),
      this.prisma.role.findMany({
        select: {
          name: true, exigeAmbito: true,
          permissions: { select: { permission: { select: { code: true } } } },
          users: { select: { ambitoTrenes: true } },
        },
      }),
      this.prisma.location.findMany({
        where: { type: 'TREN' },
        select: { code: true, siglaTren: true },
      }),
      this.prisma.asset.count({ where: { deletedAt: null } }),
    ]);

    return {
      permisosEnLaBase: permisos.map((p) => p.code),
      roles: roles.map((r) => ({
        nombre: r.name,
        permisos: r.permissions.map((rp) => rp.permission.code),
        exigeAmbito: r.exigeAmbito,
        usuarios: r.users.length,
        /* Se filtran los vacíos: un `['']` de una importación mal hecha contaría
           como tren asignado y esa persona no vería nada, sin explicación. */
        usuariosSinAmbito: r.users.filter(
          (u) => (u.ambitoTrenes ?? []).filter(Boolean).length === 0,
        ).length,
      })),
      trenes: trenes.map((t) => ({ code: t.code, sigla: t.siglaTren })),
      activos,
    };
  }

  /**
   * Lo que el código espera. Se lee del CATÁLOGO DE PERMISOS, que es la lista
   * que ya mantiene `verificar-roles`, en vez de escribirla otra vez aquí.
   *
   * Repetir la lista sería cometer el mismo error que este chequeo persigue:
   * dos sitios que dicen lo mismo y nada los obliga a coincidir.
   */
  private loQueEsperaElCodigo(): LoQueEsperaElCodigo {
    return {
      permisos: [...CODIGOS_VALIDOS],
      /* Duplica la lista de la semilla, y es la única duplicación que queda.
         La semilla no se puede importar desde el backend: vive fuera de `src`
         y se compila aparte. El verificador de roles ya compara ambas. */
      rolesSectorizados: ['Jefe de Tren', 'Jefe de Producción'],
      permisosDeAdministrador: ['asset.delete', 'user.manage'],
    };
  }
}
