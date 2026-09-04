# Diagramas de la presentación a Jefatura

Cada diagrama está en **PNG** (para pegar en documentos) y en **SVG** (vectorial:
se puede abrir y editar en cualquier editor, o re-trazar en Bizagi / StarUML sin
perder calidad).

## BPMN 2.0 — notación Bizagi

| Archivo | Qué es |
|---|---|
| `bpmn_asis` | Proceso ACTUAL: atención de una falla sin sistema, con sus puntos de fuga |
| `bpmn_tobe` | Proceso PROPUESTO: el mismo recorrido con SGIT-CCTV y la calle del sistema |
| `bpmn_instalacion` | Ampliación de cobertura: expediente de instalación acoplado a las ventanas de parada |

## Capacidad de crecimiento

| Archivo | Qué es |
|---|---|
| `evolucion` | Las cuatro fases: consolidación del dato → analítica de confiabilidad → ampliación planificada → migración a analítica de vídeo |

## UML 2.5 — notación StarUML

| Archivo | Qué es |
|---|---|
| `uc_general` | Casos de uso GENERAL — los 8 actores y los 14 casos de uso principales |
| `uc_incidencias` | Casos de uso del módulo de Incidencias |
| `uc_om` | Casos de uso del módulo de Órdenes de Mantenimiento |
| `uc_activos` | Casos de uso de Activos y Criticidad A/B/C |
| `uc_preventivo` | Casos de uso de Preventivo y Hojas de Ruta |
| `uc_almacen` | Casos de uso de Almacén e Inventario |
| `uc_indicadores` | Casos de uso de Indicadores |
| `uc_seguridad` | Casos de uso de Seguridad, Roles y Auditoría |
| `cls_dominio` | Diagrama de CLASES — extracto del modelo de datos real |
| `seq_incidencia` | Diagrama de SECUENCIA — de la caída de una cámara al informe firmado |
| `act_ciclo` | Diagrama de ACTIVIDAD — ciclo completo con particiones por responsable |
| `sta_om` | Diagrama de ESTADOS — ciclo de vida de una Orden de Mantenimiento |

## De dónde salen las cifras

Todas están medidas sobre este repositorio el día de la entrega:

    42 módulos · 353 endpoints · 78 modelos · 52 migraciones · 52 pantallas
    44 permisos · 13 plantillas de rol · 797 pruebas · 30 verificadores
    ~73.000 líneas de código

Ninguna es una estimación.

## Resolución de las imágenes

Los PNG están renderizados a **3,4×** (entre 5.000 y 5.400 px de ancho). Admiten
ampliación en pantalla y proyección sin pérdida apreciable. Los SVG son
vectoriales: escalan sin límite y se pueden editar.
