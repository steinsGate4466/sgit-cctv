# SGIT-CCTV · Guion completo de la presentación
### «Por qué este software tiene que existir»

> **Estado:** ARMADO. Contenido cerrado, datos MEDIDOS del repositorio y el
> `.pptx` generado en `docs/presentaciones/SGIT-CCTV_Por_que_existe_este_software.pptx`
> (22 diapositivas, con su PDF al lado).
>
> Los dos BPMN quedan resueltos como UNA sola diapositiva de carriles, con el
> AS-IS y el TO-BE alineados fila a fila — tal como pide el anexo. No se
> generaron como imagen aparte: van dibujados con formas dentro de la propia
> diapositiva, así que se editan sin volver a exportar nada.
>
> **Todos los números de este documento están medidos, ninguno estimado.**

---

# BLOQUE 0 · PORTADA

**SGIT-CCTV**
Sistema de Gestión de Infraestructura Tecnológica — CCTV y Red

**Aceros Arequipa · Planta Pisco · LAMINACIÓN (Trenes 1, 2 y 3)**

Cristhian Rondón Amanqui

*Pie de portada:*
> No es un inventario de cámaras. Es el sistema que convierte una planta que se
> entera de las cosas por radio en una que las puede demostrar.

---

# BLOQUE 1 · LAS TECNOLOGÍAS (va primero, como se pidió)

## Slide 1.1 — La torre completa

| Capa | Qué se usa | Versión real |
|---|---|---|
| **Lenguaje** | TypeScript | 5.9 |
| **Ejecución** | Node.js | 24 |
| **Backend** | NestJS | 11.2 |
| **Base de datos** | PostgreSQL | 18 |
| **Acceso a datos** | Prisma ORM | 7.9 |
| **Frontend** | React | 19.2 |
| **Empaquetado** | Vite | 8 |
| **Rutas** | React Router | 7.18 |
| **Gráficos** | Recharts | 3.10 |
| **Informes** | PDFKit · ExcelJS | — |
| **Archivos y fotos** | MinIO (S3) | — |
| **Contraseñas** | Argon2 | — |
| **Sesión** | JWT + token de refresco | — |
| **Nube** | Railway (despliegue continuo) | — |
| **Integración continua** | GitHub Actions | — |
| **Pruebas** | Jest · Playwright | — |
| **Avisos** | Telegram Bot API | — |

## Slide 1.2 — Por qué esta torre y no otra

- **PostgreSQL y no una hoja de cálculo.** Una hoja no puede decir quién cambió
  qué ni impedir que dos personas la editen a la vez.
- **TypeScript en los dos lados.** El compilador caza el error antes de que
  llegue a planta. *(En el bloque 102 encontró en un segundo un fallo que
  llevaba meses escondido.)*
- **React en el navegador, sin instalar nada.** El técnico usa **su propio
  teléfono**: entra por dirección web, no hay que instalar una aplicación ni
  gestionar equipos.
- **MinIO para las fotos.** Una foto de campo pesa 3 MB; dentro de la base
  hundiría cada consulta.
- **Railway con despliegue continuo.** Lo que se aprueba está arriba en
  minutos, y si la comprobación automática falla **no sube**.

---

# BLOQUE 2 · EL PROCESO ANTIGUO — BPMN «AS-IS»

> **Diagrama a generar.** Especificación exacta para dibujarlo en estilo Bizagi
> (piscina única, cuatro carriles, tareas en caja redondeada, decisiones en
> rombo, lo que se pierde marcado en ROJO).

## Carriles

