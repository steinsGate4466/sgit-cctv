# Procesos de mantenimiento CCTV — modelo BPMN 2.0

**SGIT-CCTV · Aceros Arequipa, Planta Pisco · Laminación (Trenes 1, 2 y 3)**

Cinco procesos modelados en **BPMN 2.0**. Los archivos `.bpmn` de esta carpeta
se abren directamente en **Bizagi Modeler** (`Archivo > Abrir`), y también en
Camunda Modeler, Signavio o cualquier herramienta que lea el estándar OMG.
No es una imagen: es el modelo, y se puede editar.

Los `.png` son la misma vista, para pegar en una diapositiva o en un informe
sin abrir Bizagi.

---

## Por qué esto está en el repositorio y no en una carpeta suelta

El diagrama y el código se separan el día que alguien cambia uno de los dos.
Aquí el modelo vive junto al código que lo implementa, entra por el mismo
`git commit` y se revisa en el mismo *pull request*. Si mañana el flujo cambia,
el diagrama desactualizado sale en el diff.

Un detalle que importa para auditoría: **cada tarea del diagrama corresponde a
una pantalla o a un endpoint que existe**. No hay pasos dibujados que el
sistema no sepa hacer. La tabla de trazabilidad al final lo enumera.

---

## P1 — Atención de incidencia CCTV (correctivo)

`P1_Atencion_de_incidencia.bpmn` · 4 carriles

Desde que el pulpito ve una cámara sin señal hasta que la OM se cierra.

Tres decisiones del modelo que no son obvias:

- **El reporte lo hace Operación, no el técnico.** Quien ve la falla es quien
  la registra. Si el reporte pasa primero por una llamada telefónica, la hora
  de inicio se pierde y el MTTR queda mal medido desde el primer minuto.
- **Hay una salida en remoto.** Una parte real de las incidencias se resuelve
  reiniciando un servicio o corrigiendo una configuración. Obligar a generar
  una OM de campo para eso llena el sistema de ruido; anotar la causa, no.
- **El almacén está en el flujo, no al costado.** La espera de repuesto es
  parte del tiempo de reparación y aquí se ve. Es la razón más común de un
  MTTR alto, y esconderla hace que se culpe al técnico.

## P2 — Mantenimiento preventivo programado

`P2_Mantenimiento_preventivo.bpmn` · 4 carriles

La OM la genera **el sistema**, no una persona. El primer carril es "SGIT
(automático)" a propósito: un preventivo que depende de que alguien se acuerde
no es un preventivo.

El punto crítico es la **ventana de parada**. En Laminación no se interviene
un tren en marcha, así que el proceso se detiene explícitamente a esperar la
confirmación de Operación. Ese tiempo de espera no es incumplimiento del
mantenimiento y el modelo lo deja por escrito.

Si la rutina encuentra un defecto, **abre una correctiva y entra a P1**. Es la
principal fuente de trabajo correctivo planificado, que es el barato.

## P3 — Alta de equipo nuevo e instalación

`P3_Alta_de_equipo.bpmn` · 5 carriles

Aquí está la parte que interesa al área de TI: **la IP y la VLAN las reserva
TI en el IPAM antes de que el técnico suba a instalar**. No después. Es lo que
evita el duplicado de IP que tumba dos cámaras y cuesta media mañana
encontrarlo.

Y hay un control automático: antes de aprobar el alta, el sistema **revisa la
calidad de la ficha** y devuelve el equipo si le faltan bloqueantes (sin
ubicación, sin foto, código fuera de formato `AA-`, IP o código duplicados).
El lazo de corrección está dibujado porque ocurre, y esconderlo no lo evita.

## P4 — Gestión de repuestos

`P4_Gestion_de_repuestos.bpmn` · 3 carriles

Dos caminos según haya stock o no. El de compra pasa por aprobación del Jefe
de Mantenimiento y por una **espera de recepción** que puede durar semanas: es
un evento de espera explícito, no una flecha que finge que es inmediato.

El consumo se registra **contra la OM**, no contra el almacén en general. Sin
eso no hay costo por equipo y la conversación de "reparar o reemplazar" se
hace por intuición.

## P5 — Baja y purga de un registro (doble llave)

`P5_Baja_y_purga.bpmn` · 3 carriles

El diagrama que hay que enseñar cuando pregunten por control de datos.

**Baja y purga no son lo mismo y el modelo las separa desde el primer rombo:**

| | Baja | Purga |
|---|---|---|
| Qué pasa con el registro | se marca de baja | se borra |
| Historial | **se conserva** | se elimina en cascada |
| Quién puede | supervisor | **solo Jefe de Mantenimiento** |
| Confirmación | motivo | vista previa + segunda llave |
| Rastro | queda el registro | queda **la auditoría** |

Dos cosas deliberadas en la rama de purga:

1. **Vista previa antes de confirmar.** El sistema enseña exactamente qué se
   lleva por delante. Nadie borra a ciegas.
2. **La auditoría se escribe ANTES de borrar.** Si se escribiera después y el
   borrado fallara a medias, quedaría un borrado sin rastro. El orden no es
   detalle de implementación: es la diferencia entre poder reconstruir lo que
   pasó y no poder.

La purga existe porque el sistema **todavía no arrancó** y hay que poder dejar
los módulos vacíos para cargarlos bien. Cuando esté en producción, la política
de acceso se cierra sin tocar el proceso: se quita el permiso.

---

## Trazabilidad: del diagrama al software

| Proceso | Dónde se ejecuta en SGIT |
|---|---|
| P1 | Incidencias · Órdenes de trabajo · Repuestos · Indicadores (MTTR) |
| P2 | Planes preventivos · Paradas y ventanas · Órdenes · Indicadores (cumplimiento) |
| P3 | Instalaciones · IPAM · Equipos · Campañas (calidad de ficha) |
| P4 | Repuestos · Órdenes de trabajo |
| P5 | Limpieza (purga) · Auditoría |

## Qué no está modelado, y por qué

- **Compras aguas arriba de P4.** Vive en el ERP corporativo. Modelarlo aquí
  sería dibujar un proceso que este equipo no ejecuta ni controla.
- **Gestión de accesos y altas de usuario.** Es proceso de TI, no de
  mantenimiento. Corresponde que lo modele TI.
- **Escalamiento por SLA.** Falta acordar los tiempos con Operación. **No se
  inventa un número**: un SLA puesto a ojo se convierte en un indicador que
  mide algo que nadie acordó.
