-- =========================================================================
--  EQUIPOS CONOCIDOS — "¿desde qué PC se hizo esto?"
--  -----------------------------------------------------------------------
--  La MAC del cliente NO viaja hasta el servidor (capa 2, muere en el primer
--  salto). Por eso se DECLARA aquí, a mano, sacada de la reserva DHCP o de la
--  tabla MAC del switch. Esta tabla es el diccionario que traduce una IP suelta
--  en "PC del púlpito del Tren 2".
--
--  Migración aditiva pura: tabla nueva + columnas nuevas que admiten NULL.
--  No toca ni una fila existente.
-- =========================================================================

CREATE TABLE "equipos_conocidos" (
    "id"          TEXT NOT NULL,
    "nombre"      TEXT NOT NULL,
    "ip"          TEXT,
    "mac"         TEXT,
    "tipo"        TEXT NOT NULL DEFAULT 'PC',
    "area"        TEXT,
    "ubicacion"   TEXT,
    "responsable" TEXT,
    "notas"       TEXT,
    "activo"      BOOLEAN NOT NULL DEFAULT true,
    "creadoEn"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editadoEn"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "equipos_conocidos_pkey" PRIMARY KEY ("id")
);

-- Una IP identifica a un equipo y sólo a uno: si se repite, la traducción
-- deja de significar nada. Igual con la MAC.
CREATE UNIQUE INDEX "equipos_conocidos_ip_key"  ON "equipos_conocidos"("ip");
CREATE UNIQUE INDEX "equipos_conocidos_mac_key" ON "equipos_conocidos"("mac");
CREATE INDEX "equipos_conocidos_activo_idx" ON "equipos_conocidos"("activo");

-- Rastro de origen en la auditoría.
-- DESNORMALIZADO A PROPÓSITO: se guarda el NOMBRE del equipo tal como estaba
-- ese día, no una clave ajena. Si mañana se renombra el equipo o se borra del
-- registro, el histórico tiene que seguir diciendo lo que decía. Una auditoría
-- que cambia de contenido cuando alguien edita otra tabla no es una auditoría.
ALTER TABLE "audit_logs"
    ADD COLUMN "dispositivo"   TEXT,
    ADD COLUMN "dispositivoId" TEXT,
    ADD COLUMN "origen"        TEXT;

CREATE INDEX "audit_logs_dispositivoId_idx" ON "audit_logs"("dispositivoId");
CREATE INDEX "audit_logs_createdAt_idx"     ON "audit_logs"("createdAt");

-- El identificador de aparato en la sesión: contesta "¿es el mismo aparato de
-- siempre?" aunque la IP cambie (wifi → datos móviles).
ALTER TABLE "sesiones"
    ADD COLUMN "dispositivoId" TEXT,
    ADD COLUMN "equipo"        TEXT;