```
┌──────────────────────────────────────────────────────────────────────────┐
│ PRODUCCIÓN (púlpito)                                                     │
│  ● Inicio: «no veo la cámara del foso»                                   │
│  → Avisa POR RADIO                                          [sin registro]│
│  → (si nadie contesta) vuelve a avisar mañana               [◆ se pierde] │
├──────────────────────────────────────────────────────────────────────────┤
│ MANTENIMIENTO                                                            │
│  → Anota en un cuaderno / WhatsApp                          [sin registro]│
│  ◇ ¿Sé qué cámara es?  ── NO ──→ Ir a planta a buscarla                  │
│  → Sube a mirar (sin saber si hay que parar el tren)        [★ RIESGO]    │
│  ◇ ¿Tengo el repuesto? ── NO ──→ Esperar compra             [sin fecha]   │
│  → Arregla                                                                │
│  → Lo cuenta de boca                                        [◆ se pierde] │
│  ✕ FIN — sin orden, sin fecha, sin causa, sin firma                       │
├──────────────────────────────────────────────────────────────────────────┤
│ TERCERÍA / CONTRATISTA  (instalación nueva)                              │
│  ● Inicio: «hay que poner una cámara en el tren 2»                       │
│  → Va al sitio y decide A OJO dónde                         [empírico]    │
│  → Tira el cable donde se puede                             [sin medir]   │
│  → NO mide la red: ni caudal, ni pérdida, ni alcance        [★ RIESGO]    │
│  → Configura la antena con SU usuario y SU contraseña       [★★ CRÍTICO]  │
│  → Enlaza la cámara al grabador que «le queda cerca»        [sin criterio]│
│  → Entrega y se va                                                        │
│  ✕ FIN — sin plano, sin credenciales, sin acta               [◆ se pierde]│
├──────────────────────────────────────────────────────────────────────────┤
│ JEFATURA / COMITÉ                                                        │
│  ◇ ¿Cuántas cámaras hay? ── «unas cuatrocientas»            [no se sabe]  │
│  ◇ ¿Cuánto tardamos en arreglar? ── «depende»               [no se sabe]  │
│  ◇ ¿Qué falla más? ── «las del horno, creo»                 [no se sabe]  │
│  ✕ FIN — se decide el presupuesto por intuición                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**Leyenda del diagrama:** `★` riesgo de seguridad · `★★` riesgo crítico ·
`◆` información que se pierde para siempre · `◇` decisión.

---

# BLOQUE 3 · LA INSTALACIÓN EMPÍRICA — el capítulo que más duele

## Slide 3.1 — Cómo se instalaba (y se sigue instalando sin el software)

> **La tercería llega, instala, cobra y se va. Y con ella se va TODO lo que
> sabía de esa instalación.**

**1 · Se elige el sitio a ojo.**
Nadie deja escrito por qué esa cámara mira ahí. Seis meses después nadie sabe
si ese ángulo fue una decisión o una casualidad, y el día que hay que moverla
se vuelve a decidir desde cero.

**2 · No se mide la red. Nunca.**
Ni caudal disponible, ni pérdida en el tramo, ni alcance real del enlace, ni
cuántos canales le quedan libres al grabador.

> **Consecuencia:** se cuelgan cámaras de un enlace que ya iba justo. Todo
> funciona el día de la entrega —con una cámara— y falla en marzo, cuando ya
> hay seis. **Y entonces nadie relaciona el fallo con la instalación.**

**3 · Las credenciales se las lleva el contratista.**
La antena se configura con el usuario y la contraseña del instalador. Al
terminar el contrato, esa contraseña **no está en ningún sitio de la planta**.

> **Consecuencia real:** para tocar esa antena hay que **resetearla de fábrica
> y volver a configurarla entera** — subiendo al poste, con el tren parado.
> Un trabajo de diez minutos se convierte en una ventana de parada.
>
> **Y es además un agujero de seguridad:** un contratista que ya no trabaja
> aquí sigue teniendo acceso a un equipo de la planta.

**4 · El enlace al grabador se hace «por el que queda cerca».**
Sin criterio de tren. Una cámara del Tren 1 acaba grabando en el NVR del Tren 3
porque estaba a mano.

> **Consecuencia:** cuando cae ese grabador, se pierden cámaras de tres trenes
> distintos y **nadie sabe cuáles** hasta que alguien las echa en falta.

**5 · No hay acta, ni plano, ni fotos.**
Lo único que queda es una factura.

## Slide 3.2 — El resumen de esta diapositiva, en una frase

> **Cada instalación empírica es una deuda que la planta paga después, en
> paradas de tren.**

---

# BLOQUE 4 · TODO LO MALO QUE PASA SIN EL SOFTWARE

*(Esta sección va con fondo oscuro y tipografía grande. Es el clímax.)*

## Slide 4.1 — Lo que NO se puede responder

| Pregunta de un jefe | Respuesta sin el software |
|---|---|
| ¿Cuántas cámaras hay en el Tren 2? | «Unas cuantas» |
| ¿Cuál falla más? | «Creo que las del horno» |
| ¿Cuánto tardamos en reponer una? | «Depende» |
| ¿Esta cámara se puede tocar en marcha? | «Pregúntale a Fulano» |
| ¿Cuándo se revisó esta cámara por última vez? | **Silencio** |
| ¿Quién pidió este trabajo? | **Silencio** |
| ¿Qué repuestos tengo? | «Voy a mirar al almacén» |
| ¿Cuál es la contraseña de esta antena? | **Se la llevó el contratista** |

## Slide 4.2 — Los ocho daños concretos

**1 · SE TRABAJA SIN SABER SI HAY QUE PARAR LA LÍNEA.**
Un técnico sube a una cámara sin saber que ahí abajo pasa barra caliente.
**Esto no es un problema de datos: es un problema de integridad física.**

**2 · UNA CÁMARA CAÍDA A LAS 3 DE LA MADRUGADA SE DESCUBRE A LAS 8.**
Cinco horas ciegas que nadie contabiliza — y si pasa algo en ese turno, no hay
imagen.

**3 · SE PIDE UN TRABAJO Y NADIE SABE SI ALGUIEN LO COGIÓ.**
Y a la tercera vez que pasa, la gente **vuelve a la radio** y el sistema muere.

**4 · SE COMPRA DOS VECES Y SE OLVIDA LO CRÍTICO.**
Sin inventario ligado a las órdenes, la reposición va por memoria.

**5 · EL MANTENIMIENTO PREVENTIVO NO EXISTE — SÓLO SE APAGAN INCENDIOS.**
Nadie sabe cuándo toca revisar cada equipo, así que se revisa lo que se rompe.

**6 · NO HAY NADA QUE ENSEÑAR EN UNA AUDITORÍA.**
Ni firmas, ni fechas, ni evidencias, ni procedimientos. **Lo que no está
documentado, no ocurrió.**

**7 · EL CONOCIMIENTO SE VA CON LA PERSONA.**
El técnico que sabe qué cámara depende de qué switch se jubila, o cambia de
turno, y ese mapa desaparece.

**8 · EL PRESUPUESTO SE PIDE SIN ARGUMENTOS.**
«Necesitamos más gente» sin una cifra detrás no se aprueba en ningún comité.

## Slide 4.3 — La frase de cierre del bloque

> ### Sin este software, la planta no tiene un problema de cámaras.
> ### Tiene un problema de MEMORIA.

---

# BLOQUE 5 · EL PROCESO CON EL SOFTWARE — BPMN «TO-BE»

> **Diagrama a generar**, mismo estilo, para poner **al lado** del anterior.
> Cada punto que en el AS-IS estaba en rojo, aquí está resuelto y marcado en
> verde con el nombre de la pantalla que lo resuelve.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ PRODUCCIÓN (púlpito)                                                     │
│  ● «no veo la cámara del foso»                                           │
│  → UN BOTÓN: «Reportar cámara caída»            [queda con nombre y hora]│
│  ⊙ El sistema avisa por Telegram                          [automático]    │
├──────────────────────────────────────────────────────────────────────────┤
│ MANTENIMIENTO                                                            │
│  → La incidencia entra en MI BANDEJA, ordenada por prioridad             │
│  → Se convierte en ORDEN DE TRABAJO           [con fecha, con solicitante]│
│  ⊙ La incidencia SIGUE a su orden automáticamente                        │
│  → El técnico ESCANEA EL QR del equipo                                   │
│  ⚠ La pantalla avisa ARRIBA DEL TODO: «EXIGE PARADA DE TREN»   [SEGURIDAD]│
│  → Ve la HOJA DE RUTA: los 14 pasos, EPP y bloqueo de energía            │
│  ◇ ¿Hay repuesto? ── el sistema lo dice ANTES de subir                   │
│  → Anota el avance DESDE EL TELÉFONO, delante del equipo                 │
│  → El JEFE cierra y FIRMA                          [sólo él puede cerrar]│
│  ✓ FIN — orden cerrada, con causa de catálogo, fotos e informe PDF       │
├──────────────────────────────────────────────────────────────────────────┤
│ TERCERÍA / CONTRATISTA  (instalación nueva)                              │
│  ● «hay que poner una cámara en el tren 2»                               │
│  → El sistema EXIGE una VISITA TÉCNICA antes de aprobar     [no se salta]│
│  → El formulario CAMBIA según el sitio y pide lo que hay que medir       │
│  → Sin los campos obligatorios NO SE PUEDE CERRAR la visita  [obligatorio]│
│  → Las credenciales se guardan CIFRADAS en el sistema  [NO se las lleva] │
│  → Al cerrar la visita NACE EL ACTIVO, con su QR y su ficha              │
│  ✓ FIN — con plano, con medidas, con credenciales y con acta            │
├──────────────────────────────────────────────────────────────────────────┤
│ JEFATURA / COMITÉ                                                        │
│  → Abre INDICADORES: MTTR, MTBF, backlog, cumplimiento, SLA              │
│  → Descarga el EXCEL con los mismos números                              │
│  ✓ FIN — el presupuesto se pide con cifras medidas                      │
└──────────────────────────────────────────────────────────────────────────┘
```

