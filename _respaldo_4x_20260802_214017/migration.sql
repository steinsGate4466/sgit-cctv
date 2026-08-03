-- =====================================================================
--  CONFIGURACIÓN DEL SISTEMA, EDITABLE DESDE LA PANTALLA
--
--  POR QUÉ
--  Para encender los avisos había que entrar a Railway, añadir una variable
--  y esperar a que el servicio reinicie. Eso significa que:
--    · sólo lo puede hacer quien tiene acceso al panel de despliegue;
--    · cada cambio es un reinicio del backend en mitad de la jornada;
--    · y para saber si el token es correcto había que probar y mirar logs.
--
--  El token de Telegram NO se puede generar por programa —lo emite
--  @BotFather y Telegram no ofrece otra vía—, pero todo lo demás sí se
--  puede quitar de en medio: se pega una vez, en una pantalla, y el sistema
--  lo comprueba al instante.
--
--  EL VALOR VA CIFRADO, con el mismo mecanismo que las credenciales de las
--  cámaras. Quien se lleve una copia de la base no obtiene el token, que es
--  la llave para escribir como el bot.
-- =====================================================================

CREATE TABLE IF NOT EXISTS "configuracion_sistema" (
  "clave"        TEXT PRIMARY KEY,
  "valor"        TEXT,
  -- true cuando el valor está cifrado y no debe devolverse nunca en claro.
  "secreto"      BOOLEAN NOT NULL DEFAULT false,
  "descripcion"  TEXT,
  "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoPor" TEXT
);
