# Bloque 119 · El nombre que sólo oyen algunos

---

## 1 · Un falso positivo, y por qué lo cuento

Empecé a mirar esto creyendo que había encontrado un fallo gordo: **37 de 56
pantallas pintan su propio `<h1>`** mientras la cabecera ya pinta el título.
Título repetido en casi todas.

**No lo era.** La hoja de estilos oculta ese `<h1>` a la vista:

```css
.page-title { position: absolute; width: 1px; height: 1px; clip-path: inset(50%); }
```

Y el comentario de al lado explica por qué no se borró: *un lector de pantalla
sigue anunciando el encabezado de la sección; borrarlo dejaría la pantalla sin
`<h1>` para quien navega a ciegas.*

> Estuve a un paso de «arreglar» 37 pantallas y romper la accesibilidad de
> todas. **Lo que lo evitó fue leer el CSS antes de tocar el código.**

---

## 2 · El fallo real que había debajo

Cada pantalla tiene su nombre escrito **dos veces**: el de la cabecera, que se
ve, y el oculto, que se oye. Y **al estar invisible, nadie nota cuando los dos
dejan de decir lo mismo**.

Se desincronizan solos: al renombrar una entrada de menú se toca el mapa de
títulos y se olvida el `<h1>`. Había cuatro:

| Ruta | Cabecera | Pantalla |
|---|---|---|
| `/dependencias` | Impacto de una caída | De qué depende cada cámara |
| `/mis-activos` | Mis activos y cómo se llega a ellos | Activos por tren |
| `/mapa-de-red` | Mapa de red por gabinete y tablero | Mapa de red |
| `/inventory` | Inventario de Repuestos | Inventario |

**Tres de las cuatro las causé yo** renombrando entradas en el bloque 117.

Para quien ve, invisible. Para quien usa lector de pantalla, **es otra
pantalla**: el sistema le anuncia un sitio y le enseña otro.

Manda el de la cabecera —es el que el usuario lee— y los cuatro ocultos se
alinearon con él.

---

## 3 · `verificar:titulos` — verificador 24 del frontend

Compara palabra por palabra los dos nombres de cada pantalla.

No mira las pantallas sin `page-title` (no tenerlo es otro asunto) ni los
títulos armados con una variable (`{tren.nombre}`), donde no hay texto fijo que
comparar.

**Probado reintroduciendo el fallo.**

> Este es el tipo de defecto que **ningún recorrido manual encuentra**: no se
> ve en la pantalla. Sólo lo caza algo que compare los dos textos, y ahora hay
> algo que los compara en cada `npm run verificar`.

---

## 4 · Verde

```
frontend   24 verificadores VERDE · typecheck OK · lint 0 avisos
```
