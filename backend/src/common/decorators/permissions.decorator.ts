import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * EXIGE TODOS los permisos de la lista.
 *
 * Es el caso normal: `@RequirePermissions('wo.update')`, o varios cuando la
 * acción de verdad necesita las dos llaves a la vez.
 */
export const RequirePermissions = (...perms: string[]) => SetMetadata(PERMISSIONS_KEY, perms);

export const PERMISSIONS_ANY_KEY = 'permissions_any';

/* =============================================================================
   EXIGE CUALQUIERA de los permisos de la lista — bloque 66
   -----------------------------------------------------------------------------
   POR QUÉ HIZO FALTA, Y ES UN FALLO DE MODELO QUE SE VIO EN PANTALLA

   Hay endpoints que NO son un módulo: son LISTAS DE APOYO para rellenar un
   desplegable. `/assets/options` devuelve código, tipo, estado y ubicación de
   los equipos — sin IP y sin credenciales— y lo llaman SEIS pantallas
   distintas: Cableado, Accesibilidad, Incidencias, Mantenimiento, Preventivo
   e Inventario. Cada una se abre con un permiso diferente.

   Exigirle `asset.read` significaba esto: alguien con derecho a crear una
   incidencia abría el formulario y el desplegable de equipos salía VACÍO.
   No podía elegir el equipo. El formulario quedaba inservible y la pantalla
   parecía rota, cuando lo que estaba mal era el permiso.

   LAS DOS SALIDAS MALAS QUE SE DESCARTARON

   · Repartir `asset.read` a todo el mundo. Es la llave del módulo de Activos
     entero: abrirla para que un desplegable funcione es exactamente el fallo
     que costó que Producción viera el plano eléctrico de la planta.
   · Quitar el permiso. Entonces cualquiera con sesión lista todos los equipos.

   LA SALIDA BUENA: decir «cualquiera de éstos». El que puede trabajar
   órdenes, el que puede reportar incidencias y el que gestiona inventario
   necesitan el mismo desplegable, y cada uno ya demostró que tiene derecho a
   estar en esa pantalla.

   NO SUSTITUYE A `RequirePermissions`. Se usa SÓLO en listas de apoyo. Una
   ESCRITURA nunca lleva «cualquiera de»: ahí la llave es una y concreta.
============================================================================= */
export const RequireAlguno = (...perms: string[]) => SetMetadata(PERMISSIONS_ANY_KEY, perms);
