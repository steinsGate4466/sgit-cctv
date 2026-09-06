-- BLOQUE 98 · Acuerdo de nivel de servicio con Producción.
--
-- NO INSERTA NINGUNA FILA a propósito: mientras la tabla esté vacía se usa la
-- propuesta del código y la pantalla dice «SLA sin fijar». Insertar los
-- valores propuestos los convertiría en un compromiso que nadie firmó, y es
-- el número contra el que se juzga al área. Misma decisión que la meta del
-- reparto (bloque 94) y los cortes de criticidad (bloque 76).

CREATE TABLE "acuerdo_servicio" (
    "id" TEXT NOT NULL DEFAULT 'unico',
    "criticaRespuestaH" INTEGER NOT NULL,
    "criticaRestitucionH" INTEGER NOT NULL,
    "altaRespuestaH" INTEGER NOT NULL,
    "altaRestitucionH" INTEGER NOT NULL,
    "mediaRespuestaH" INTEGER NOT NULL,
    "mediaRestitucionH" INTEGER NOT NULL,
    "bajaRespuestaH" INTEGER NOT NULL,
    "bajaRestitucionH" INTEGER NOT NULL,
    "fijadoPorId" TEXT,
    "fijadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acuerdo_servicio_pkey" PRIMARY KEY ("id")
);

-- El nombre lo genera Prisma como <tabla>_<campos>_idx con el campo COMPLETO.
-- Abreviarlo hace que `migrate dev` crea que falta y lo cree otra vez: dos
-- índices iguales sobre la misma columna, y cada escritura paga los dos.
CREATE INDEX "acuerdo_servicio_fijadoPorId_idx" ON "acuerdo_servicio"("fijadoPorId");

ALTER TABLE "acuerdo_servicio" ADD CONSTRAINT "acuerdo_servicio_fijadoPorId_fkey"
    FOREIGN KEY ("fijadoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
