-- Bloque 175 · campañas de cualquier tipo, con plan por zona.
-- Aditiva e idempotente: sólo añade columnas que pueden quedar vacías.
-- No se rellena nada: una campaña vieja sin tipo se lee como «Mapeo», que es
-- lo que eran todas, y una zona sin fechas dice «sin plan».
ALTER TABLE "campanas_mapeo" ADD COLUMN IF NOT EXISTS "tipo" TEXT;
ALTER TABLE "campanas_mapeo" ADD COLUMN IF NOT EXISTS "unidad" TEXT;

ALTER TABLE "zonas_campana" ADD COLUMN IF NOT EXISTS "inicioPrevisto" TIMESTAMP(3);
ALTER TABLE "zonas_campana" ADD COLUMN IF NOT EXISTS "finPrevisto" TIMESTAMP(3);
ALTER TABLE "zonas_campana" ADD COLUMN IF NOT EXISTS "hechos" INTEGER;