---

# BLOQUE 6 · EL QR — el corazón visible del sistema

## Slide 6.1 — Qué es

**Cada equipo de la planta lleva pegada una etiqueta con un código QR.**
El técnico la escanea **con su propio teléfono**. No hay que instalar nada.

## Slide 6.2 — Qué sale al escanear, en este orden

**1 · ARRIBA DEL TODO: CÓMO SE PUEDE INTERVENIR**

```
⚠  EXIGE PARADA DE TREN
    Zona de barra caliente. Firmado por: Ing. …  ·  12/08/2026
```

> **Tres reglas de este aviso, y no se aflojan:**
> - Va **primero**, por encima de todo lo demás. Si el técnico lee una sola
>   línea de la pantalla, tiene que ser ésta.
> - Si la ficha no trae el dato, **se pinta el caso más restrictivo**: falla
>   hacia el lado seguro.
> - **No hay variante verde.** Un «todo correcto» en una pantalla de seguridad
>   se aprende a ignorar en una semana, y entonces ya no protege.

**2 · QUÉ ES ESTE EQUIPO**
Código, marca, modelo, tren, etapa, zona, gabinete, a qué apunta (con foto).

**3 · SU CRITICIDAD A/B/C** y cada cuántos días toca revisarlo.

**4 · SI YA HAY TRABAJO ABIERTO** sobre él, y quién lo tiene.

