# Bloque 107 · Lo que salió de planta sigue contando

> *«Nos puede eliminar toda la data... mejor hagamos un módulo de historial de
> equipos desfasados/retirados.»*

---

## 1 · Primero se midió qué había ya

Antes de escribir una línea se buscó en el código qué parte del historial
existía. **La mitad estaba hecha**, y darlo por perdido habría reescrito cosas
que funcionan:

| Pieza | Estado |
|---|---|
| `GET /assets/:id/historial` | **Ya existía** — órdenes con causa, incidencias, tramos de cable, accesos, infraestructura compartida |
| `HistorialActivo.tsx` | **Ya existía**, dentro del alta de OM y de la ficha |
| `GET /assets/reincidentes` | **Ya existía**, usado en «Avance del mapeo» |
| Pantalla de equipos retirados | **No existía** |
| Historial abierto al técnico | **No** — cerrado con `asset.read` |

Así que el bloque quedó en tres cosas concretas, no en un módulo nuevo.

---

## 2 · `GET /assets/retirados` y la pantalla «Equipos retirados»

Un equipo dado de baja no es basura que estorba: es la mitad del **informe de
reemplazo** («esta cámara se cambió tres veces en dos años») y del **informe de
migración**. Borrarlo para «limpiar» tira meses de historial de campo. Por eso
el usuario descartó el botón de borrado masivo y pidió esta pantalla.

**Por qué no se reutiliza `findAll` con `?status=BAJA`:** `findAll` filtra
`deletedAt: null` de entrada, que es justo lo que aquí hay que mirar. Colarle
una excepción lo dejaría con dos comportamientos, y el día que alguien olvide
el parámetro, los equipos retirados saldrían mezclados con los vivos en la
pantalla del ingeniero.

Por cada equipo: ficha, **fecha de salida**, **quién firmó la baja** (sale de
la auditoría, no de un campo duplicado en el activo) y **la última orden con su
causa** — que es lo que responde *por qué salió*.

**Una fecha que no se sabe, se dice.** Las bajas antiguas no dejaron marca:
ahí se usa `updatedAt` y la fila lo escribe como *aproximada*. Enseñarla como
exacta sería inventar una fecha para que la tabla quede bonita.

**Tres consultas y ningún bucle:** equipos, firmas de auditoría y última orden.
`take` de 200 **con su `count`**, porque un recorte que no se dice es una
mentira (bloque 101).

**Aquí no se borra nada.** La purga definitiva sigue en Limpieza, con su
permiso propio y escribiendo el código a mano.

---

## 3 · El historial deja de ser sólo del ingeniero

`GET /assets/:id/historial` estaba cerrado con `asset.read`. El técnico que va
a intervenir y el jefe de tren que pregunta *«¿otra vez esta cámara?»* no
podían abrirlo — y son los dos que más lo necesitan. Es el mismo fallo de los
bloques 68, 77 y 83.

Se abre a `activos.mirar`, **después de comprobar qué devuelve**: órdenes,
incidencias, tramos, accesos e infraestructura compartida. Ni una contraseña,
ni una IP de gestión. Queda escrito en el propio controlador que si algún día
se le añade un dato sensible, la llave hay que volver a estrecharla.

---

## 4 · El N+1 más caro del proyecto, medido

`reincidentes()` era un `for` con un `await` dentro llamando a `delActivo`, y
`delActivo` hace **seis consultas**:

```
150 candidatos × 6 consultas = 900 consultas
y además EN FILA: cada una espera a la anterior
≈ 4,5 s a 5 ms de ida y vuelta contra Railway
```

Y se dispara al abrir **«Avance del mapeo»**.

**No se cambió el cálculo ni un solo resultado.** Las consultas son las mismas;
lo único que cambia es que van **de cinco en cinco** en vez de una detrás de
otra. El orden de entrada se conserva escribiendo en la posición que toca — no
con `push` — porque el `sort` de después es estable y un empate resuelto al
revés cambiaría la primera fila de la pantalla.

**Cinco y no cincuenta:** el pool de conexiones de Prisma es limitado y ésta no
es la única consulta del servidor.

> **Sigue siendo la consulta más cara del proyecto.** La forma correcta de
> arreglarla del todo es calcular la reincidencia con agregados en vez de
> activo por activo, y eso es un bloque propio. Esto quita el grueso del dolor
> sin arriesgar el resultado. Queda escrito para no olvidarlo.

---

## 5 · Verde

```
backend    18 verificadores VERDE · typecheck OK · 107 pruebas del área OK
frontend   20 verificadores VERDE · typecheck OK · lint 0 avisos
menú       53 entradas, 53 pantallas — ninguna huérfana
```
