# SGIT-CCTV — Módulos, roles y procesos que ataca

**Aceros Arequipa · Planta Pisco · Laminación (Trenes 1, 2 y 3)**
16 de agosto de 2026 · 41 módulos · 320 endpoints · 39 permisos · 7 roles

---

## 1. La lógica de por qué hay 41 módulos y no uno

Cada módulo existe porque **ataca un punto donde hoy se pierde información o
tiempo en la planta**. Ninguno se creó por simetría con otro ERP.

La prueba que se le aplicó a cada uno: *si este módulo no existiera, ¿qué
seguiría pasando mal, y quién lo pagaría?* Si la respuesta era «nada» o «nadie»,
no se construyó.

---

## 2. Los módulos por el proceso que atacan

### GRUPO A · El ciclo de una falla — el corazón del sistema

| Módulo | Proceso que ataca | Qué pasaba antes |
|---|---|---|
| **Incidencias** | Registrar que algo se cayó | Se avisaba por radio. Sin hora, sin quién, sin rastro |
| **Órdenes (OM)** | El trabajo de arreglarlo | Un cuaderno. Nadie sabía si se hizo, quién, ni cuánto tardó |
| **Panel del jefe de tren** | «¿Qué pasa con esa cámara?» | La respuesta era «ya están viendo» |
| **Procedimientos** | Cómo se restaura cada modelo | El que ya lo arregló tres veces sabe el atajo. El nuevo lo redescubre |
| **Checklist / rutinas** | Qué revisar en cada tipo de equipo | De memoria, y cada técnico revisaba cosas distintas |

**Por qué las órdenes son el módulo más grande (2 351 líneas, 29 endpoints):**
la OM es donde se cruzan todos los demás. Lleva apertura y cierre **firmados
con contraseña**, materiales retirados del almacén, fotos, avance con motivo,
permisos de altura y el informe en PDF. No es un formulario: es el expediente
de lo que pasó.

---

### GRUPO B · Saber qué hay y dónde — la base de todo lo demás

| Módulo | Proceso que ataca | Por qué es imprescindible |
|---|---|---|
| **Activos** | Inventario técnico | Sin saber qué cámaras hay, nada más tiene sentido |
| **Ubicaciones** | El árbol de planta | **De aquí se derivan tren, etapa, ambiente y criticidad.** Es la columna vertebral |
| **Gabinetes** | Dónde está cada equipo físicamente | Para encontrar el rack sin preguntar |
| **Campañas de mapeo** | Levantar la planta por zonas | El levantamiento se hacía «cuando se podía» y nunca terminaba |
| **Grúas** | Cámaras de grúa, que se inspeccionan distinto | Se mueven, y su revisión no encaja en el preventivo normal |

**Ubicaciones es el módulo del que cuelga todo.** Mover una rama del árbol
cambia el tren, la etapa y la criticidad de todo lo que hay debajo — sin tocar
un solo activo. Ése es el diseño.

---

### GRUPO C · La red y la infraestructura — lo que TI necesita

| Módulo | Proceso que ataca |
|---|---|
| **Red / conexiones** | Qué puerto de switch usa cada cámara, y qué se cae si falla uno |
| **Grabadores** | Canales ocupados y libres. Cuántas cámaras más caben |
| **Cableado** | Tramos con metros. **Avisa de los que pasan de 90 m**, que es el límite de la norma |
| **IPAM** | Direcciones IP: libres, ocupadas y duplicadas |
| **Electricidad** | Tableros y circuitos. **Qué cámaras se caen si salta un breaker** |
| **Monitoreo** | Qué responde y qué no, medido — no lo que dice la ficha |
| **Rotulado** | El estándar ANSI/TIA-606-C: cómo se llama cada cosa y de qué color va el cable |
| **Equipos conocidos** | Qué PC puede entrar al sistema |

**Electricidad y Red atacan el mismo problema desde dos lados:** cuando algo se
cae, saber *qué más se cayó con ello*. Un switch tumba diez cámaras; un breaker
puede tumbar treinta. Sin esto, se descubre cámara por cámara.

**Cableado con el límite de 90 m** no es un capricho: es la longitud máxima del
cableado horizontal en la norma. Pasarse produce fallos intermitentes que se
diagnostican como «la cámara está mala» durante meses.

---

### GRUPO D · Lo que Producción necesita — el puente entre áreas

| Módulo | Proceso que ataca |
|---|---|
| **Zonas vitales** | **Producción declara qué se pierde si una zona se queda a ciegas** |
| **Mi cobertura** | Qué se está dejando de ver, ordenado por lo que duele |
| **Mis cámaras** | Qué falla, quién la ataca, cómo va y qué material falta |
| **Activos por tren** | **Qué hay en el tren y cuánto exige manlift — el gasto que Producción aprueba** |
| **Paradas** | En qué ventanas se puede intervenir con la línea detenida |