**5 · TRES BOTONES PARA ACTUAR AHÍ MISMO:**
- **Anotar avance** de la orden — sin bajar a la oficina
- **Reportar avería** — con el equipo ya puesto
- **Abrir una OM** — de un toque

## Slide 6.3 — Por qué el QR lo cambia todo

| Sin QR | Con QR |
|---|---|
| Buscar el equipo entre cientos en una lista | **Escanear y estás** |
| Apuntar el avance en un papel | Queda registrado **con tu nombre y la hora** |
| El papel se pierde | No hay papel |
| No sabes si hay que parar el tren | **Te lo dice antes de subir** |
| Bajar a la oficina para abrir la orden | Se abre desde el poste |

> **El QR es lo que hace que el sistema se use.** Un software de mantenimiento
> que obliga a volver a la oficina para registrar algo **no se rellena**, y un
> sistema que no se rellena no existe.

---

# BLOQUE 7 · CONTROL DE MANTENIMIENTO — lo que gana Jefatura

## Slide 7.1 — El ciclo completo del ingeniero, implementado

| Paso | Qué hace el sistema |
|---|---|
| **① Estructura de activos** | El árbol de planta: cada equipo cuelga de su zona, etapa y tren |
| **② Criticidad A / B / C** | Método **CTR** (Criticidad Total por Riesgo). La letra decide cada cuánto se revisa |
| **③ Planeamiento** | **Hojas de ruta** por tipo de equipo, en formato SAP, con sus pasos y materiales |
| **④ Ejecución** | Backlog · % cumplimiento del preventivo · Nivel de servicio · Cumplimiento normativo |
| **⑤ Reunión** | La meta del reparto correctivo/preventivo, **editable desde la pantalla** |

