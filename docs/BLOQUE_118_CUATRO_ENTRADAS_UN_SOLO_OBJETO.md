# Bloque 118 · Cuatro entradas para un solo objeto

> Cierra dos de los tres solapamientos que señaló el bloque 117.

---

## 1 · El problema

**«Órdenes (OM)», «Preventivo», «Correctivo» y «Órdenes de mejora»**: cuatro
entradas de menú, y las tres últimas filtran las mismas órdenes por tipo.

En **ISO 14224** preventivo y correctivo no son módulos: son **clases del mismo
evento de mantenimiento**. Tratarlas como pantallas separadas obliga a quien
busca una orden a mirar en cuatro sitios, **y ninguno de los cuatro las
contiene todas**.

Lo mismo con **«Dashboard» e «Indicadores»**: dos pantallas de cifras, el mismo
permiso, la misma audiencia. *«¿Dónde miro los números?»* tenía dos respuestas,
que es lo mismo que no tener ninguna.

---

## 2 · Lo que NO se juntó, y es el hallazgo más útil

«Resumen de planta» y «Estado por Tren» parecían el tercer solapamiento: misma
fuente de datos, mismo patrón de pantalla. **No lo son.**

| Pantalla | Permiso | Audiencia |
|---|---|---|
| Resumen de planta | `om.mirar` | **Producción** |
| Estado por Tren | `dashboard.read` | **Mantenimiento** |

> **Dos pantallas parecidas con audiencias distintas no son un duplicado.**
> Mirar sólo el contenido lo habría dado por bueno y habría dejado a Producción
> sin su pantalla. Lo que lo decidió fue mirar **quién entra**.

---

## 3 · Lo que se hizo

Las cuatro pantallas **siguen enteras y sus rutas siguen funcionando**. Sólo
dejan de tener entrada propia y se alcanzan por la pestaña de su padre.

```
Órdenes (OM)   →  Todas · Preventivo · Correctivo · Mejora
Dashboard      →  Análisis · Indicadores
```

El orden de las pestañas no es alfabético: es **el orden en que se usan**.
Primero todas las órdenes, después las que nacen de un plan, las que nacen de
una avería y las de mejora. En el tablero, primero el análisis —qué está
pasando— y después los indicadores —si se cumple la meta—.

**Una pestaña que el usuario no puede abrir no se pinta.** Enseñarla y que
devuelva 403 al pulsarla es peor que no enseñarla: se lee como sistema roto, no
como falta de permiso (lección del bloque 67).

**El menú baja de 53 entradas a 49** sin perder una sola pantalla.

---

## 4 · Por qué no fueron a `EXENTAS`, y la diferencia importa

El verificador del menú ya tenía una lista de exenciones. Habría sido lo fácil.

Una exención dice *«a esta pantalla no se llega desde el menú y ya»*. Aquí sí
se llega, por un camino **declarado y comprobable**: su padre tiene que estar
en el menú.

Así que el verificador aprendió a leer `pestanas.ts` y comprueba que **el padre
de cada pestaña siga teniendo entrada**. Si alguien quitara «Órdenes (OM)», las
cuatro se quedarían sin forma de llegar — y el verificador lo dice.

Una exención no lo habría dicho nunca.

**Probado reintroduciendo el fallo:** quitando la entrada del padre, sale con
código 1 y nombra las cuatro pestañas que quedarían colgando.

---

## 5 · Verde

```
frontend   23 verificadores VERDE · typecheck OK · lint 0 avisos
menú       6 secciones, 49 entradas, 53 pantallas — ninguna huérfana
```
