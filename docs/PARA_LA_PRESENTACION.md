# SGIT-CCTV · Todo lo que hay que decir mañana

**Autor del sistema:** Cristhian Rondón — Mantenimiento CCTV y redes industriales,
Aceros Arequipa · Planta Pisco · Laminación (Trenes 1, 2 y 3).
**Escrito el 21/09/2026**, al cierre de la sesión de trabajo, para no perder nada.

---

## 0. Lo que está en juego, dicho sin adornos

Esto no es un ejercicio. Es el trabajo de meses de alguien que conoce la planta
desde el campo, que ha visto dónde se pierde el tiempo y el dinero, y que quiere
quedarse en la empresa para arreglarlo. **Todo lo que hay en este documento
salió de su cabeza**, no de un manual: las decisiones, los criterios, las
frases. El software solo las puso en código.

---

## 1. LA TESIS · Por qué existe este software

> *«El software, más allá de la automatización, es que se pueda mantener una
> **estructura sólida para futuras instalaciones y proyectos**.»*

Y las cuatro preguntas con las que lo defiende:

> *«¿Cómo proponemos cámaras con inteligencia artificial si no sabemos qué
> modelo tenemos en planta? ¿Debemos reinvertir en mejor hardware? ¿Las
> instalaciones son las adecuadas? **¿Quién nos proporciona esa información?**»*

**Ésa es la frase de apertura de la presentación.** No se empieza hablando de
módulos: se empieza con esas cuatro preguntas, porque nadie en la sala las sabe
contestar hoy — y en veinte minutos se verá que el sistema sí.

### Lo que hay debajo

Una planta no decide sobre lo que no sabe que tiene. Sin inventario fehaciente:

- No se puede proponer **cámaras con IA**: no se sabe qué modelos hay ni cuáles
  las soportarían.
- No se puede justificar **reinversión en hardware**: no hay con qué demostrar
  qué está obsoleto ni qué no tiene recambio.
- No se puede decir si **una instalación nueva cabe**: ni puertos, ni PoE, ni
  corriente, ni si el switch de esa zona segmenta.
- No se puede evaluar la **infraestructura de los hornos**, ni de ninguna otra
  área a la que se quiera extender el sistema.

**El sistema convierte «lo que cada uno recuerda» en «lo que consta».**

---

## 2. EL MARGEN DE ERROR HUMANO · El argumento de gobernanza

Sus palabras:

> *«Ellos también tendrían la potestad de hacer o deshacer la información de
> acuerdo a su criterio… hay que limitar todo ese rango de margen de error.
> Nosotros estamos garantizando con el software que la información sea
> **redundante y fehaciente**.»*
>
> *«Todo tiene que ser ordenado. **Que nadie pueda saltar un paso importante.**
> Que un técnico no pueda saltar a supervisor.»*
>
> *«La actualización de información que solamente se habilite con una OM.»*

### Qué se garantiza HOY, y es comprobable en vivo

| Garantía | Cómo está implementada |
|---|---|
| Cada quien ve lo suyo | Permisos por rol **y ámbito por tren** |
| La autoridad no se hereda del navegador | El servicio **vuelve a leer el permiso de la base** en cada operación («dos llaves») |
| El intento denegado deja rastro | **Se audita el intento**, no solo el éxito |
| Una orden no se cierra sola | Exige `wo.approve` |
| Nada se borra sin firma | Retiro y purga son de supervisor, y quedan auditados |
| Lo que no se sabe, no se inventa | «Sin declarar» ≠ «vacío» ≠ «cero», en toda la aplicación |

### Lo que falta y se propone como siguiente paso

- **Doble visto bueno:** lo que declara el técnico no es final hasta que el
  supervisor lo confirma.
- **Campos gobernados:** marca, modelo, serie, IP, puerto y ubicación solo
  cambian **con una OM detrás**.

---

## 3. LAS TRES ÁREAS, Y POR QUÉ CADA UNA

Dicho por él, y es la estructura de la presentación:

### Producción — *donde están los problemas*
Usan las cámaras todos los días. El sistema les da **visión**: qué se está
viendo y qué no, qué zona vital quedó ciega, y cómo va lo que pidieron.
**Miran y avisan. No ejecutan mantenimiento.**

