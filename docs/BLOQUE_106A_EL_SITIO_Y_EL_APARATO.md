# Bloque 106-A · El sitio y el aparato dejan de ser la misma cosa

**Este bloque entrega el MODELO DE DATOS.** El servicio y la pantalla van en el
106-B, y el motivo está al final — no es pereza, es que no se pueden verificar
aquí y entregar código sin verificar es lo que este archivo lleva cien bloques
prohibiendo.

---

## El fallo de identidad

Palabras del usuario:

> *«Imagínate que cambio la cámara y le pongo el mismo ID, el mismo rotulado,
> el mismo todo. El software acumula esa información, se la lleva. Y no: tiene
> que ser de cero, porque es un equipo nuevo con nuevas características.»*

Tiene razón, y el modelo no lo permitía. `Asset` era **a la vez** el sitio y el
aparato: el código `AA-CAM-T2-014` nombra «la cámara del foso» —que es un
SITIO— y también la unidad física que está ahí ahora. Al sustituirla:

- se reutiliza el registro → el historial de la cámara nueva **arranca con las
  averías de la vieja**;
- o se crea otro → **se pierde la historia del punto**.

Las dos salidas son malas, y por eso no había forma de hacerlo bien.

## La norma ya lo resolvió

Es la distinción **Ubicación Funcional / Equipo** de SAP PM, y los niveles 6-9
de la taxonomía de **ISO 14224**:

    Asset            el SITIO. Fijo, nunca se va de la planta. Su historia es
                     la del PUNTO: cuántas veces hubo que intervenir ahí.
    EquipoInstalado  la UNIDAD FÍSICA. Se instala, se retira, se va. Su
                     historia se va CON ELLA.
    marca + modelo   la CLASE. La MUESTRA que contesta «este modelo no aguanta
                     calor radiante» — donde ISO 14224 dice que está el valor.

| Pregunta | Quién la contesta |
|---|---|
| ¿Cuántas veces hemos intervenido en el foso del Tren 2? | la **ubicación** |
| ¿Cuánto duró la cámara que estuvo ahí? | el **equipo retirado** |
| ¿Qué tal se porta este modelo en calor radiante? | la **clase** |
| ¿El equipo nuevo empieza de cero? | **sí: es otro equipo** |
| ¿Se pierde la historia del sitio al cambiarlo? | **no: es de la ubicación** |

> **Un rótulo pegado a una pared nombra un SITIO, no un aparato.**

## Lo que NO se hizo, y es la decisión que salva el bloque

**No se parte `Asset` en dos tablas.** Se midió el alcance:

| | |
|---|---|
| Archivos del backend que tocan `Asset` | **76** |
| Llamadas `prisma.asset.` | **102** |
| Modelos que apuntan a `Asset` | **23** |
| Pantallas del frontend | **42** |

Partirlo es reescribir el corazón del sistema: cuatro a seis bloques, con el
software a medias durante la transición.

**Y no hace falta**, porque `Asset` **ya es el sitio**: lleva la ubicación, la
criticidad, el ambiente, el acceso y el QR — todo eso son atributos del punto,
no del aparato. Lo único que faltaba era el aparato.

Así que la migración es **ADITIVA**: una tabla nueva, cero columnas tocadas,
**ninguna de las 102 llamadas cambia**. De cuatro-seis bloques a uno.

## Tampoco se inventa un estado nuevo

`AssetStatus` ya tiene `BAJA`, y `asset-status.ts` lo respeta tal cual con la
precedencia más alta. El «retirado» que pedía el usuario es del **equipo**, no
del sitio, y lo lleva la fecha `hasta`. Añadir un valor al enum habría sido
crear una segunda verdad sobre lo mismo.

## Dos garantías que van en la BASE, no en el código

**1 · Un solo aparato puesto a la vez.** Índice único PARCIAL: la unicidad sólo
aplica a las filas sin `hasta`. Un sitio puede haber tenido diez cámaras a lo
largo de los años, pero sólo una puesta en cada momento.

Va en la base y no sólo en el servicio a propósito: una comprobación en código
se salta con dos peticiones a la vez, y entonces el sitio queda con dos
aparatos «actuales» y ninguna pantalla sabe cuál enseñar.

**2 · Se borra en cascada con su sitio.** Si el punto deja de existir, sus
aparatos no tienen dónde colgar. Lo hace PostgreSQL, no código a mano.

## El relleno: nadie estrena vacío

Cada sitio que ya existe estrena su aparato actual, copiado de lo que hoy está
escrito en `assets`:

```sql
SELECT gen_random_uuid(), a."id", a."brand", a."model", a."serialNumber", ...
       COALESCE(a."installDate", a."createdAt"),
       (a."installDate" IS NULL),          -- desdeEsEstimado
FROM "assets" a WHERE a."deletedAt" IS NULL
```

