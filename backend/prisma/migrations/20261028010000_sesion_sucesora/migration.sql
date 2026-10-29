-- =========================================================================
--  BLOQUE 183 — UNA RESPUESTA PERDIDA NO ES UN ROBO
--  -----------------------------------------------------------------------
--  Cada renovación rota el token: el viejo deja de valer y nace una sesión
--  sucesora. Si la RESPUESTA se pierde por el camino (wifi de la nave, el
--  celular que se bloquea), el navegador se queda con el token viejo y, al
--  volver a intentarlo pasados 30 s, el servidor lo tomaba por un robo y
--  cerraba TODAS las sesiones de esa persona: «me botó trabajando».
--
--  Con el enlace a la sucesora y su primer uso, el servidor distingue los dos
--  casos: sucesora SIN USAR = la respuesta se perdió; sucesora USADA = hay
--  dos copias del token circulando y se cierra todo, como siempre.
--
--  Migración ADITIVA: dos columnas opcionales, nada se borra ni se rellena.
-- =========================================================================
ALTER TABLE "sesiones" ADD COLUMN "sucesoraId" TEXT,
ADD COLUMN "primerUsoEn" TIMESTAMP(3);
