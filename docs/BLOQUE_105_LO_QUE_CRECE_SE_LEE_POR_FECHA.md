# Bloque 105 · Lo que crece se lee por fecha

Preparación del historial de activos. **Nada de esto se ve**: son índices y una
consulta. Se hace ahora porque las pantallas del 106 y el 107 van a recorrer
justo estas tablas, y montar una pantalla encima de un recorrido secuencial es
construir la lentitud a propósito.

## 1 · Los índices que faltaban

Medido sobre el esquema, no supuesto:

| Tabla | Índices | ¿Por fecha? | ¿`[assetId, fecha]`? |
|---|---|---|---|
| `WorkOrder` | 9 | **NO** | **NO** |
| `Incident` | 6 | `occurredAt` sí · `reportedAt` **NO** | **NO** |
| `AssetHistory` | 1 | **NO** | **NO** |
| `StockMovement` | 1 | **NO** | **NO** |
| `FailureEvent` | 5 | sí | **sí** — el único bien hecho |
| `AuditLog` | 3 | sí | n/a |

Las pantallas de historial piden siempre lo mismo: **«lo de ESTE activo, por
fecha, lo más reciente arriba»**. Sin el índice compuesto eso es recorrer la
tabla entera y ordenar en memoria.

> Con cuatrocientas filas va instantáneo. Con treinta mil y cincuenta personas
> a la vez, la pantalla tarda — y nadie relaciona esa lentitud con un índice
> que no se puso en 2026.

**Seis índices nuevos**, en una migración escrita a mano con los nombres
EXACTOS que generaría Prisma (`<tabla>_<campos>_idx`, con el nombre completo de
cada campo). Abreviarlos hace que `prisma migrate dev` crea que falta el
índice, lo vuelva a crear, y queden dos iguales sobre la misma columna — cada
escritura paga los dos. Es el fallo del bloque 16.3.

### Y dos tablas quedan EXENTAS, con su motivo

`AssetHistory` y `StockMovement` no llevan índice por fecha suelto. Se midió:
**cero consultas sin `assetId`** — sólo se llega a ellas como relación de su
equipo. Un índice que nadie usaría se pagaría en cada escritura.

Es la regla del bloque 101 aplicada a los índices: *un índice sobre algo que
nadie consulta así no hace la pantalla más rápida; sólo hace las escrituras más
lentas.*

## 2 · El N+1 que crecía con la planta

Barrido de consultas dentro de bucles: **61 candidatos**. Afinado —descartando
lo que va dentro de `Promise.all`, que es paralelo y no cascada— quedan **10
reales**, y de esos sólo uno importa:

```ts
for (const plan of due) {
  const openWo = await this.prisma.workOrder.findFirst({   // ← UNA POR ACTIVO
    where: { assetId: plan.assetId, type: 'PREVENTIVO', status: { in: OPEN_WO } },
  });
```

Con cuatrocientos equipos vencidos son **cuatrocientas idas y vueltas** a la
base en cada tick del planificador, cada una atando una conexión del pool.

No se veía porque el planificador corre solo y nadie lo mira. Pero es
exactamente el trabajo que **crece con el tamaño de la planta**, que es la
única clase de lentitud que acaba importando.

Ahora es **una consulta y un conjunto en memoria**. Resultado idéntico.

*Los otros nueve se revisaron uno a uno y se dejan: el despachador actualiza
por mensaje a propósito, y el resto está acotado por listas pequeñas — una
campaña, cinco hojas de ruta, cuatro personas.*

> **Cuando un barrido da 61 resultados, lo primero que hay que dudar es del
> barrido.** Van quince veces en este proyecto.

## 3 · Verificador 17 del backend — `verificar:indices-fecha`

Comprueba que toda tabla que crece con los AÑOS tenga índice por su fecha y, si
tiene `assetId`, el compuesto. **Y que toda exención diga por qué**: una
exención sin motivo es una exención que nadie decidió.

**Probado reintroduciendo el fallo en tres direcciones:** quitando el compuesto,
quitando el índice por fecha, y dejando una exención sin motivo. Las tres salen
en rojo nombrando la tabla.

## Piezas

