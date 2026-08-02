# Incidentes y guardas

Qué se rompió, por qué no lo vio nadie, y qué se puso para que no vuelva.

Este documento existe porque los tres fallos del 01–02/08 comparten la misma
causa de fondo, y esa causa no se arregla teniendo más cuidado:

> **Se supuso el estado en vez de medirlo, y la comprobación que lo habría
> cazado estaba apagada.**

Cada guarda de abajo es un script que mide algo en un segundo. Todos corren en
la CI. Ninguno necesita levantar la aplicación ni conectarse a producción.

---

## Guardas activas

| Comando | Qué mide | Incidente que lo motivó |
|---|---|---|
| `npm run verificar:inyeccion` | Que cada dependencia inyectada por constructor esté declarada en su módulo | #1 — arranque caído |
| `npm run verificar:filtros` | Filtros de Prisma anidados por error (`notIn: { in: ... }`) | #3 — tablero en 400 |
| `npm run verificar:bd` | Que la base real coincida con `schema.prisma` (lee el esquema en el momento, no una copia congelada) | #2 — historial de migraciones |
| `node scripts/historial-migraciones.js` | Qué migraciones cree la base que tiene aplicadas | #2 |

---

## #1 · El arranque caído — `BandejaService` sin declarar

**Síntoma.** Al desplegar 4B, la API no levantaba. No fallaba la bandeja: no
arrancaba nada.

```
Nest can't resolve dependencies of the DashboardController (DashboardService, ?).
BandejaService at index [1] is not available in the DashboardModule context.
```

**Causa.** `DashboardController` pedía `BandejaService` por constructor y
`DashboardModule` no lo declaraba en `providers`.

**Por qué no lo vio nadie.**

- `npm run build` pasa. TypeScript ve la clase importada y se queda tranquilo:
  declararla en el módulo es un dato de **tiempo de ejecución**, no un tipo.
- `npm test` pasa. Las pruebas unitarias construyen los servicios a mano.
- Sólo revienta al levantar. Es decir, en producción.

**El error de método detrás.** Al empaquetar la entrega se verificó que el
script escribiera los archivos **idénticos al fuente**, byte a byte. Y lo eran.
Pero el fuente estaba mal. *Se comprobó que la copia fuera fiel, no que el
original fuera correcto.*

**Guarda.** `scripts/verificar-inyeccion.js` recorre los 25 módulos, mira qué
inyecta por constructor cada controlador y servicio, y comprueba que esté
declarado, exportado por un módulo importado, o venga de un `@Global`.
Probado reintroduciendo el fallo: lo caza y dice qué falta, quién lo pide y
dónde se arregla.

---

## #2 · El historial de migraciones de la base local

**Síntoma.** `prisma migrate deploy` falló en la primera de 16 migraciones:

```
Applying migration `00000000000000_baseline`
ERROR: type "LocationType" already exists
```

**Cómo se leyó mal.** De ese mensaje se dedujo: *"el esquema está puesto, luego
las migraciones están aplicadas"*. Falso. Esa base tenía **sólo** el baseline;
del 25 de julio en adelante no tenía nada — 21 tablas, 49 columnas y 17 enums
sin crear.

Al marcarlas como aplicadas con `migrate resolve --applied`, la base quedó
**mintiendo**: su historial decía tenerlas y no las tenía. Y una migración
marcada como aplicada no se vuelve a ejecutar nunca.

**Lo que lo salvó.** El paso de verificación posterior (`verificar:bd`) lo
detectó y listó exactamente qué faltaba. Sin él, se habría seguido trabajando
sobre una base a medias hasta que algo reventara sin explicación.

**Resolución.** Al ser la base de **desarrollo**, se recreó con
`prisma migrate reset`: 30 segundos, historial impecable, y además demuestra
que las 16 migraciones corren limpias desde cero — que es lo que hacen la CI y
Railway. En **producción** esto no se hace: allí se repara con una migración
idempotente (`ADD COLUMN IF NOT EXISTS`), como `20260801000000_reparar_desfase_om`.

**Reglas que quedan escritas.**

1. **Una migración ya aplicada es INMUTABLE.** Lo que faltó va en una nueva.
2. **El nombre de una migración nueva debe ordenar DESPUÉS de la última.**
   Prisma las aplica por orden alfabético de carpeta. Una fechada "hoy" cuando
   las existentes están fechadas en el futuro se cuela en medio de la
   secuencia.
3. **No se deduce el estado de la base de un mensaje de error.** Se le
   pregunta: `node scripts/historial-migraciones.js`.

---

## #3 · El tablero en 400 — filtro dentro de filtro

**Síntoma.** `GET /dashboard/kpis` devolvía 400 en producción:

```
status: { notIn: { in: ["BAJA", "STOCK"] } }
Argument `_ref` is missing.
```

**Causa.**

```ts
const outOfService: any = { in: ['BAJA', 'STOCK'] };   // ya es un filtro
...
status: { notIn: outOfService }                        // y se envuelve otra vez
```

La constante debía ser un **array**, no un objeto de filtro.

**Por qué no lo vio nadie: el `: any`.** TypeScript sabe perfectamente qué
forma tiene un `where` de Prisma y habría rechazado esto al compilar. `: any`
apaga exactamente esa comprobación. Build en verde, pruebas en verde, 400 en
producción.

**Guarda.** `scripts/verificar-filtros-prisma.js` busca las dos formas del
fallo: el literal (`notIn: { in: ... }`) y el que llega por constante (una
constante declarada como filtro y usada dentro de otro filtro). Además avisa
—sin cortar la CI— de cada `: any` puesto sobre un filtro de Prisma, que es el
apagafuegos que dejó pasar éste.

---

## Cómo se trabaja a partir de aquí

1. **Medir antes de escribir.** Las guardas se ejecutan al empezar un bloque,
   no sólo al terminarlo.
2. **Un bloque en el aire, no dos.** No se empieza el siguiente hasta
   confirmar que producción está arriba con el anterior.
3. **El estado vive en el repositorio.** Este documento y
   `ESQUELETO_DE_BLOQUES.md` son la memoria del proyecto. No dependen de que
   nadie recuerde nada.
4. **`: any` sobre un filtro de Prisma es deuda.** Cada uno que quede está
   listado por el verificador y se va tipando cuando se toca ese archivo.
