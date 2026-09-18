# Bloque 113 · «Cómo van las OM de mi tren»

> Pedido del usuario: *«que el supervisor pueda ver cómo van las OM de ese
> tren»* y *«en qué van mis técnicos, cómo están avanzando, si están llenando
> todo el formulario, en qué proceso están, si están por acabar o de repente ni
> siquiera han empezado»*.

---

## 1 · Lo primero fue MEDIR, no construir

| Pregunta | Respuesta medida en el código |
|---|---|
| ¿Producción puede ver OM? | Sí. `GET /work-orders` acepta `wo.read` **o** `om.mirar` (bloque 83) |
| ¿Se recorta por su tren? | Sí, y lo hace el **servidor**: `filtroConAmbito` |
| ¿Y si escribe `?tren=T1` a mano? | Ve vacío. `cruzarAmbito` manda lo más restrictivo |
| ¿Está el avance guardado? | Sí: `progressPct`, la serie `WorkOrderProgress` y `detailedAt` |
| ¿Hay tiempo real? | **No.** Cero WebSocket, cero SSE en todo el proyecto |

**Faltaba la pantalla, no los datos ni el permiso.** Dar por hecho que faltaba
todo habría reescrito lo que ya funciona — y habría tocado el recorte de
permisos, que es lo último que se debe tocar.

---

## 2 · Por qué NO se usa WebSocket

Decisión escrita también en `CLAUDE.md` §48.1 para no volver a discutirla.

1. **Dos réplicas en Railway.** Un socket exige afinidad de sesión o un bus
   (Redis). Eso es infraestructura nueva y la decide el usuario, no yo.
2. **El púlpito deja la pantalla abierta ocho horas.** Un socket que se cae y
   no reconecta es *peor* que un refresco: se queda congelado, la pantalla no
   parece rota — parece tranquila — y nadie se entera.
3. **Nadie necesita un segundo de latencia** para saber cómo va una orden.

> **Lo que hace falta no es latencia baja: es saber de cuándo es el dato.**

Así que: **refresco de 25 s** en pantalla ancha, apagado con la pestaña oculta
(`useRefrescoDePulpito`, bloque 42), recarga al volver a la pantalla en móvil
(`useVolverALaPantalla`, bloque 37), botón de «Actualizar ahora», y **la edad
del dato escrita arriba en segundos**, en ámbar a partir de los 90 s.

Tres peticiones por minuto contra un `RitmoGuard` de 600/min no rozan el cupo.

*Si algún día hace falta empuje de verdad: **SSE antes que WebSocket**, y el
bus se declara antes de empezar.*

---

## 3 · Lo que se construyó

### `backend/src/modules/maintenance/avance.ts` — función pura

Un 0 % son dos cosas muy distintas: «nadie la ha tocado» (Producción reclama) y
«el técnico está dentro esperando repuesto» (Producción resuelve el repuesto).
Pintarlas igual obliga a coger la radio, que es lo que este software evita.

```
EN_ESPERA            → DETENIDA      (manda sobre el porcentaje)
pct >= 80            → POR_ACABAR
pct > 0              → EN_CURSO
arrancada o con parte→ EN_CURSO
detailedAt           → PREPARADA
nada                 → SIN_EMPEZAR
```

El **orden** es todo el diseño: si `EN_ESPERA` se mirara después del
porcentaje, una orden al 90 % parada tres días por falta de repuesto saldría
«por acabar» y nadie iría a desbloquearla. Hay una prueba para exactamente eso.

Es una función **pura** y se calcula en el **servidor**: lo que se puede
calcular no se guarda, y si lo decidiera cada pantalla, en tres bloques habría
tres definiciones de «por acabar».

**13 pruebas**, incluida la del reloj adelantado (`horasSinNoticias` nunca
devuelve un negativo).

### `GET /work-orders/tablero` — endpoint propio

No es un parámetro más en `findAll`: esa es la lista del ingeniero, con catorce
filtros y `computeEffectiveStatuses` por fila. Esta pantalla refresca cada 25 s
durante ocho horas y **no debe pagar eso**.

- Sólo órdenes **vivas** (`ABIERTA`, `EN_PROCESO`, `EN_ESPERA`).
- Ordena por estado descendente: lo **detenido** arriba, que es lo único que
  Producción puede desatascar.
- `take` 200 **con su `count`**, porque un recorte que no se dice es una
  mentira (bloque 101). La pantalla escribe «se enseñan 200 de 340».
- El **último parte de cada orden** en dos consultas exactas (`groupBy` del
  máximo + lectura de esas filas). Una sola consulta con tope global habría
  dejado fuera justo la orden que lleva tres días sin noticias.
- `generadoEn` del **servidor**, para poder enseñar la hora de generación
  aparte de la edad local.

### `frontend/src/pages/TableroOm.tsx` — sólo lectura

Seis columnas: orden · dónde · técnico · en qué va · último parte · sin
noticias. Ni un botón que cambie nada; el único que hay vuelve a pedir datos.

«Si están llenando el formulario» se responde con el **número de puntos
respondidos**, no con un porcentaje: el total depende del tipo de equipo y de
la hoja de ruta, y un porcentaje contra un total que no se conoce es una cifra
inventada con pinta de medida.

---

## 4 · El verificador que tenía un agujero

Escribiendo la pantalla se usó `'edad-dato viejo'` y **`viejo` no existía en la
hoja de estilos**. `verificar:clases` dijo VERDE.

Sus tres barridos cogían la clase pegada a la llave y las precedidas de
espacio, pero **no el primer literal de un ternario**:

```
className={edad >= VIEJO ? 'edad-dato viejo' : 'edad-dato'}
                            ^^^^^^^^^^^^^^^ invisible para los tres
```

Es exactamente el fallo que ese verificador existe para cazar, y con guantes
en el púlpito el aviso de «dato viejo» habría salido sin formato.

**Cómo se cerró sin empezar a gritar de más:** un literal cuenta como cadena de
clases sólo si todas sus palabras tienen pinta de clase (minúsculas y guiones)
**y al menos una ya está definida en la hoja**. `'ABIERTA'` no entra;
`'edad-dato viejo'` sí. La primera versión sacó tres falsos positivos
(`marca-`, `cam-pie-`, `v-`): se les aplica la misma regla de prefijo que ya
tenía el verificador para las clases dinámicas.

**Probado reintroduciendo el fallo:** una clase inventada en un ternario sale
con código 1, señalando archivo y línea.

---

## 5 · Verde

```
backend    18 verificadores VERDE · typecheck OK · 27 pruebas del área OK
frontend   20 verificadores VERDE · typecheck OK · lint 0 avisos
```