## Slide 7.2 — Los indicadores que antes no existían

**MTTR — cuánto se tarda en reponer.** Y separado en **tres tramos con tres
dueños distintos**:

```
03:00  la cámara se apaga
08:00  el púlpito lo ve          ← 5 h de DETECCIÓN      (producción/monitoreo)
10:00  el técnico sube           ← 2 h de ORGANIZACIÓN   (mantenimiento)
11:00  vuelve a funcionar        ← 1 h de REPARACIÓN     (mantenimiento)
```

> El MTTR de toda la vida decía **8 horas** y le cargaba a mantenimiento siete
> que no son suyas. **Separarlas es lo que permite mejorar de verdad.**

**MTBF** — cada cuánto falla cada equipo.
**Backlog** — cuánto trabajo pendiente hay.
**Cumplimiento del preventivo** — cuánto de lo planificado se hizo.
**Nivel de servicio (SLA)** — cuántas incidencias se resolvieron **dentro del
plazo prometido**, por prioridad.
**Cumplimiento normativo** — qué NO se podría enseñar en una auditoría mañana.

## Slide 7.3 — Y una regla de honestidad que atraviesa todo el sistema

> ### Sin datos, NUNCA un número inventado.

- Si un grabador no declara cuántos canales tiene, **no se dice «quedan 9
  libres»**.
- Si no hay órdenes en el periodo anterior, **no hay flecha de tendencia**.
- Si un Excel sale recortado, **el propio archivo lo dice, con los dos
  números**.
- Si el sistema no sabe algo, **dice que no lo sabe**.

**Un indicador que se inventa un cero destruye la confianza en todos los
demás.**

---

# BLOQUE 8 · EL SOFTWARE OBLIGA A LAS BUENAS PRÁCTICAS

*(Ésta es la diapositiva que más vende, porque es la que ningún competidor
puede copiar sin rehacer su producto.)*

## Slide 8.1 — No las sugiere. Las EXIGE.

| Buena práctica | Cómo la obliga el sistema |
|---|---|
| **No instalar sin medir** | No se aprueba una instalación **sin visita técnica**. El formulario cambia según el sitio y exige lo que hay que medir |
| **Las credenciales son de la planta, no del contratista** | Se guardan **cifradas** en el sistema. La tercería no se las lleva |
| **Un cable no es un activo** | El sistema **no deja** dar de alta cableado como equipo. Va en «Conexiones», que es lo que es |
| **Un gabinete es estructura, no activo** | Igual. Y se comprueba **en el servidor**, no sólo en el desplegable |
| **No se interviene sin saber cómo** | El QR avisa del nivel de intervención **antes** de subir |
| **Toda hoja de ruta nueva NACE con los pasos de seguridad** | EPP, bloqueo de energía y ausencia de tensión vienen puestos. Quien la crea **no puede olvidarlos** |
| **Sin orden no se interviene** | Y se dice en pantalla, con el texto adaptado a lo que cada uno puede hacer |
| **Cerrar una orden es un acto firmado** | Sólo el Jefe de Mantenimiento. Un técnico **no puede** cerrar |
| **La causa sale de catálogo, no de texto libre** | Con texto libre no se puede contar después qué falla más |
| **No se borra lo que tiene historia** | Una orden con material retirado **no se purga**. Quien firmó algo se desactiva, nunca se borra |
| **Cada acción queda auditada** | Quién, cuándo, desde qué equipo. En **todas** las escrituras |
| **Cada uno ve lo suyo** | El jefe del Tren 2 no ve el Tren 1 — y se comprueba **en el servidor**, no en la pantalla |