**Activos por tren es el segundo sitio donde Producción decide algo con
dinero.** Agrupa los equipos por dónde están montados —gabinete, tablero
eléctrico o campo— porque son los tres sitios donde cambia la forma de llegar,
y agrupa las subidas de manlift por punto: tres equipos pendientes en el mismo
poste son una movilización, no tres.

No muestra soles: cuenta equipos y subidas. Y lo que nadie ha declarado sale en
gris y **no suma** al total, aunque la zona esté marcada de altura. Un número
bajo se aprueba, y el día del trabajo falta el equipo.

**Zonas vitales es el único sitio donde Producción escribe, y es el más
importante de los cuatro.** Antes, la prioridad de una cámara la ponía
Mantenimiento con su criterio. Pero *qué se pierde si esa zona se queda ciega*
sólo lo sabe quien conoce el proceso.

Se declara **una vez por zona** y la prioridad de todas sus cámaras sube sola.
Nadie tiene que marcar cámara por cámara, y nadie se puede olvidar.

---

### GRUPO E · Materiales y planificación

| Módulo | Proceso que ataca |
|---|---|
| **Almacén** | Stock con **decimales** — el cable UTP se mide en metros |
| **Preventivo** | Planes por activo, con intervalo derivado del ambiente |
| **Predictivo** | Equipos que empiezan a dar señales antes de fallar |
| **Mejoras** | Lo que propone el campo y el jefe acepta o rechaza |
| **Riesgo** | **Dónde no vamos a poder arreglar**: repuestos y obsolescencia |
| **Instalaciones** | Pedir una cámara nueva: solicitada → evaluada → aprobada → instalada |

**El stock decimal parece un detalle y no lo es.** Con enteros, retirar 12,5 m
de cable registraba 13 y devolver 5,2 acreditaba 5. Cada operación perdía
décimas y en pocos meses el stock dejaba de parecerse al estante.

**El intervalo preventivo se deriva del ambiente**, no se escribe a mano. Una
cámara en el horno se ensucia más rápido que una en el púlpito. Escribirlo a
mano significa que nadie lo revisa nunca.

**Instalaciones tiene cuatro pasos y no uno** porque el paso que falta hoy en
planta es el segundo: **alguien va al sitio y mide**. Sin eso, los trabajos se
cotizan mal siempre.

---

### GRUPO F · Control, seguridad y trazabilidad

| Módulo | Proceso que ataca |
|---|---|
| **Auth** | Entrar. Con bloqueo por intentos y sesión que caduca |
| **Usuarios / Roles** | Quién puede hacer qué, editable sin tocar código |
| **Auditoría** | **Quién hizo qué, cuándo, desde qué IP y desde qué equipo** |
| **Credenciales** | Contraseñas de cámaras y NVR, **cifradas** |
| **Accesos (altura)** | Autorizar trabajo en altura. Es una decisión de seguridad |
| **Control de dispositivos** | Qué aparatos pueden conectarse |
| **Avisos** | Telegram al técnico donde está: en campo |
| **Limpieza** | Borrado definitivo con dos llaves, y dejar la base vacía |
| **Exportación** | Sacar a Excel lo que pida una auditoría |
| **Indicadores** | MTBF, MTTR, cumplimiento, backlog |

**La auditoría registra el equipo de origen, no sólo la IP.** Una IP no dice
nada tres meses después; «PC del púlpito T2» sí.

**Los indicadores no inventan.** El MTBF exige dos fallos: con uno no hay
intervalo que medir y devuelve `null`, no un número.

---

## 3. Los 7 roles: qué hace cada uno y por qué

### Jefe de Mantenimiento — 39 permisos (todos)

**Es el administrador del sistema.** Único que cierra órdenes e incidencias,
firma el retiro de materiales, autoriza trabajo en altura, administra usuarios
y roles, y tiene la segunda llave del borrado definitivo.

*Por qué concentra tanto:* es quien responde. El cierre de una orden lleva su
firma y es el documento que se enseña en una auditoría.

### Supervisor TI — 24 permisos

Supervisa y analiza todo, pero **no cierra**. Puede crear y editar activos,
administrar el almacén y las ubicaciones, ver credenciales y escribir
procedimientos.

*Lo que NO tiene:* `incident.close`, `wo.approve`, `user.manage`,
`credential.manage`, `asset.delete`.

*Por qué:* separar quien **analiza** de quien **cierra**. Si la misma persona
diagnostica y da por bueno el arreglo, nadie revisa a nadie.

### Técnico — 17 permisos

**Rol de campo.** Registra incidencias, trabaja las órdenes, actualiza activos,
hace conteos de almacén y pide permisos de altura.

*Lo que NO tiene:* nada de credenciales, no cierra, no borra, no aprueba.

### Técnico de Red — 19 permisos

Como el Técnico **más credenciales**: puede ver y cambiar las contraseñas de
cámaras y NVR.

*Por qué existe aparte:* el levantamiento de un activo exige criterio de red
—puerto PoE, canal del grabador, VLAN— que un técnico eléctrico no tiene. Él
acompaña y queda declarado, pero **no firma** la apertura de una orden de mapeo.

### Jefe de Producción — 13 permisos

