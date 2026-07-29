# Estructura de dominio — Laminación

**SGIT-CCTV · Aceros Arequipa · Planta Pisco**
Alcance: **Laminación (Trenes 1, 2 y 3)**. No cubre Acería, ACEDIM ni servicios auxiliares.

Este documento congela el modelo de dominio antes de tocar la base de datos.
Es la referencia para las fases F8-C a F8-G.

---

## 1. Por qué se rediseña

El modelo actual tiene **dos jerarquías compitiendo**:

| Fuente | Cómo expresa el tren |
|---|---|
| `Location` (árbol) | `EMPRESA → PLANTA → TREN → RACK` |
| `Asset.train` | enum `PlantTrain` |

Nada impide que un activo esté bajo *Tren 2* en el árbol y diga `TREN_1` en su
campo `train`. Es duplicación de verdad — el mismo problema que se corrigió en
F5 con el estado derivado, pero en la dimensión de ubicación.

Además, entre «Tren 2» y «Gabinete R-01» **falta el nivel de proceso**, que es
justamente donde vive el valor de mantenimiento.

**Decisión: una sola jerarquía. `Asset.train` se elimina; el tren se deduce
subiendo el árbol de ubicaciones.**

---

## 2. Jerarquía objetivo (5 niveles)

```
PLANTA PISCO
└── LAMINACIÓN
    ├── TREN 1        perfiles: cuadradas, redondas, platinas, tees,
    │   │             helicoidales, ángulos
    │   └── ETAPA: Tren de desbaste              ← NIVEL NUEVO
    │       └── PUNTO: Púlpito / Poste / Gabinete R-01
    │           └── ACTIVO: CAM-T1-DES-03
    ├── TREN 2        exclusivo barras de construcción (corrugado)
    └── TREN 3        línea nueva — 300,000 t/año
```

`LocationType` incorpora `AREA` y `ETAPA`.

---

## 3. Catálogo de etapas — **tabla, no enum**

Razón técnica: **los tres trenes no comparten las mismas etapas.** El Tren 1
produce perfiles y el Tren 2 sólo corrugado; el Tren 3 es una línea distinta.
Con un `enum`, cada diferencia obliga a migración de base de datos y redespliegue.
Con una tabla, el Jefe de Mantenimiento lo edita desde la interfaz.

Secuencia real del proceso (palanquilla → producto terminado):

| # | Etapa | Qué vigila el CCTV | Ambiente | Criticidad |
|---|---|---|---|---|
| 1 | Patio de palanquilla | Grúa puente, carga de material | Intemperie salina | Media |
| 2 | Horno recalentador (1,100–1,200 °C) | Empujador, carga/descarga, llama | Calor radiante | Alta |
| 3 | Tren de desbaste (8 cajas) | **Atascos / lazos** | Calor, vapor, cascarilla | **Crítica** |
| 4 | Tren intermedio | Lazos, guías | Calor, vapor | **Crítica** |
| 5 | Tren continuo / acabado (10 casetas) | Velocidad, formación de lazo | Calor, vapor, vibración | **Crítica** |
| 6 | Lecho de enfriamiento | Alineación de barras, atascos | Calor residual, cascarilla | Alta |
| 7 | Cizalla / corte | Corte a medida | Cascarilla, vibración | Media |
| 8 | Empaquetado / atado | Atado, etiquetado | Polvo | Media |
| 9 | Almacén PT / despacho | Inventario, carga de camiones | Intemperie | Baja |
| 10 | Púlpito de control | *(ubicación de los PC con iVMS-4200)* | Climatizado | Alta |
| 11 | Sala eléctrica | Tableros, MCC | Climatizado, EMI alta | Alta |
| 12 | Taller de rodillos | Cambio de cajas | Polvo metálico | Baja |

> El orden (`sequence`) importa: permite dibujar el proceso de izquierda a
> derecha en el tablero y detectar tramos ciegos consecutivos.

---

## 4. Criticidad **derivada**, no elegida a dedo

Hoy el técnico marca «zona crítica: sí / no» sin criterio objetivo, y dos
personas distintas clasifican distinto el mismo punto.

**Regla:** la criticidad del activo se deriva de la etapa donde está instalado.

> Una cámara caída en el **tren de desbaste** deja al operador ciego ante un
> atasco a 1,100 °C. Una cámara caída en el **almacén** no detiene nada.
> Hoy el sistema las trata igual.

Se permite elevar la criticidad manualmente (queda auditado), pero nunca
bajarla por debajo de la que impone la etapa.

---

## 5. Intervalo preventivo **derivado del ambiente**