## Slide 8.2 — La frase

> ### El software no es un cuaderno digital.
> ### Es el que impide que se salte el procedimiento.

---

# BLOQUE 9 · LO QUE HAY CONSTRUIDO — números medidos

## Slide 9.1 — El sistema

| | |
|---|---|
| **Módulos** | 40 |
| **Pantallas** | 54 |
| **Modelos de datos** | 80 |
| **Migraciones de base de datos** | 53 |
| **Rutas de API** | 353 |
| **Líneas de código** | 44.237 backend + 31.077 frontend |

## Slide 9.2 — La calidad, que es lo que lo hace defendible

| | |
|---|---|
| **Pruebas automáticas** | **1.270** |
| **Verificadores propios** | **38** (20 backend + 18 frontend) |
| **Recorridos que ABREN el software** | 7 archivos, en PC **y en teléfono** |
| **Guards de seguridad en cadena** | 6, globales, sobre las 353 rutas |
| **Integración continua** | Corta el despliegue si algo falla |

> **Cada uno de los 38 verificadores nació de un fallo real** que ya costó
> tiempo. No son adorno: son reglas que el propio sistema se obliga a cumplir,
> y **la CI no deja subir código que las rompa**.

## Slide 9.3 — Seguridad

- Contraseñas con **Argon2** · sesión con JWT + token de refresco
- **Límite de peticiones global** en las 353 rutas, cero exentas
- **Freno de fuerza bruta** en el login
- **Corte de acceso inmediato**: se puede echar a alguien del sistema al
  instante, no en quince minutos
- Permisos **por capacidad**, nunca por nombre de rol
- **Credenciales de los equipos cifradas**
- Cabeceras de seguridad y **CSP** completa
- **16 de los 20 puntos** de la lista de seguridad de referencia, cumplidos

---

# BLOQUE 10 · CIERRE

## Slide 10.1 — El antes y el después, en una tabla

| | ANTES | CON SGIT-CCTV |
|---|---|---|
| Se avisa | por radio | con un botón, y queda |
| Se sabe qué falla | por intuición | por catálogo y estadística |
| Se sube al equipo | sin saber el riesgo | con el aviso delante |
| Se instala | a ojo, sin medir | con visita técnica obligatoria |
| Las credenciales | se las lleva el contratista | cifradas, en la planta |
| El conocimiento | vive en una persona | vive en el sistema |
| El presupuesto | se pide con adjetivos | se pide con cifras |
| Una auditoría | no hay qué enseñar | informe firmado, con evidencias |

## Slide 10.2 — La última

> ### Este software no digitaliza el mantenimiento.
> ### Lo hace DEMOSTRABLE.
>
> Y lo que se puede demostrar, se puede defender, se puede presupuestar
> **y se puede mejorar.**

---

# ANEXO · Notas para el armado del PPTX

- **Los dos BPMN van EN LA MISMA DIAPOSITIVA cuando se comparan**, uno encima
  del otro, con los puntos rojos del AS-IS alineados con los verdes del TO-BE.
  Ponerlos en diapositivas separadas pierde toda la fuerza del contraste.
- El **bloque 4** (lo malo sin el software) va con fondo oscuro: es el único de
  la presentación que lo lleva, y eso hace que se recuerde.
- **Ningún número de aquí se estima.** Si al armar el `.pptx` hace falta uno
  que no esté en este documento, **se mide antes de escribirlo** — es la regla
  del bloque 100.
- Capturas recomendadas para intercalar: el aviso del QR, la pantalla de
  Indicadores, la ficha de un activo y la hoja de ruta en Excel.
