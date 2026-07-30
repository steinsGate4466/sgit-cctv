# Revisión de módulos — SGIT-CCTV

**Alcance:** Laminación, Trenes 1, 2 y 3 · Planta Pisco, Aceros Arequipa
**Fecha:** julio 2026 · revisión hecha contra el código en `main`

Este documento no es una lista de deseos: cada punto está comprobado contra el
código, y donde dice "no existe" es porque se buscó y no está.

---

## 1. El problema de raíz: dos verdades sobre el tren

Hasta esta revisión, el sistema respondía de dos maneras distintas a la misma
pregunta —*¿a qué tren pertenece este activo?*—:

| Quién preguntaba | De dónde salía la respuesta |
|---|---|
| Avance del mapeo, criticidad efectiva, intervalos preventivos | Derivado del **árbol de ubicaciones** (`plant-context.ts`) |
| Tablero ejecutivo, gráfico por tren, Estado por Tren | Columna **`Asset.train`**, escrita a mano en el alta |

### Consecuencias reales

1. El mismo activo podía contar en el **Tren 2** en la pantalla de mapeo y en
   **`SIN_ASIGNAR`** en el tablero.
2. Aparecía un **cuarto tren** llamado `SIN_ASIGNAR` que en Laminación no
   existe. No es un tren: es trabajo pendiente de asignar en el árbol.
3. Cualquier indicador nuevo heredaba la contradicción.

### Decisión tomada

**El árbol es la única fuente de verdad.** Los trenes no están escritos en el
código: son las ubicaciones de tipo `TREN`. Si mañana existe un Tren 4, aparece
solo, sin tocar código ni desplegar.

La columna `Asset.train` **se conserva en la base de datos** —no se borra
nada— pero ya no se lee en ningún sitio. El único consumidor que queda es el
endpoint legado `GET /dashboard/train/:train`, marcado como tal en el código y
que la interfaz ya no usa.

---

## 2. Estado por módulo

### Dashboard ejecutivo
- **Tiene:** 13 indicadores globales y 4 paneles (estado, tipo, criticidad,
  causas raíz reales).
- **Le falta:** selector de tren. Cero presencia de gabinetes, ubicaciones,
  cableado, mapeo y accesibilidad. Ningún indicador es clicable: se ve
  "7 cámaras sin servicio" y no hay forma de saber cuáles.

### Estado por Tren
- **Tiene:** los tres trenes y 4 indicadores (cámaras, incidencias, OM
  abiertas, preventivos vencidos).
- **Le falta:** es un tablero de *mantenimiento*, no de *infraestructura*. Sin
  gabinetes, metros de cable, tramos fuera de norma, avance del mapeo del tren,
  canales de grabador libres ni accesos pendientes.

### Activos
- **Tiene:** tabla paginada en servidor, fichas por tipo, fotos en el alta,
  historial, informe descargable.
- **Le falta:** filtro por tren y por etapa. Hoy solo se filtra por tipo y
  estado.

### Gabinetes
- **Tiene:** alta, edición y foto.
- **Le falta:** todo indicador. No se sabe cuántos hay por tren, cuántos sin
  foto, cuántos sin QR pegado, ni cuántos guardan equipos con la ficha a medias.

### Ubicaciones
- **Tiene:** árbol completo y catálogo editable de etapas del proceso.
- **Le falta:** cuántos activos cuelgan de cada nodo. Una ubicación creada y
  nunca usada es ruido invisible; una etapa sin ningún activo es una etapa mal
  puesta o un mapeo sin empezar, y hoy no se distingue.

### Cableado
- **Tiene:** tramos entre dos puntos, metraje medido y estimado por separado,
  categoría, blindaje, ruta, y el aviso del límite de 90 m.
- **Le falta:** el resumen es **global, no por tren**. Y un tramo de 120 m
  —el hallazgo más caro que produce el sistema— **muere en una tabla**: no
  sugiere ni abre una orden de trabajo.

### Avance del mapeo
- **Tiene:** cálculo por ficha real, ordenado por criticidad efectiva, con
  detalle de qué campo falta en cada activo.
- **Le falta:** el agregado es global. El tren aparece fila por fila en los
  pendientes, pero no hay *"Tren 1: 62 % · Tren 2: 31 % · Tren 3: 0 %"*, que es
  lo que se mira para repartir cuadrillas.