Reemplaza el binario 30/60 actual. Lo que degrada el equipo es el ambiente:

| Ambiente | Agresor real | Intervalo |
|---|---|---|
| `CALOR_RADIANTE` (horno) | Degradación de sellos y óptica | **30 días** |
| `VAPOR_AGUA` (trenes) | Condensación, corrosión interna | **30 días** |
| `POLVO_METALICO` (taller, cizalla) | Abrasión, obstrucción de óptica | **45 días** |
| `INTEMPERIE_SALINA` (patio, almacén) | Corrosión — Pisco es costa | **45 días** |
| `EMI_ALTA` (sala eléctrica) | Interferencia, ruido en señal | 60 días |
| `CLIMATIZADO` (púlpito) | Polvo normal | **90 días** |

Los valores son el **punto de partida**, editables por el Jefe de Mantenimiento.
La diferencia con hoy es que arrancan con fundamento técnico y no con una
casilla marcada a criterio de quien registró el activo.

---

## 6. Ventanas de parada — la pieza que falta

No se puede intervenir una cámara sobre el tren mientras lamina. El sistema
genera OM preventivas por fecha **sin saber cuándo pueden ejecutarse**.

| Ventana | Frecuencia | Duración | Uso CCTV |
|---|---|---|---|
| `CAMBIO_CANAL` | Varias por semana | 2–6 h | Intervenciones cortas cerca del tren |
| `PARADA_PROGRAMADA` | Mensual | 12–24 h | Preventivo pesado, cableado |
| `PARADA_MAYOR` | Anual | Días | Reemplazos, obra nueva |

El sistema debe poder responder:

> *«Próxima parada del Tren 2 — 14 OM pendientes, 8.5 h-h estimadas,
> 3 requieren manlift.»*

Eso es exactamente lo que se lleva a la reunión de planificación de mantenimiento.

---

## 7. Turnos

Laminación opera 24/7. Sin turno registrado no se puede medir carga de trabajo
ni trazar quién reportó qué en la madrugada. Se registra el turno en OM e
incidencias, derivado de la hora de creación (editable).

---

## 8. Qué permite medir esta estructura

| Indicador | Por qué importa |
|---|---|
| **Cobertura del proceso** — % de etapas críticas con cámara operativa | El KPI real del área: ¿hay tramos ciegos? |
| **Disponibilidad por etapa** | Un promedio por tren oculta que el desbaste lleva 3 días ciego |
| **MTBF / MTTR por etapa** | Dónde reincide la falla y cuánto cuesta recuperarla |
| **Backlog h-h por ventana** | Cuánto trabajo espera la próxima parada |
| **Cumplimiento del plan preventivo** | Ya existe; ahora segmentable por etapa |

---

## 9. Impacto en módulos existentes

| Módulo | Cambio |
|---|---|
| Dashboard por tren | Se subdivide por etapa; se ve dónde duele |
| Preventivo | Intervalo derivado del ambiente |
| Predictivo (curva P-F) | Gana sentido: el desgaste depende de la etapa |
| SSOMA / manlift | Se cruza con la ventana de parada |
| Accesibilidad | La etapa indica si requiere parada de línea |
| Jefe de Tren (rol futuro) | Su alcance queda definido por el árbol, no por un enum |

---

## 10. Orden de ejecución

| Fase | Contenido | Estado |
|---|---|---|
| F8-A | CI/CD — build y pruebas en cada push | ✅ |
| F8-B | Respaldo de base de datos verificado | ✅ |
| F8-C | Esquema: `ProcessStage`, `Environment`, `LocationType.ETAPA` | pendiente |
| F8-D | Migración con traducción automática de datos existentes | pendiente |
| F8-E | Criticidad e intervalo derivados | pendiente |
| F8-F | Ventanas de parada | pendiente |
| F8-G | Frontend por etapa + página de ventanas | pendiente |
| F8-H | Pruebas (incluye RBAC, deuda pendiente) y verificación | pendiente |

**F8-D no se aplica sin ejecutar antes `scripts/RESPALDO_BD.ps1` y confirmar
que el respaldo contiene tablas.**

---

## Fuentes del proceso

- Aceros Arequipa — Laminación: https://acerosarequipa.com/pe/es/categoria-ecosimbiosis/113/laminacion
- Aceros Arequipa — Procesos de producción: https://acerosarequipa.com/pe/es/procesos-de-produccion
- Portal de Inversionistas — nuevo tren laminador (Tren 3): https://investors.acerosarequipa.com/noticias-detalle/41/aceros-arequipa-aprueba-inversion-de-mas-de-75-millones-de-dolares-para-un-nuevo-tren-laminador
