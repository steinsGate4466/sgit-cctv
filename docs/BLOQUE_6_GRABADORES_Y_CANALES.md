# Bloque 6 — Grabadores y canales

**Fecha:** 03/08/2026 · **Estado:** implementado (6a + 6b)

## El problema

En el púlpito nadie dice «AA-CAM-T2-045». Dice **«el canal 7 está negro»** o
**«no se ve la de la grúa»**. Hasta hoy, traducir eso a un activo del sistema
dependía de que estuviera de turno alguien con memoria.

Ese es el hueco que cierra este bloque: la tabla de traducción
**canal ↔ cámara ↔ nombre que se ve en la pantalla del púlpito**.

## Qué se entregó

| Parte | Qué hace |
|---|---|
| **Buscador «¿qué te dijeron por radio?»** | Se escribe `canal 7`, `c7`, `7`, `grúa`, `AA-CAM-T2-045` o el sitio. Devuelve la cámara. |
| **Lista de grabadores** | Cada NVR con sus canales usados, libres y sus problemas de carga. |
| **Rejilla (6a)** | El grabador dibujado casilla por casilla, como se ve en el púlpito. |
| **Enlazar (6b)** | Meter una cámara en un canal sin entrar a editar activo por activo. |

## El fallo que se encontró por el camino

Al revisar cómo se enlazaba la cámara con su grabador apareció esto en
`network.service.ts`:

```ts
// ANTES — mal
const nvr = nvrPorCodigo.get((c.nvrName || '').trim().toUpperCase());
```

`nvrName` **no es el código del grabador**: es *«el nombre de la cámara tal
como se ve en el púlpito»* — cosas como `GRUA 2 PATIO`. Nunca iba a coincidir
con `AA-NVR-T2-01`.

**Consecuencia:** se rellenaba «Grabador al que entra» (`nvrId`, el campo
correcto) en la ficha de la cámara y **el mapa de la red seguía sin dibujar ni
un solo enlace de cámara**. La función no estaba rota — estaba mirando el
campo equivocado.

```ts
// AHORA — bien
let nvr = c.nvrId && idsDeNvr.has(c.nvrId) ? c.nvrId : null;
if (!nvr) nvr = nvrPorCodigo.get((c.nvrName || '').trim().toUpperCase()) ?? null;
```

El nombre se conserva **sólo** como respaldo para datos cargados antes de que
el campo existiera. Cuando no queden, esa segunda vía se puede borrar.

## Los cuatro problemas de carga que la rejilla denuncia

No son fallos de red: los comete quien registra, y hay que enseñárselos donde
los pueda arreglar.

| Problema | Por qué importa |
|---|---|
| `SIN_CANAL` | La cámara entra al grabador pero no se sabe en qué recuadro sale. |
| `CANAL_DUPLICADO` | Dos cámaras en el mismo canal: sólo una puede ser cierta. |
| `FUERA_DE_RANGO` | Canal por encima de la capacidad: o la capacidad está mal, o el canal. |
| `SIN_NOMBRE` | Sin el nombre del púlpito no hay traducción posible desde la radio. |

## Dos decisiones que conviene no deshacer

**1. Si el grabador no declara capacidad, NO se inventa un número de canales.**
Poner 16 «porque suele ser 16» haría que la pantalla afirmara «quedan 9 libres»
sin saberlo, y alguien planificaría cámaras nuevas sobre esa suposición. Se
dibuja lo que hay ocupado y se avisa de que falta el dato.

**2. Sólo se ofrecen cámaras del mismo tren que el grabador.**
Una cámara del Tren 1 no se graba en el NVR del Tren 3. Ofrecerla sería
invitar a un error de carga que después cuesta encontrar.

## Endpoints

```
GET    /grabadores                        (asset.read)
GET    /grabadores/traducir?q=            (asset.read)
GET    /grabadores/:id/rejilla            (asset.read)
GET    /grabadores/:id/candidatas?q=      (asset.read)
POST   /grabadores/:id/enlazar            (asset.update)
DELETE /grabadores/:id/camaras/:assetId   (asset.update)
```

`traducir` va **antes** de `:id` en el controlador. Si no, Nest leería
«traducir» como el id de un grabador y devolvería 404. Mismo orden y mismo
motivo que en `network.controller.ts`.

## Archivos

```
backend/src/modules/network/canales.ts              (lógica pura, probada)
backend/src/modules/network/grabadores.service.ts
backend/src/modules/network/grabadores.controller.ts
backend/src/modules/network/dto/enlazar-camara.dto.ts
backend/src/modules/network/network.service.ts      (fallo corregido)
backend/test/canales.spec.ts                        (13 pruebas)
frontend/src/pages/Grabadores.tsx
frontend/src/styles.css                             (rejilla)
```

## Qué tiene que hacer el ingeniero

1. Registrar en la ficha de cada NVR **cuántos canales tiene**. Sin ese dato la
   rejilla no puede decir cuántos quedan libres.
2. Abrir cada grabador y colocar sus cámaras en los canales.
3. Poner el **nombre del púlpito** a cada una. Es el paso que la gente se salta
   y es el que hace que el buscador sirva de algo.

## Lo que sigue sin estar

El sistema **no lee el grabador**: nadie le pregunta al NVR qué tiene en cada
canal. La rejilla refleja lo que se ha registrado a mano. Leer el equipo
directamente es el bloque de integración con HikCentral, y depende de que la
planta abra el acceso.