**El puente entre las dos áreas.** Ve el tablero, las incidencias, el almacén y
el trabajo sobre sus cámaras.

Su permiso propio: **`zona.criticidad`** — declarar qué zonas son vitales. Es
la única escritura que le corresponde, y reordena el trabajo de Mantenimiento
sin que nadie lo toque a mano.

Y **`om.mirar`**: ver la orden en sólo lectura. Se creó a propósito para no
tener que darle `wo.read`, que le abriría el módulo de Mantenimiento entero.

*Puede abrir una incidencia* (`incident.create`) porque es quien primero nota
que una cámara se cayó. *No puede cerrarla.*

### Supervisor Operativo de Tercería — 13 permisos

Responde por la cuadrilla contratada, que cubre **los tres trenes**.

Su escritura fuerte es una sola: **`zona.intervencion`** — firmar en qué zonas
se puede trabajar con el tren en marcha. **No es un permiso administrativo: es
una autorización de seguridad.** Quien firma responde de que ahí se puede
trabajar sin parar la línea.

Lo demás es lo que necesita para firmar con criterio: ver el equipo, cómo se
llega, y qué órdenes hay.

### Consultor Externo — 10 permisos

**Sólo lectura.** Todo `.read`. Para auditorías y revisiones externas.

---

## 4. Los permisos que no son obvios

Cuatro permisos existen aparte de los amplios, y cada uno por un motivo
concreto:

| Permiso | Por qué no basta con uno amplio |
|---|---|
| **`purga.definitiva`** | El borrado sin vuelta pide **dos llaves**. Un permiso amplio se otorga por error al armar un rol; éste hay que darlo a propósito |
| **`om.mirar`** | Producción necesita ver una orden. `wo.read` le abriría el módulo entero y llenaría su menú de pantallas que no usará |
| **`zona.intervencion`** | Es una firma de seguridad, no un permiso administrativo |
| **`zona.criticidad`** | Reordena el trabajo de otra área. Va para quien conoce el proceso, no para quien ejecuta |

**Ninguna regla de acceso está atada al nombre de un rol.** Renombrar «Jefe de
Mantenimiento» desde la pantalla no rompe nada, y un verificador **falla el CI**
si alguien vuelve a escribir un nombre de rol en el código.

---

## 5. Los cuatro procesos completos, de punta a punta

### 5.1 Se cae una cámara

```
El púlpito lo nota  ·  o el agente de monitoreo lo detecta
        ↓
Se abre la INCIDENCIA          → queda la hora y quién
        ↓
El ingeniero ASIGNA la orden   → plazo automático según criticidad
        ↓
El técnico de red la DETALLA   → qué hay que hacer de verdad
        ↓
Escanea el QR y FIRMA          → apertura con contraseña
        ↓
Registra AVANCE                → % + nota + motivo si se atasca
        ↓
Retira MATERIAL                → descuenta del almacén, firmado
        ↓
CIERRA con firma               → síntoma, causa, acción — de catálogo
        ↓
El estado del activo VUELVE SOLO a operativo
```

**Producción mira todo esto en tiempo real** en «Mis cámaras». No interviene.

### 5.2 Falta un repuesto

El técnico lo pide → el sistema ve que **no hay stock** → la orden pasa a
EN_ESPERA con su motivo → **aparece en la pantalla del jefe de tren con el
código de SAP** → Producción puede mover la compra el mismo día.

*Antes:* se enteraban cuando llevaban dos semanas sin ver el colado.

### 5.3 Hay que instalar una cámara nueva

Solicitada → **Evaluada** (alguien va y mide) → Aprobada → Instalada, **y nace
el activo** en el inventario.

*El paso que falta hoy en planta es el segundo.* Por eso los trabajos se cotizan
mal.

### 5.4 Toca un preventivo

Plan por activo, con intervalo **derivado del ambiente** → el sistema genera la
orden solo → si el activo ya tiene una preventiva abierta, **no la duplica**.

Es la **única generación automática** del sistema. Correctivo, mejora y
predictivo siempre nacen de una decisión humana.

---

## 6. Qué respalda que esto funcione

| | |
|---|---|
| Pruebas automáticas | **704 en 45 suites** |
| Verificadores propios | **16**, cada uno nacido de un fallo real |
| Prueba de carga | 100 personas creando órdenes a la vez, contra PostgreSQL real |
| Migraciones | 34, versionadas |
| Vulnerabilidades altas | **0 en backend**, 1 en frontend (compilador) |

---

## 7. Lo que falta, sin adornos

**Del sistema:** prueba de integración en CI —nadie comprueba hoy que la
aplicación arranque contra una base real—, el patrón visual en 40 pantallas más,
y el salto de NestJS 10 a 11.

**De TI:** instalar el agente de monitoreo (sin él no se sabe **a qué hora** se
cayó una cámara, sólo cuándo alguien avisó), activar PITR antes de cargar datos
reales, y ensayar una restauración.

**De Producción:** declarar 2–3 zonas vitales. Sin eso, la mitad de sus
pantallas salen vacías.
