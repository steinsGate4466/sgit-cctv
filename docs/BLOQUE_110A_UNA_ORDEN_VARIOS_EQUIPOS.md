# Bloque 110-A · Una orden, varios equipos

> *«Reportado ≠ intervenido.»*

---

## 1 · La cifra que iba mal al comité

Hasta aquí una orden colgaba de **un** activo. En planta eso casi nunca es
verdad:

- una orden de **mapeo** recorre el lecho de enfriamiento y levanta **12
  cámaras** — en los indicadores contaba como **una**;
- Producción reporta la cámara 45, el técnico llega y el problema es el
  **switch**: se arregla el switch, la orden queda apuntada a la cámara y **la
  avería del switch no existe para nadie**;
- un corte de energía deja media sala sin visión: una orden, ocho equipos.

**Consecuencia medible:** un tren donde se tocaron 40 equipos reporta 12
órdenes. Con esa cifra se pide presupuesto.

---

## 2 · Aditivo, como el 106-A, y por el mismo motivo

`WorkOrder.assetId` **no se retira**. Lo leen 353 rutas y decenas de pantallas;
quitarlo sería un bloque de semanas con riesgo en cada esquina.

Se queda como **el equipo principal** —el que encabeza la orden— y la tabla
nueva añade los demás.

## 3 · El papel en una columna, no dos listas

Dos relaciones (`reportados` / `intervenidos`) obligarían a consultar dos veces
y unir en memoria para responder *«¿en qué órdenes sale esta cámara?»*, que es
**la** pregunta del historial. Con el papel como columna es un `where assetId`
y ya.

Y un mismo equipo puede salir con **los dos papeles** en la misma orden — se
reportó y además se intervino —, que es el caso normal. Por eso la unicidad es
por los tres campos.

---

## 4 · El traspaso: tres orígenes, y sólo tres

| Origen | Papel | Qué recupera |
|---|---|---|
| `work_orders.assetId` | INTERVENIDO | El equipo principal de cada orden |
| `work_orders.assignedAssetId` | REPORTADO | Lo que el ingeniero pidió al abrir |
| `assets.mappedInWorkOrderId` | INTERVENIDO | **El grueso**: los equipos de cada campaña de mapeo |

**Lo que no está escrito NO se inventa.** Una orden sin equipo asignado se
queda sin fila de REPORTADO: rellenarla con el equipo intervenido diría que
Producción reportó algo que quizá nunca reportó — y ese dato inventado viajaría
después a un informe.

La migración es **idempotente de principio a fin** (`IF NOT EXISTS`,
`ON CONFLICT DO NOTHING`, `DO $$ ... EXCEPTION`). La lección del bloque 105
salió cara: una migración que falla a medias deja índices creados y revienta al
reintentar.

---

## 5 · Lo que el booleano `scopeChanged` no distinguía

Dos situaciones que en planta no se parecen en nada:

| Caso | Alcance | ¿Queda deuda? |
|---|---|---|
| Se reportó la cámara, se tocó el switch | cambió | **Sí** — la cámara puede seguir mal y Producción tiene que enterarse |
| Se tocó la cámara **y además** el switch | cambió | **No** — el técnico encontró algo más |

`equiposDeLaOrden()` devuelve las dos listas por separado: `reportadosSinTocar`
e `intervenidosNoReportados`. Hay una prueba para cada caso.

---

## 6 · Las dos cifras conviven

**Órdenes** sigue siendo la unidad de **gestión**: una parada, un permiso, un
cierre. **Intervenciones** es la unidad de **trabajo**.

Enseñar sólo la segunda haría creer que se abrieron 40 órdenes; enseñar sólo la
primera es lo que veníamos haciendo mal. `contar()` devuelve las dos y la
pantalla escribe las dos.

Y con cero órdenes la media es **0, nunca NaN**: un NaN en un tablero que va a
una reunión es peor que una casilla vacía, porque parece un número.

---

## 7 · Por qué el bloque está partido

`om-equipos.ts` —donde están todas las decisiones— **ya está escrito y probado,
16 pruebas**. El servicio que lee la tabla necesita el cliente de Prisma
regenerado, y eso no corre en este entorno.

Es la misma partición del 106, y la regla ya escrita en CLAUDE.md §48: *cuando
una parte del bloque no se puede compilar aquí, se parte el bloque y se dice.*

**110-B** (servicio, endpoints y pantalla) arranca en cuanto corra
`npx.cmd prisma generate`.

---

## 8 · Verde

```
backend    18 verificadores VERDE · typecheck OK · 16 pruebas nuevas
esquema    82 modelos, 55 enums · 140 claves foráneas con su inversa
migración  sin desfase con el esquema
```
