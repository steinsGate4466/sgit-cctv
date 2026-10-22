import { ArrayMaxSize, IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IncidentCategory, Priority, TipoAviso } from '../../../generated/prisma/client';

export class CreateIncidentDto {
  @IsString() @MinLength(3) title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(IncidentCategory) category?: IncidentCategory;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsString() assetId?: string;
  @IsOptional() @IsString() zone?: string;   // área/zona (Horno, Laminación, Púlpito...)
  @IsOptional() @IsInt() concurrentSessions?: number;
  @IsOptional() @IsInt() affectedCameras?: number;
  @IsOptional() @IsInt() visionDownMin?: number;

  /* CUÁNDO SE CAYÓ DE VERDAD — bloque 68.
     -------------------------------------------------------------------------
     No es lo mismo que cuándo se reportó, y confundirlas hace mentir al MTTR:
     una cámara que se apaga a las 3 de la madrugada y se reporta a las 8
     carga cinco horas que nadie podía atender.

     OPCIONAL a propósito. La mayoría de las veces no se sabe la hora exacta, y
     un campo obligatorio que no se sabe se rellena con cualquier cosa — que es
     peor que dejarlo vacío, porque un dato inventado no se distingue de uno
     bueno. Vacío significa «se usa la de reporte», que es la mejor estimación
     que hay. */
  @IsOptional() @IsDateString() occurredAt?: string;

  /* LO QUE ADEMÁS SE ENCONTRÓ — bloque 70.
     -------------------------------------------------------------------------
     `category` sigue siendo UNO: es sobre el que se cuenta «qué falla más», y
     si una incidencia contara en tres los porcentajes pasarían del 100 %.
     Aquí van los otros hechos de la misma avería.

     El tope de 4 no es capricho: hay cinco motivos en total, así que marcar
     los cinco significaría «falla todo», que no es un diagnóstico. Con el
     principal fuera, quedan cuatro. */
  @IsOptional() @IsArray() @ArrayMaxSize(4)
  @IsEnum(IncidentCategory, { each: true })
  categoriasExtra?: IncidentCategory[];

  /* «¿EL EQUIPO FUNCIONA?» — bloque 180.
     -------------------------------------------------------------------------
     FALLA (no funciona) · CONDICIÓN (funciona, pero se va a dañar) ·
     SOLICITUD (un pedido o un cambio). Sólo la FALLA crea evento de falla y
     cuenta en MTBF y MTTR. Opcional en la petición: sin decirlo vale FALLA,
     que es lo que significaba reportar antes de este bloque. */
  @IsOptional() @IsEnum(TipoAviso) tipoAviso?: TipoAviso;

  /* El N° del aviso en SAP, si ya se creó allí. El servicio lo deja como lo
     enseña SAP (sin espacios ni ceros delante) y rechaza el que no lo sea:
     ver `common/aviso-sap.ts`. El tope de 30 es sólo para la petición. */
  @IsOptional() @IsString() @MaxLength(30) avisoSap?: string;
}
