-- =============================================================================
--  BLOQUE 43 — LA SIGLA DEL TREN DEJA DE SER UNA CONVENCIÓN IMPLÍCITA
-- =============================================================================
--  QUÉ PASABA
--  El identificador corto del tren —la «T1» que va en el rótulo del equipo,
--  AA-CAM-T1-LECHO-014— no existía como dato. Se obtenía así:
--
--      tren = Location.code.split('-').pop()      ->  AASA-PISCO-T2  =>  T2
--
--  Nadie declaró nunca esa convención. Funciona mientras todos los trenes se
--  llamen igual, y se rompe en silencio en cuanto uno no:
--
--      AASA-PISCO-TREN1   ->  rótulos «AA-CAM-TREN-...», truncado a 4
--      T1-LAMINACION      ->  rótulos «AA-CAM-LAMI-...»
--
--  Y mientras el rótulo cortaba el código, el ÁMBITO de usuario guardaba el
--  código COMPLETO. Dos formas distintas de sacar «qué tren es» del mismo
--  campo. El resultado se vio en pantalla: el diálogo de ámbito decía «sólo
--  T1» y debajo, en rojo, que T1 no existe en el árbol. Las dos frases eran
--  suyas y las dos tenían razón desde su punto de vista.
--
-- -----------------------------------------------------------------------------
--  QUÉ HACE ESTA MIGRACIÓN
--  Añade la sigla como DATO DECLARADO y editable, y la rellena para los trenes
--  que ya existen usando exactamente la misma regla que se venía aplicando.
--
--  EL RELLENO NO CAMBIA EL COMPORTAMIENTO DE NADA. Eso es deliberado: los
--  rótulos que ya están impresos y pegados en planta tienen que seguir siendo
--  válidos. Lo que cambia no es el valor, es que a partir de ahora ES UN DATO
--  QUE SE VE Y SE PUEDE CORREGIR, en vez de el resultado de partir un texto.
--
--  Se rellena SÓLO para type='TREN'. En el resto de ubicaciones la sigla no
--  significa nada y dejarla nula es lo honesto.
--
--  Aditiva: una columna nulable y una actualización acotada. Sin bloqueos
--  largos y sin riesgo de pérdida.
-- =============================================================================

ALTER TABLE "locations" ADD COLUMN "siglaTren" TEXT;

-- Misma regla que aplicaba el código: el último segmento del código, en
-- mayúsculas y recortado a 4 caracteres, que es el ancho del rótulo.
UPDATE "locations"
   SET "siglaTren" = UPPER(LEFT(SPLIT_PART("code", '-', ARRAY_LENGTH(STRING_TO_ARRAY("code", '-'), 1)), 4))
 WHERE "type" = 'TREN'
   AND "siglaTren" IS NULL
   AND "code" IS NOT NULL
   AND "code" <> '';

-- El ámbito de usuario se guardaba con el código COMPLETO en unos sitios y con
-- la sigla en otros, según por dónde se hubiera cargado. A partir de ahora la
-- verdad es la sigla, así que se normaliza lo que ya está guardado.
--
-- NO se borra nada que no se pueda traducir: si una entrada no corresponde a
-- ningún tren del árbol se deja como está y la pantalla de Usuarios la marcará.
-- Borrarla en silencio dejaría a alguien sin ámbito sin que nadie lo supiera.
UPDATE "users" u
   SET "ambito_trenes" = sub.nuevos
  FROM (
    SELECT u2."id",
           ARRAY(
             SELECT COALESCE(l."siglaTren", t)
               FROM UNNEST(u2."ambito_trenes") AS t
               LEFT JOIN "locations" l
                 ON l."type" = 'TREN' AND UPPER(l."code") = UPPER(t)
           ) AS nuevos
      FROM "users" u2
     WHERE ARRAY_LENGTH(u2."ambito_trenes", 1) > 0
  ) AS sub
 WHERE u."id" = sub."id";

-- El ámbito y el rotulado consultan la sigla constantemente.
CREATE INDEX "locations_siglaTren_idx" ON "locations"("siglaTren");