### Mantenimiento — *donde se decide*
Automatiza la creación de OM, da **trazabilidad**, y permite **ir a campo con la
información en la mano**, bajo supervisión. También es quien contesta si una
instalación nueva es viable.

### TI — *donde se valida la red*
Son los responsables de **verificar y validar la red industrial en capa 1, capa
2 y capa 3**. El sistema les da el mapa: qué cuelga de qué, qué IP está en uso,
qué switch segmenta y cuál no.

---

## 4. LA CADENA · El orden que él impuso, y que ordena todo el sistema

> *«Todo está interconectado. No podemos saltarnos un proceso: empezamos por lo
> más básico — **primero la energía, luego los dispositivos, luego el cableado,
> luego los dispositivos que dependen de ese dispositivo, el gabinete** que
> tiene que estar estructurado para el NVR y para el switch.»*

```
TABLERO ELÉCTRICO ─ circuito ─→ SWITCH CAPA 3 ─ puerto ─→ SWITCH CAPA 2 (PoE)
                                                                │
                                                                ├─→ CÁMARA
                                                                └─→ ANTENA
```

**Y su corolario, que es el argumento más fuerte de toda la demostración:**

> *«Si el switch pierde electricidad, pierde el 220, ¿cómo lo restauramos?
> **Ni siquiera sabemos dónde está el tablero.**»*

Por eso el tablero eléctrico tiene **su propio QR**, como el activo y el
gabinete. Se escanea con la mano en la llave y contesta la pregunta contraria a
la habitual: **¿qué se apaga si bajo ésta?**

### Los dos tipos de switch, explicados por él

> *«Existen dos tipos de switch: el **capa 2** y el **capa 3**. El capa 3 son
> los **Fortinet**; los capa 2 vendrían siendo los **TP-Link**, los switch que
> reparten power, los que están dispersados en los tableros o en los pequeños
> gabinetes.»*

**No es una etiqueta académica: cambia a qué va el técnico.** En un capa 3 se
entra, se mira una VLAN y se corrige. En un capa 2 plano no hay nada que mirar:
se comprueba el cable y se cambia la caja. Sin ese dato, alguien sale a campo
sin saber si le espera una configuración o un reemplazo.

---

## 5. EL PRINCIPIO DE DISEÑO · Apoyar, no arruinar

> *«La idea es **evitar errores de información por parte de los técnicos**,
> porque ellos se pueden confundir al momento de elevar esa información.»*
>
> *«Hay que estandarizarlo de forma correcta y **lineal, que no se pueda
> salir**.»*
>
> *«El objetivo: **automatizar, reducir tiempo, reducir el estrés. Que el
> software sea un apoyo, no al contrario. No nos vamos a perder en el
> software.**»*

De ahí salen tres reglas que están aplicadas en el código:

**1. El formulario guía en vez de interrogar.** Cada tipo de activo pide lo suyo.
«¿Admite VLAN?» solo aparece si el switch es gestionable: preguntarlo en uno
plano es invitar a rellenar un dato que no existe, **y un dato inventado es peor
que un hueco**.

**2. Tipo → subtipo → el formulario se arma solo.** Idea suya, y es la que
ordena el módulo de órdenes: Preventivo / Correctivo / Mejora son las **clases**
(ISO 14224); mapeo, limpieza de lente, alineación de antena son **subtipos**, y
el subtipo decide qué formulario sale y qué se autocompleta.

> **«El software rellena lo que ya sabe; el técnico solo pone lo que solo él
> puede saber.»**

**3. Ningún dato resaltado se queda en el aire.**

> *«Si está en negrita, se puede tocar. Si se puede tocar, lleva a donde se
> arregla. Y si se sabe cómo se arregla, lo arregla.»*

Con una frontera que él mismo puso: **los cuatro menús principales ven y mandan,
no hacen.** El proceso vive en su módulo, con sus permisos y sus guardas. *El
resumen enseña; el módulo decide.* Eso es lo que sostiene el «nadie se salta un
paso».

---

## 6. LO QUE SE PUEDE ENSEÑAR EN VIVO