### Accesibilidad (permisos de altura / manlift)
- **Tiene:** solicitud, revisión, fotos, informe PDF.
- **Le falta:** **no está cruzada con la orden de trabajo.** Se pide el manlift
  por un lado y se abre la OM por otro. Si el acceso no está aprobado, el
  técnico se entera arriba del tren.

### Órdenes de trabajo (correctivo, preventivo, predictivo, mejoras)
- **Tiene:** ciclo completo —recepción, apertura firmada, avance con motivo,
  cierre con causa, desviación contra lo estimado por Producción, materiales,
  herramientas, reemplazo de equipo—.
- **Le falta:** filtro por tren y por etapa. Y arrastran el campo `zone` como
  texto libre, que es exactamente lo que el árbol de ubicaciones vino a
  reemplazar.

### Inventario, Auditoría, Usuarios
Completos para su alcance. Sin observaciones de infraestructura.

---

## 3. Plan: Bloque 3-INFRA

### 3a — Backend: una sola verdad y un tablero de infraestructura *(hecho)*
- `infra-agregados.ts`: funciones **puras** que cuentan disponibilidad, tramos
  fuera de norma, canales libres y avance del mapeo. Probables sin base de
  datos; 22 casos de prueba.
- `infra.service.ts`: consulta y compone. Reutiliza el resolvedor del árbol
  pasando las **ubicaciones como si fueran activos**, para no tener una segunda
  implementación de "sube el árbol hasta el TREN" que pueda desviarse.
- `GET /dashboard/infra/trenes` — los trenes reales con su estado completo.
- `GET /dashboard/infra/tren/:idOrCode` — tablero de un tren, por etapas del
  proceso en orden de secuencia.
- `GET /dashboard/infra/sin-ubicar` — lo que antes era el cuarto tren, ahora
  como lista de trabajo con el motivo de cada fila.
- `overview()` del tablero ejecutivo deja de leer `Asset.train`.

### 3b — Frontend: el tablero y los filtros *(siguiente)*
- Estado por Tren reconstruido sobre `/dashboard/infra`.
- Aviso accionable de activos fuera del árbol.
- Indicadores clicables: cada número abre su lista ya filtrada.
- Filtro de tren y etapa, **con el mismo control y el mismo significado**, en
  Activos, Cableado, Órdenes, Incidencias, Mapeo y Gabinetes.

### 3c — Correlación con las órdenes
- Tramo fuera de norma → abrir OM desde el propio tramo.
- OM que requiere altura → avisa si el acceso no está aprobado.
- Gabinete y ubicación con enlace a sus órdenes y su historial.

---

## 4. Decisiones de cálculo que conviene conocer

| Regla | Por qué |
|---|---|
| `BAJA` y `STOCK` no entran en la disponibilidad | Contar equipos que ya nadie espera que funcionen hundiría el indicador |
| `MANTENIMIENTO` no cuenta como caída | Está intervenida, no perdida |
| El avance del mapeo de un tren sin empezar es **0**, no 100 | Un 100 por defecto mentiría diciendo que está terminado |
| El mapeo cuenta también el material en `STOCK` | Una cámara en almacén sin ficha también está sin mapear |
| 90 m exactos está **en** norma; 91 fuera | Es el límite de tramo horizontal Ethernet, no un margen |
| El fuera de norma **medido** se separa del estimado | Sobre un metraje a ojo no se puede justificar un recableado: primero hay que ir a medirlo |
| Un grabador sin canales declarados **no** inventa canales libres | Se reporta como dato faltante, no como capacidad cero |
| Más cámaras que canales se reporta como error de dato | Restarlo daría un negativo que esconde el problema tras un número aparentemente correcto |
| Un tramo `RETIRADO` no se cuenta | Ya no es planta |

---

## 5. Deuda técnica declarada

| Deuda | Estado |
|---|---|
| Clave de Postgres expuesta en un pegado | **Rotar en Railway → Postgres → Settings** |
| `CORS_ORIGIN` sin configurar en Railway | Pendiente |
| Sin pruebas de permisos (RBAC) | Pendiente — el modelo de roles no tiene una sola prueba |
| Paquete del frontend en 868 kB | Pendiente — carga por página |
| `GET /dashboard/train/:train` legado | Se retira cuando se confirme que nadie lo llama |
| Columna `Asset.train` | Conservada, ya no se lee |
| `importarCatalogo` recibe `userId` y no lo usa | La auditoría la hace el interceptor global; el parámetro muerto confunde |
| TypeScript 5.9.3 vs parser de ESLint `<5.6` | Aviso, no error |
| MinIO como servicio aparte | Decisión de despliegue, no deuda de código |
