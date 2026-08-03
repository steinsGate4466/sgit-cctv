-- =====================================================================
--  SESIONES REVOCABLES Y FRENO PERSISTENTE
--
--  DOS AGUJEROS QUE VIVIAN EN LA MEMORIA DEL PROCESO:
--
--  1. CERRAR SESION NO INVALIDABA NADA. El refresh token seguia valiendo
--     hasta caducar (7 dias). Robado, seguia sirviendo aunque la persona
--     hubiera cerrado sesion y cambiado la contrasena.
--
--  2. EL FRENO DE FUERZA BRUTA SE BORRABA EN CADA DESPLIEGUE, y no se
--     compartia entre instancias. Bastaba esperar a un despliegue -o pegarle
--     a la otra instancia- para empezar de cero.
--
--  Las dos cosas se arreglan sacandolas de la memoria y metiendolas aqui.
-- =====================================================================

-- Una fila por sesion viva. El refresh token lleva su identificador (jti)
-- dentro; si la fila no esta o esta revocada, el token no vale.
CREATE TABLE IF NOT EXISTS "sesiones" (
  "id"          TEXT PRIMARY KEY,
  "userId"      TEXT NOT NULL,
  "creadaEn"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiraEn"    TIMESTAMP(3) NOT NULL,
  "ultimoUsoEn" TIMESTAMP(3),
  "revocadaEn"  TIMESTAMP(3),
  "motivoRevocacion" TEXT,
  "ip"          TEXT,
  "dispositivo" TEXT
);

DO $$ BEGIN
  ALTER TABLE "sesiones"
    ADD CONSTRAINT "sesiones_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "sesiones_userId_idx" ON "sesiones" ("userId");
CREATE INDEX IF NOT EXISTS "sesiones_expiraEn_idx" ON "sesiones" ("expiraEn");

-- Freno por origen. La clave es ruta + origen, igual que en memoria.
CREATE TABLE IF NOT EXISTS "intentos_acceso" (
  "clave"          TEXT PRIMARY KEY,
  "golpes"         INTEGER NOT NULL DEFAULT 0,
  "ventanaDesde"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "bloqueadoHasta" TIMESTAMP(3),
  "actualizadoEn"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "intentos_acceso_bloqueadoHasta_idx"
  ON "intentos_acceso" ("bloqueadoHasta");
