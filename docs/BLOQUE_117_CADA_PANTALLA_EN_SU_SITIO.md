# Bloque 117 · Cada pantalla en su sitio

> Petición del usuario: *«que todo encaje donde debe encajar, que esté
> correlacionado, que tenga sentido el porqué está visualizado en tal lado, que
> no haya repetición de data, que los botones manden donde deben, y que el
> texto sea conciso y profesional».*

Es la primera vez que se audita la ESTRUCTURA del menú contra el sentido del
negocio. Hasta hoy cada pantalla se colocó donde encajaba el día que se
escribió.

---

## 1 · El criterio: cada sección contesta UNA pregunta

| Sección | Pregunta | Quién la abre | Norma que la respalda |
|---|---|---|---|
| **(lo mío)** | ¿Qué me toca a mí ahora? | cualquiera | — |
| **Producción** | ¿Cómo está mi línea y qué pedí? | Producción | ITIL 4 · Gestión de Nivel de Servicio (el cliente mira, no ejecuta) |
| **Gestión del mantenimiento** | El ciclo del trabajo: incidencia → orden → parada → cierre → indicador | Mantenimiento | ISO 14224 · EN 15341 |
| **Gestión técnica** | ¿Qué activos hay y en qué estado está el parque? | Mantenimiento / TI | ISO 55000 · CMDB (ITIL SCM) |
| **Dependencias** | ¿De qué depende que ese activo funcione? | TI / Red | ISO 14224, niveles superiores de la taxonomía |
| **Sistema** | Personas, permisos y trazabilidad | TI | ISO/IEC 27001 |

**Si una pantalla no contesta la pregunta de su sección, está mal colocada.**
Con ese criterio salieron cuatro.

---

## 2 · Las cuatro que se movieron, y por qué

| Pantalla | Estaba en | Pasa a | Motivo |
|---|---|---|---|
| **Riesgo de activos** (obsolescencia, repuestos críticos) | Gestión del mantenimiento | **Gestión técnica** | No es trabajo: es el estado del **parque**. ISO 55000. Y es la entrada natural al informe de reemplazo del bloque 108 |
| **Rotulado** (norma de colores) | Gestión técnica | **Dependencias** | Es la norma que rige el **cable**, no un equipo. Vive junto a lo que gobierna |
| **Equipos conocidos** (desde qué PC entra cada persona) | Gestión técnica | **Sistema** | No es un activo de planta: es **control de acceso**. Pide `user.manage`. ISO 27001, no ISO 14224 |
| **Exportar** | Gestión del mantenimiento | **Sistema** | Exporta activos, ubicaciones, órdenes, red y almacén. **Es transversal**; estaba colgando de uno solo de sus cinco temas |

---

## 3 · Seis nombres, reescritos

El criterio: **el rótulo dice qué hay dentro, no cómo suena**.

| Antes | Ahora | Por qué |
|---|---|---|
| De qué depende | **Impacto de una caída** | Coloquial y ambiguo. Lo que enseña es el alcance de una caída |
| Cómo van las OM | **Avance de órdenes** | Igual |
| Salud de los datos | **Calidad de datos** | «Salud» es metáfora. Calidad de datos es el término del oficio |
| Quién está dentro | **Sesiones activas** | Igual |
| Mejora | **Órdenes de mejora** | «Mejora» sola no dice que sean órdenes |
| Vista general | **Resumen de planta** | «General» no dice de qué |

Cada uno se cambió en **tres sitios a la vez** —el menú, el título de la
cabecera y el `<h1>` de la pantalla— para que no se descuadren.

---

## 4 · Lo que NO se tocó, y hay que decidir

Tres solapamientos reales. **No se resuelven aquí a propósito**: borrar o
fusionar pantallas a dos días de una exposición es temerario, y la decisión es
del usuario, no mía.

### a) «Resumen de planta» y «Estado por Tren»

Las dos beben de `/dashboard/infra/trenes` y las dos pintan titular + cifras.
`Estado por Tren` añade el detalle por tren y los equipos sin ubicar.

> **Son la misma pregunta con dos profundidades.** Lo natural es una pantalla
> con un nivel de detalle desplegable.

### b) «Preventivo», «Correctivo» y «Órdenes de mejora»

Las tres filtran `/work-orders` por tipo, y están al lado de «Órdenes (OM)».
**Cuatro entradas para un solo objeto.** En ISO 14224 preventivo y correctivo
no son módulos: son **clases del mismo evento de mantenimiento**.

> Lo natural son pestañas dentro de «Órdenes», no cuatro entradas de menú.
> Tal como está, alguien que busca una orden tiene cuatro sitios donde mirar.

### c) «Dashboard» e «Indicadores»

Dos pantallas de cifras en la misma sección. La pregunta «¿dónde miro los
números?» tiene dos respuestas, que es lo mismo que no tener ninguna.

---

## 5 · Lo que ya estaba bien, y conviene decirlo

El barrido de los días anteriores midió esto y salió limpio:

- **355 rutas del backend contra 381 llamadas del frontend: 0 botones que
  llamen a algo que no existe.**
- **0 rutas literales tapadas** por una ruta con parámetro.
- Los permisos del menú contra los de cada endpoint: **0 reales** — las
  pantallas ya se protegen solas.

La estructura estaba mal repartida. **Los enlaces no.**

---

## 6 · Verde

```
frontend   23 verificadores VERDE · typecheck OK · lint 0 avisos
menú       6 secciones, 53 entradas, 53 pantallas — ninguna huérfana
```