**No se inventa nada.** La marca, el modelo y la serie que hay en `assets` SON
las del aparato puesto ahora: copiarlas es decir la verdad.

La FECHA sí puede faltar, y ahí **se marca en vez de inventar**:
`desdeEsEstimado = true` cuando se usó el alta del sitio. Es la regla del
bloque 78 con el `occurredAt` — *un dato estimado que no se distingue de uno
medido envenena cualquier cálculo de vida útil.*

El `WHERE NOT EXISTS` lo hace repetible: correrlo dos veces no duplica.

---

## Y DOS VERIFICADORES, uno de ellos por un fallo propio

### Verificador 18 · `verificar:esquema`

**`npx prisma validate` NO se puede correr aquí**: descarga un motor y la red
está cerrada. Y en el bloque 105 eso costó una migración fallida contra la base
del usuario —`@@index([assetId, ...])` sobre un modelo sin `assetId`—.

*Un control que no se puede ejecutar es un control que no existe* (bloques 9,
85, 89 y 99). Así que se comprueba aquí, leyendo el texto del esquema:

1. todo campo de un `@@index([...])` existe en su modelo;
2. todo campo de un `@@unique([...])` existe;
3. todo campo de un `@relation(fields: [...])` existe;
4. todo tipo es primitivo, o hay un `model`/`enum` con ese nombre.

**Va el PRIMERO del agregado**: si el esquema nombra un campo que no existe, lo
demás da igual.

**Probado con el fallo exacto del bloque 105** y con un tipo inventado. Los dos
salen en rojo nombrando el modelo y el campo.

*No sustituye a `prisma validate`, que valida mucho más. Cubre la familia de
error que ya costó una migración.*

### `verificar:migraciones` aprende qué es un índice parcial

El índice único parcial lo marcaba como desfase, y con razón según su lógica
anterior: está en el SQL y no en el esquema. Pero **Prisma no sabe expresar un
índice parcial**, igual que no sabe expresar uno GIN — que ese verificador ya
toleraba.

Sin distinguirlo, el esquema nunca podría declararlo y el verificador quedaría
en rojo para siempre. *Un verificador que no se puede poner en verde acaba
desactivado* (bloque 9).

**Probado quitándole el `WHERE`**: vuelve a marcar desfase. Sólo tolera los
índices que de verdad son parciales.

---

## Piezas

| | |
|---|---|
| `prisma/schema.prisma` | modelo `EquipoInstalado` + los lados inversos en `Asset` y `User` |
| `prisma/migrations/20260918000000_equipo_instalado` | **NUEVO** · tabla, índices, el único parcial y el relleno |
| `scripts/verificar-esquema.js` | **NUEVO** · verificador 18 |
| `scripts/verificar-migraciones.js` | aprende a tolerar índices parciales |
| `package.json` | el verificador nuevo, el primero del agregado |

**Migración ADITIVA. Ninguna columna existente se toca. Frontend: sin tocar.**

## Cadena

    verificar:esquema        OK  ·  81 modelos, 54 enums
    verificar:relaciones     OK  ·  137 claves foráneas con su lado inverso
    verificar:migraciones    OK  ·  sin desfase (el parcial, declarado)
    18 verificadores         OK
    typecheck                OK
    verificar:ci             OK  ·  ningún verificador queda fuera

---

## POR QUÉ EL SERVICIO Y LA PANTALLA VAN EN EL 106-B

`npx prisma generate` **no se puede correr aquí** —mismo bloqueo de red que
`validate`—, así que `prisma.equipoInstalado` **no existe** para TypeScript
hasta que el usuario lo genere en su máquina.

Se podría parchear el cliente a mano. **No se hace**, y el motivo está escrito
en este proyecto desde el bloque 75:

> *Duplicar líneas sirve para un CAMPO; para un MODELO nuevo rompió el cliente.*

Y volvió a romperlo en el 95, con `createdBy`. El `class.ts` generado lleva el
esquema entero embebido como JSON y un `runtimeDataModel`: meter un modelo ahí
a mano es exactamente el movimiento que ya falló dos veces.

**Entregar un servicio que no se ha podido compilar sería peor que no
entregarlo.** Es el bloque 16.1: un P1012 apareciendo en la máquina del usuario
con 22 archivos ya escritos.

### Lo que desbloquea el 106-B — un solo comando

    npx.cmd prisma generate

Después de eso el cliente conoce `equipoInstalado`, el typecheck vuelve a
significar algo, y el 106-B entra entero: instalar, retirar (sólo supervisor,
con motivo y auditado), el historial del sitio y la ficha del activo.