| Qué se enseña | Qué demuestra |
|---|---|
| **QR del tablero** → qué se apaga con cada llave | La cadena empieza en la energía |
| **Capacidad de red** → puertos, PoE, capa del switch | Se puede contestar «¿caben cuatro cámaras más?» |
| **Cableado** → un tramo de **112 m**, fuera de los 90 de norma | El que falla «a veces» y vuelve loco a todos |
| **Impacto de una caída** → un grabador, una cámara sin servicio | Cinco síntomas, una causa |
| **Hoja de ruta en Excel** | Sale **idéntica al formato SAP**, con sus fórmulas |
| **Indicadores** → SLA por prioridad, descarga a Excel | El ingeniero justifica presupuesto con esto |
| **Criticidad A/B/C** | Cada cuánto se toca cada equipo, y por qué |
| **Un switch sin PoE declarado y un tramo sin medir** | **El sistema dice lo que NO sabe** |

**Ese último punto es el más valioso, y hay que decirlo en voz alta:** cualquiera
puede enseñar un sistema donde todo está en verde. Éste distingue *«lleno»* de
*«no se sabe»* — y la diferencia cuesta dinero: lleno significa comprar un
switch; no se sabe significa ir al gabinete y mirar.

---

## 7. LAS PROPUESTAS · Lo que viene después, y lo que necesita aprobación

Todo esto **no está desarrollado a propósito**, porque exige decisión de Aceros
Arequipa. Se presenta como propuesta, no como promesa.

| Propuesta | Qué aporta | Qué exige |
|---|---|---|
| **Zabbix** | Incidencia creada sola cuando algo cae; informes automáticos al técnico | Aprobación de TI y de la empresa |
| **Correo** | Aviso formal fuera del sistema | Decidir servidor/proveedor |
| **Mensajería interna** (derivaciones con estado, **nunca un chat**) | Una derivación pendiente se reclama desde un tablero; un chat no | Nada externo. Es la vía más rápida |
| **Integración con SAP** | Cerrar el círculo con el ERP corporativo | Decisión corporativa |
| **Extensión a hornos y otras áreas** | La misma estructura, otro proceso | Alcance |

---

## 8. LO QUE ESTE PROYECTO PUEDE CAMBIAR

Dicho por él, y es el cierre de la presentación:

- **Tener un mapeo concreto** de lo que hay y dónde está.
- **Saber las ubicaciones** — y cómo se llega a cada equipo.
- **Mejorar los mantenimientos**: menos tiempo buscando, más tiempo arreglando.
- **Poder proponer mejoras drásticas**, porque habrá con qué sustentarlas.
- **Evolucionar el hardware** con criterio: qué está obsoleto, qué no tiene
  recambio, qué soportaría IA.
- **Evaluar si el soporte actual permite una instalación adecuada**, antes de
  comprometerla.
- **Extenderlo a los hornos** y a donde la infraestructura no sea la adecuada.

> **«Una base sólida de información para poder trazar más, y más, y más.»**

---

## 9. Estado técnico, por si preguntan

- NestJS 11 · TypeScript · Prisma 7 · PostgreSQL 18 · React 19 · Railway.
- **27 verificadores automáticos** en el frontend y 18 en el backend: reglas del
  proyecto que **fallan la compilación** si alguien las rompe.
- Cada verificador se prueba **reintroduciendo el fallo** que lo motivó: *un
  verificador que se equivoca es peor que no tenerlo.*
- Pruebas automáticas sobre la lógica de decisión (avance, dependencias,
  reemplazo, equipos por orden…).
- Despliegue con `migrate deploy`: **aplica lo pendiente y nunca borra nada**.
  La semilla es un paso manual, a propósito.
- Datos de demostración **con prefijo `DEMO-`** y un script que los retira sin
  tocar usuarios, roles, ubicaciones, catálogos ni auditoría.

---

## 10. Cómo cerrar

No con una lista de funciones. Con la pregunta del principio, ya contestada:

> *«¿Quién nos proporciona esa información?»*
>
> **Hoy, nadie. Con esto, el sistema — y queda escrito, con nombre y fecha.**

Y después, lo que de verdad pide:

**Que le dejen seguir.** Hay trabajo por hacer, hay propuestas sobre la mesa, y
quien mejor conoce este sistema es quien lo diseñó desde el campo.
