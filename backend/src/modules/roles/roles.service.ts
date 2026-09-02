import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CATALOGO_PERMISOS, CODIGOS_VALIDOS, PLANTILLAS_DE_ROL, soloMira } from './catalogo-permisos';
import { motivoParaNoBorrar, motivoParaNoGuardar, normalizarAmbito } from './roles.guardas';
import { AccesoVigenteGuard } from '../../common/guards/acceso-vigente.guard';

/**
 * ROLES QUE CREA EL INGENIERO.
 *
 * Hasta ahora los roles venían fijos desde la semilla. Cada vez que hacía
 * falta uno nuevo —un contratista, un jefe de línea— había que tocar código
 * y desplegar. Ahora se crea desde la pantalla.
 *
 * Todo lo que decide algo delicado está en roles.guardas.ts, que es una
 * función pura con pruebas. Este servicio se limita a preguntar a la base y
 * a obedecer.
 */
@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  /** El catálogo en castellano + las plantillas para no empezar de cero. */
  catalogo() {
    return { grupos: CATALOGO_PERMISOS, plantillas: PLANTILLAS_DE_ROL };
  }

  async listar() {
    const roles = await this.prisma.role.findMany({
      orderBy: [{ sistema: 'desc' }, { name: 'asc' }],
      include: {
        permissions: { include: { permission: { select: { code: true } } } },
        _count: { select: { users: true } },
      },
    });
    return roles.map((r) => {
      const permisos = r.permissions.map((p) => p.permission.code);
      return {
        id: r.id,
        nombre: r.name,
        descripcion: r.description,
        sistema: r.sistema,
        usuarios: r._count.users,
        permisos,
        // Se calcula aquí y no en la pantalla: la etiqueta "sólo consulta"
        // tiene que decir la verdad venga de donde venga la consulta.
        soloConsulta: soloMira(permisos),
      };
    });
  }

  async crear(dto: { nombre?: string; descripcion?: string; permisos?: string[] }) {
    const nombre = (dto.nombre || '').trim();
    if (nombre.length < 3) {
      throw new BadRequestException('El nombre del rol necesita al menos 3 letras.');
    }
    const repetido = await this.prisma.role.findFirst({
      where: { name: { equals: nombre, mode: 'insensitive' } },
    });
    if (repetido) {
      throw new BadRequestException(`Ya existe un rol llamado "${repetido.name}".`);
    }
    const codigos = this.validarCodigos(dto.permisos || []);
    if (codigos.length === 0) {
      throw new BadRequestException(
        'Un rol sin permisos deja a sus usuarios sin poder ni entrar. Marca al menos "Ver tableros".',
      );
    }
    const permisos = await this.prisma.permission.findMany({ where: { code: { in: codigos } } });
    return this.prisma.role.create({
      data: {
        name: nombre,
        description: (dto.descripcion || '').trim() || null,
        sistema: false, // lo que crea una persona, una persona lo puede borrar
        permissions: { create: permisos.map((p) => ({ permissionId: p.id })) },
      },
      select: { id: true, name: true },
    });
  }

  async actualizar(
    id: string,
    dto: { descripcion?: string; permisos?: string[] },
    editorUserId: string,
  ) {
    // El rol del editor se lee de la BASE, no del token.
    // Motivo: si se leyera del token, alguien con la sesión abierta desde
    // antes de un cambio de rol pasaría por otro del que ya no es. La
    // administración de permisos es justo donde eso no puede ocurrir.
    const editor = await this.prisma.user.findUnique({
      where: { id: editorUserId },
      select: { roleId: true },
    });
    const editorRolId = editor?.roleId ?? '';
    const rol = await this.prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!rol) throw new NotFoundException('Ese rol ya no existe.');

    const codigos = this.validarCodigos(dto.permisos || []);

    // ¿Cuántos roles CON USUARIOS DENTRO seguirían pudiendo administrar
    // usuarios si se guarda este cambio? Contar roles a secas no sirve: un
    // rol de administrador sin nadie asignado no salva a nadie.
    const conAdmin = await this.prisma.role.findMany({
      where: {
        id: { not: id },
        users: { some: { active: true } },
        permissions: { some: { permission: { code: 'user.manage' } } },
      },
      select: { id: true },
    });

    const motivo = motivoParaNoGuardar(
      { id: rol.id, nombre: rol.name, sistema: rol.sistema, usuarios: rol._count.users },
      codigos,
      { rolDelEditorId: editorRolId, administradoresRestantes: conAdmin.length },
    );
    if (motivo) throw new BadRequestException(motivo);

    const permisos = await this.prisma.permission.findMany({ where: { code: { in: codigos } } });

    // Se reemplaza el juego completo dentro de una transacción: si falla a
    // medias, el rol se quedaría con menos permisos de los que tenía y
    // alguien se quedaría fuera sin que nadie lo hubiera decidido.
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      this.prisma.rolePermission.createMany({
        data: permisos.map((p) => ({ roleId: id, permissionId: p.id })),
        skipDuplicates: true,
      }),
      this.prisma.role.update({
        where: { id },
        data: { description: dto.descripcion?.trim() || null },
      }),

      /* =====================================================================
         EL CAMBIO LLEGA A QUIEN YA ESTABA DENTRO — bloque 86
         ---------------------------------------------------------------------
         ESTO FALTABA, Y LO ENCONTRÓ EL USUARIO:

           «Cuando actualizamos los roles, el rol Jefe de línea o cosas así
            NO SE ACTUALIZAN para usuarios ya creados.»

         Y tenía razón. Los permisos viajan DENTRO del token de sesión, y
         `PermissionsGuard` los lee de ahí — no de la base. El bloque 82 puso
         el contador `permisosVersion` para poder matar los tokens de golpe,
         pero se cableó SÓLO a los cambios del USUARIO (rol, baja,
         contraseña). **Editar el ROL no lo tocaba.**

         Consecuencia: se le quitaba un permiso a «Jefe de línea» y las cinco
         personas con ese rol seguían teniéndolo. El sistema se corregía solo
         cuando su token caducaba —hasta quince minutos, y sólo si seguían
         usando la aplicación—, y el menú no cambiaba hasta recargar.

         Es el peor modo de fallar de un control de acceso: **falla ABIERTO**,
         en silencio, y quien hizo el cambio se queda creyendo que se aplicó.

         SUBE EL CONTADOR DE TODOS LOS USUARIOS DE ESTE ROL. En la siguiente
         petición sus tokens dejan de valer, el navegador renueva, y la
         renovación relee los permisos de la base (`buildTokens`). El cambio
         se aplica en segundos, no en quince minutos.

         VA DENTRO DE LA MISMA TRANSACCIÓN, y no después: si se guardaran los
         permisos y fallara el contador, el rol quedaría cambiado y la gente
         seguiría con los de antes — exactamente el bug que esto cierra, sólo
         que además invisible.

         NO SE LES CIERRA LA SESIÓN. Cambiar un permiso no es dar de baja a
         nadie: el token de refresco sigue valiendo y la renovación es
         transparente. Revocar las sesiones echaría a cinco personas de la
         aplicación por haber tocado una casilla. */
      this.prisma.user.updateMany({
        where: { roleId: id },
        data: { permisosVersion: { increment: 1 } } as any,
      }),
    ]);

    /* La caché del guard vive en memoria y dura quince segundos. Se vacía
       entera —y no usuario por usuario— porque un cambio de rol afecta a
       todos los suyos y aquí no se sabe cuántos son sin otra consulta.
       Vaciarla de más sólo cuesta una consulta a la base por persona. */
    AccesoVigenteGuard.olvidarTodo();

    return { ok: true, permisos: codigos.length };
  }

  async borrar(id: string) {
    const rol = await this.prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!rol) throw new NotFoundException('Ese rol ya no existe.');
    const motivo = motivoParaNoBorrar({
      id: rol.id, nombre: rol.name, sistema: rol.sistema, usuarios: rol._count.users,
    });
    if (motivo) throw new BadRequestException(motivo);
    await this.prisma.role.delete({ where: { id } });
    return { ok: true };
  }

  /** Ámbito de trenes de un usuario: a qué trenes puede mirar. */
  async fijarAmbito(userId: string, trenes: unknown) {
    const ambito = normalizarAmbito(trenes);
    if (ambito.length > 0) {
      // Que no se guarde un tren que no existe: el usuario se quedaría sin
      // ver nada y nadie entendería por qué.
      /* SE ACEPTA LA SIGLA («T1») Y TAMBIÉN EL CÓDIGO COMPLETO
         («AASA-PISCO-T1»). Bloque 43.

         Antes sólo valía el código completo, y el diálogo de Usuarios mandaba
         la sigla: nunca se pudo guardar un ámbito desde esa pantalla. Se veía
         en la propia ventana, que decía «sólo T1» y debajo, en rojo, que T1 no
         existe en el árbol — las dos frases eran suyas.

         La verdad ahora es la sigla, porque es lo que va en el rótulo del
         equipo. El código completo se sigue aceptando para no romper los
         ámbitos que ya están guardados así. */
      const trenes = await this.prisma.location.findMany({
        where: { type: 'TREN' },
        select: { code: true, siglaTren: true },
      });
      const conocidos = new Set<string>();
      for (const t of trenes) {
        conocidos.add(t.code.toUpperCase());
        if (t.siglaTren) conocidos.add(t.siglaTren.toUpperCase());
        // La deducción de siempre, para trenes a los que nadie puso sigla.
        const deducida = t.code.split('-').pop();
        if (deducida) conocidos.add(deducida.toUpperCase());
      }
      const raros = ambito.filter((t) => !conocidos.has(t));
      if (raros.length) {
        throw new BadRequestException(
          `Estos trenes no existen en el árbol de planta: ${raros.join(', ')}.`,
        );
      }
    }
    await this.prisma.user.update({ where: { id: userId }, data: { ambitoTrenes: ambito } });
    return { ok: true, ambito };
  }

  private validarCodigos(codigos: string[]): string[] {
    const limpios = [...new Set((codigos || []).map((c) => String(c).trim()).filter(Boolean))];
    const raros = limpios.filter((c) => !CODIGOS_VALIDOS.has(c));
    if (raros.length) {
      throw new BadRequestException(`Permisos desconocidos: ${raros.join(', ')}.`);
    }
    return limpios;
  }
}
