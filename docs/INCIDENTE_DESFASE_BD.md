# Incidente: la base de producción se quedó atrás del esquema

**Fecha:** 30 de julio de 2026
**Cómo apareció:** `GET /dashboard/infra/tren/:code` devolvía 400
**Código real:** `P2022 · The column work_orders.progressPct does not exist in the current database`

---

## Qué faltaba

| Objeto | Tipo |
|---|---|
| `work_order_progress` | tabla |
| `work_orders.plannedDurationMin` | columna |
| `work_orders.progressPct` | columna |

Los 28 tipos enumerados, las otras 41 tablas y las otras 387 columnas estaban
correctos.

## Por qué faltaban si la migración figuraba como aplicada

`20260729120000_om_ejecucion_campo` aparecía como **aplicada, paso 1, terminada**.

Un `ALTER TABLE` con varias columnas es **una sola sentencia**: se aplica entera
o no se aplica. Que faltaran justo las **dos últimas** de la lista, y a
continuación la tabla que venía después, solo admite una explicación:

> **El archivo de la migración se editó después de haberse aplicado.**

Prisma ya la tenía registrada con su suma de comprobación, así que las
sentencias añadidas más tarde nunca se ejecutaron. Ni en producción, ni en
ninguna base que ya la tuviera aplicada.

## La regla que se rompió

> **Una migración aplicada es inmutable.**
> Lo que se olvidó va en una migración **nueva**, nunca editando la anterior.

Esto no es purismo: es la única forma de que el registro de migraciones
signifique algo. Si un archivo aplicado puede cambiar, "aplicada" deja de
garantizar qué hay en la base.

## Por qué el CI no lo detectó

El CI aplicaba todas las migraciones sobre una base **limpia** y comprobaba que
no hubiera desfase contra el esquema. Ese control dice que **las migraciones son
correctas**; no dice que **producción las haya recibido todas**. En una base
limpia la migración se ejecuta entera, con las líneas añadidas incluidas, así
que ahí todo salía verde.

## Qué se hizo

1. **`scripts/diagnostico-bd.js`** — compara las 42 tablas, 389 columnas y 28
   enums que espera el esquema contra las que existen de verdad, y lee el
   registro de migraciones. Solo lectura. Sale con error si hay desfase.
   ```
   cd backend
   npm run verificar:bd            # usa DATABASE_URL
   node scripts/diagnostico-bd.js "postgresql://..."
   ```

2. **`20260801000000_reparar_desfase_om`** — migración de reparación
   **idempotente**: `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`,
   `CREATE INDEX IF NOT EXISTS`, y las claves foráneas dentro de un bloque que
   consulta `pg_constraint` (PostgreSQL no admite `ADD CONSTRAINT IF NOT
   EXISTS`). Tiene que funcionar en dos bases a la vez: la de producción, donde
   falta todo eso, y una limpia, donde la migración anterior ya lo creó.

3. **`.github/workflows/verificar-base.yml`** — comprueba a diario que
   producción coincide con el esquema. Se salta con un aviso si falta el secreto
   `DATABASE_PUBLIC_URL`, igual que el respaldo. Se ejecuta a las 07:00 UTC, una
   hora **después** del respaldo: si el desfase obliga a restaurar, el respaldo
   de esa noche ya existe.

## Consecuencia que estaba latente

`progressPct` la usa también `maintenance.service.ts` en `addProgress()`. El
avance de una OM **habría fallado igual** en producción en cuanto alguien lo
usara. El endpoint nuevo no causó el problema: lo destapó antes de que lo
encontrara un técnico en campo.

## Un defecto de observabilidad que salió de paso

El filtro global de excepciones registraba en el log **solo a partir de 500**,
pero él mismo traduce los errores de Prisma a **400**. Resultado: este fallo no
dejaba **ni una línea** en el log, y la respuesta calculaba el código de Prisma
y lo descartaba. Diagnosticarlo era imposible sin adivinar.

Corregido: se registra cualquier excepción no prevista con su código y su traza,
sea cual sea el estado con el que se responda, y la respuesta incluye el código
(`P2022`, `PRISMA_VALIDACION`…). El mensaje técnico se queda en el log.

Con eso, la causa apareció en el primer intento.

## Pendiente relacionado

- Fila fantasma `00000000000000_init` marcada **REVERTIDA** en
  `_prisma_migrations`. Es residuo del episodio del P3009. No estorba a
  `migrate deploy`, así que se deja: borrar filas de ese registro a mano es
  precisamente cómo se llega a este tipo de problemas.
- El comparador no revisa índices ni claves foráneas, solo tablas, columnas y
  enums. La migración de reparación recrea de forma idempotente los de la zona
  afectada; ampliar el comparador queda anotado.
