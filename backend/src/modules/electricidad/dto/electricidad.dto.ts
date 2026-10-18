/* =============================================================================
   DTO DE ELECTRICIDAD — bloque 174
   -----------------------------------------------------------------------------
   Cierra la deuda del bloque 85 en este módulo: los seis `@Body() dto: any`
   dejan de entrar sin validar.

   Cada clase declara TODAS las claves que manda la pantalla de Electricidad
   (`pages/Electricidad.tsx`) y todas las que lee `electricidad.service.ts`.
   Con `forbidNonWhitelisted`, una clave olvidada aquí es un formulario que
   deja de guardar (bloque 90, Roles). Por eso:

   · Los números NO se transforman: llegan como texto del <input type=number>
     ('' incluido) y el servicio sigue haciendo su conversión.
   · El tren es TEXTO y no una lista cerrada: `aTrenDePlanta` acepta TREN_1,
     T1, «Tren 1»… y da su propio mensaje.
   · Casi nada es obligatorio aquí: el código del tablero y el número del
     circuito los sigue exigiendo el servicio con su mensaje de planta. La
     única excepción es el `assetId` al colgar un equipo (ver su clase).
============================================================================= */
import { IsString, MaxLength } from 'class-validator';
import { EstadoCircuito, TipoProteccion, TipoTablero } from '../../../generated/prisma/client';
import { Id, Numero, SiNo, Texto, UnoDe } from '../../../common/validacion';

/** Lo común al alta y a la edición de un tablero. */
class TableroBaseDto {
  @Texto(200) nombre?: string;
  @UnoDe(Object.values(TipoTablero)) tipo?: string;
  @Id() locationId?: string | null;
  /** TREN_1 / T1 / «Tren 1» o '' (no aplica). Lo normaliza el servicio. */
  @Texto(60) tren?: string | null;
  @Texto(500) referencia?: string | null;
  @Texto(2000) comoLlegar?: string | null;
  @Numero() tensionV?: number | string | null;
  @Numero() fases?: number | string | null;
  @Numero() corrienteNominalA?: number | string | null;
  @Id() alimentadoDeId?: string | null;
  @Texto(2000) riesgos?: string | null;
  @SiNo() requierePermiso?: boolean;
  @Texto(4000) notas?: string | null;
}

/** POST /electricidad/tableros */
export class CrearTableroDto extends TableroBaseDto {
  @Texto(80) codigo?: string;
}

/** PATCH /electricidad/tableros/:id — el código no se edita (es la etiqueta). */
export class EditarTableroDto extends TableroBaseDto {}

/** Lo común al alta y a la edición de un circuito. */
class CircuitoBaseDto {
  @Texto(60) numero?: string;
  @Texto(200) designacion?: string | null;
  @UnoDe(Object.values(TipoProteccion)) proteccion?: string;
  @Numero() amperajeA?: number | string | null;
  @Texto(60) curva?: string | null;
  @Numero() polos?: number | string | null;
  @Numero() tensionV?: number | string | null;
  @UnoDe(Object.values(EstadoCircuito)) estado?: string;
  @SiNo() esCctv?: boolean;
  @Texto(4000) notas?: string | null;
}

/** POST /electricidad/tableros/:id/circuitos */
export class CrearCircuitoDto extends CircuitoBaseDto {
  /** La pantalla lo manda dentro del formulario. El servicio NO lo lee: manda
   *  el `:id` de la URL. Se declara para que el alta no dé un 400. */
  @Id() tableroId?: string;
}

/** PATCH /electricidad/circuitos/:id */
export class EditarCircuitoDto extends CircuitoBaseDto {}

/** POST /electricidad/circuitos/:id/activos — colgar un equipo de la llave. */
export class ColgarActivoDto {
  /** OBLIGATORIO, y es el único: sin él el servicio busca un activo `undefined`
   *  y revienta con un 500 en vez de decir qué falta. */
  @IsString({ message: 'Di qué equipo se cuelga del circuito.' }) @MaxLength(80)
  assetId!: string;
  @SiNo() viaPoe?: boolean;
  @Texto(2000) notas?: string;
}

/** POST /electricidad/mediciones */
export class MedicionDto {
  @Id() circuitoId?: string;
  @Id() tableroId?: string;
  @Numero() tensionV?: number | string;
  @Numero() corrienteA?: number | string;
  @Numero() temperaturaC?: number | string;
  @Texto(2000) observacion?: string;
}
