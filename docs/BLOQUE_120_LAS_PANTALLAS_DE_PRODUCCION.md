# Bloque 120 · Las pantallas de Producción se leen igual

> *«Pule el apartado visual, que es lo que más atrae a Producción.»*

---

## 1 · Por qué esto no es maquillaje

**Producción no lee un esquema de base de datos.** Mira una pantalla y decide
en tres segundos si el sistema le sirve.

Una pantalla que se lee distinta de su vecina **hace dudar de los datos que
enseña**, por buenos que sean. Y ese es el riesgo real de una exposición: no
que falte un dato, sino que el conjunto no parezca terminado.

---

## 2 · El patrón, y en qué orden

Una pantalla de Producción contesta de arriba abajo:

| | Qué | Para quién |
|---|---|---|
| 1 | **`<Titular>`** — la frase | El que pasa y mira. «3 órdenes detenidas». Muchas veces no hace falta bajar más |
| 2 | **`<Cifras>`** — el desglose | El que quiere el número |
| 3 | **la tabla** | El que va a actuar |
| 4 | **esqueleto** mientras carga | Sin él la página pega un salto y se lee como que algo falló |
| 5 | **el estado vacío** | Una tabla con cabecera y cero filas no dice «no hay nada»: dice que se rompió |

---

## 3 · Los tres huecos que había

### `Avance de órdenes` — la pantalla estrella, sin titular

Abría con una tabla de seis columnas. **La que más se va a enseñar el lunes.**

Ahora abre con una frase, y el orden de las comprobaciones es la decisión —el
mismo criterio que `avance.ts`—: **lo detenido manda sobre todo**, porque es lo
único de esa pantalla que Producción puede desatascar. Una orden parada por
falta de manlift es suya; una que avanza despacio, no.

```
3 órdenes detenidas
Están esperando algo declarado: repuesto, manlift o parada.
```

### `Zonas vitales` — abría con tres recuadros y un párrafo

Ahora abre con la frase. Y **lo vencido manda sobre lo que falta por declarar**:
una declaración caducada sigue subiendo la prioridad de todas las cámaras que
cuelgan de esa zona, y eso ensucia la cola de trabajo sin que nadie lo note.

### `Estado por Tren` — un «Cargando…» suelto

El texto ocupa una línea; lo que viene después, media pantalla. Al llegar los
datos la página **pega un salto** que se lee como un fallo. Sustituido por el
esqueleto, que reserva el sitio.

---

## 4 · `verificar:patron` — verificador 25 del frontend

Las once pantallas que abre Producción tienen que llevar titular, esqueleto y
estado vacío.

**No exige `<Cifras>`**: hay pantallas cuyo contenido no son números, y obligar
a poner un contador sería pedir adorno.

**No se aplica a gestión técnica ni a sistema**: un formulario de alta no
necesita titular, y exigírselo llenaría el informe de ruido — que es como muere
un verificador.

La lista de pantallas está escrita a mano y no deducida del menú, **a
propósito**: una pantalla puede cambiar de sección por un motivo de negocio sin
que su forma de leerse tenga que cambiar.

**Probado reintroduciendo el fallo.**

---

## 5 · Verde

```
frontend   25 verificadores VERDE · typecheck OK · lint 0 avisos
```