| | |
|---|---|
| `prisma/schema.prisma` | 6 `@@index` nuevos, declarados |
| `prisma/migrations/20260917000000_indices_de_historial` | **NUEVO** · el SQL, con los nombres de Prisma |
| `src/modules/preventive/preventive.service.ts` | una consulta para todos, no una por activo |
| `test/preventive.service.spec.ts` | el simulacro, actualizado a la decisión nueva |
| `scripts/verificar-indices-de-fecha.js` | **NUEVO** · verificador 17 |
| `scripts/verificar-topes.js` | la consulta nueva, declarada como HIJO con su motivo |
| `package.json` | el verificador nuevo, dentro del agregado |

## Cadena

    typecheck            OK
    17 verificadores     OK  (incluido el nuevo)
    migraciones          sin desfase
    pruebas del preventivo   8/8
    pruebas del bloqueo      9/9

## Tres cosas que me cazaron a mí, y conviene que estén escritas

1. **`verificar:migraciones` leyó «por» como una columna.** Un comentario
   `/* */` dentro de un modelo de Prisma confunde al analizador. Dentro de un
   modelo, los comentarios van con `///`.
2. **`verificar:ambito` cazó un `@Get(':id')` sin ámbito.** Al insertar la ruta
   nueva antes que ella, me llevé por delante su `@SinAmbito()`. *El ancla
   tiene que ser única y hay que mirar qué hay pegado debajo* — bloque 77.
3. **`verificar:topes` cazó mi consulta nueva.** Tenía razón en preguntar:
   está acotada por el conjunto de ids vencidos, no por la tabla, y eso hay
   que **declararlo**, no suponerlo.

*A un verificador propio se le hace caso o se borra.* Las tres veces tenían razón.

---

## Y UN ERROR MÍO QUE LLEGÓ HASTA LA BASE DE DATOS DEL USUARIO

La primera versión de este bloque declaró esto:

```prisma
model StockMovement {
  ...
  @@index([assetId, createdAt])     // ← `assetId` NO EXISTE en este modelo
}
```

`StockMovement` **no conoce el activo**: el movimiento cuelga del REPUESTO
(`sparePartId`). Se llega a él por el repuesto o por la línea de material de la
orden.

`npx prisma migrate deploy` en la máquina del usuario:

    Error: P3018
    ERROR: column "assetId" does not exist

### Lo que NO lo cazó, y es lo importante

| Control | ¿Lo vio? |
|---|---|
| `tsc --noEmit` | no — el esquema no es TypeScript |
| `verificar:campos` | no — mira los `select`, no los `@@index` |
| `verificar:migraciones` | **no** — compara columnas declaradas contra el SQL, y las dos decían `assetId` |
| `verificar:indices-fecha` (el nuevo) | **no** — exigía el índice sin comprobar que el campo existiera |
| `npx prisma validate` | **SÍ lo habría cazado** |

Y `prisma validate` **ya está en la CI** (`ci.yml:59`). El fallo no fue de
cobertura: fue de **ORDEN**. Se corrió `migrate deploy` contra la base antes de
validar el esquema, porque `prisma validate` no se puede ejecutar en el entorno
del agente —descarga un motor y la red está cerrada— y se dio por bueno sin
decirlo.

> **Un control que existe pero se ejecuta DESPUÉS del daño no es un control.**
> Es la misma familia que el `|| true` del bloque 85 y la prueba que siempre se
> saltaba del 89, con una cara nueva: el orden.

### Las dos correcciones

1. **El índice pasa a `[sparePartId, createdAt]`**, que es como se consulta esa
   tabla de verdad.
2. **El verificador comprueba ahora que el campo EXISTA** antes de exigir un
   índice sobre él. Probado poniéndole `assetId` a `StockMovement`: sale en rojo
   diciendo *«ese campo NO existe en el modelo. Corrige la lista, no el
   esquema.»*

### Y la regla de proceso, que es lo que queda

> **`npx prisma validate` va ANTES de `prisma migrate deploy`.** Siempre. Y si
> el entorno no puede correrlo, se dice — no se omite del paso a paso.

La base del usuario **no quedó tocada**: Prisma envuelve cada migración en una
transacción, así que la migración fallida no creó ningún índice a medias. Se
recupera con `prisma migrate resolve --rolled-back`.
