# Paseo por el software · 20/09/2026

**Quién lo hizo:** el usuario, entrando como **administrador completo — Jefe de
Mantenimiento**.
**Qué es este documento:** lo que vio, tal como lo dijo, convertido en bloques.
**Instrucción expresa:** *«No programes nada todavía. Anótalo para los bloques.»*
Aquí no hay código. Nada de esto se toca hasta que él diga por cuál se empieza.

El recorrido fue por los **cuatro menús principales** —Mi bandeja, Mis cámaras,
Mis activos, Mi cobertura— y esa elección no es casual. Palabras suyas:

> «Cuando yo me levanto de un nuevo día de trabajo y veo esto, ¿qué es lo que
> quiero revisar primero para saber el estatus actual?»

**Esos cuatro son la portada del sistema.** Si esas cuatro pantallas no se leen
en tres segundos, da igual lo que haya detrás.

---

## Bloque 123 · Mi bandeja: nadie se salta el plazo, se pide más plazo

**Lo que vio:** «órdenes asignadas sin detallar» amontonado, y el concepto de
**«órdenes fuera de plazo»**.

**Lo que dijo, y es lo importante:**

> «El tema de fuera de plazo, yo creo que deberíamos quitarlo. ¿Por qué motivo?
> Por el tema de que una OM se puede extender así sin más. Si existe un problema
> debe haber una forma de cómo poder especificar el técnico y decir: oye, mira,
> hay un problema, no podemos continuar, ya empezó la parada, la producción.
> Podemos extender la solicitud y la aprueba el supervisor.»

### El razonamiento

Hoy el sistema **etiqueta** una orden como fuera de plazo. Esa etiqueta es una
acusación automática, y casi siempre es falsa: la orden no se retrasó por el
técnico, se retrasó porque **arrancó la parada y no se podía entrar**.

Una etiqueta que acusa sin escuchar es exactamente el margen de error humano que
este software existe para cerrar — sólo que al revés: aquí la máquina juzga mal.

### Lo que se construye

- Se **retira «fuera de plazo»** como estado calculado y acusatorio.
- Aparece la **solicitud de extensión**: la pide el técnico, **con motivo escrito
  obligatorio** (la parada, falta de repuesto, permiso de altura denegado…).
- La **aprueba el supervisor**. Sin aprobación, la fecha no se mueve.
- La orden pasa a un estado honesto: **«extensión pedida — esperando visto
  bueno»**, que no es ni retraso ni normalidad.
- Todo queda en el historial: quién pidió, qué motivo, quién aprobó, cuándo.

**Esto es la primera pieza real del doble visto bueno.** Lo que el técnico
declara no es final hasta que el supervisor lo confirma. *Nadie se salta un
paso.*

---

## Bloque 124 · Mis cámaras: el avance que se ve y la cámara que se pasa

**Lo que vio:** el avance escrito como «0 %» en texto plano; «Orden abierta y
asignada» sin manera de llegar a esa orden; y cuatro cámaras sin imagen
apiladas una debajo de otra.

**Lo que dijo:**

> «En avance debe salir el porcentaje… tiene que ser más resaltante, debe salir
> como una especie de barrita.»
> «Esto de orden abierta y asignada debería haber un botón que te envíe a dónde
> va.»
> «Si soporta varias cámaras —dos, cuatro, seis, diez— todas esas cámaras van a
> salir así. Debe haber un botón de traslado, un botón de deslizamiento: cámara
> dos, cámara tres… hay cuatro cámaras sin imagen y deslizando, con toda la
> información.»
> «Apelo a tu criterio de cómo manejas el entorno visual para el usuario.»

### Lo que se construye

1. **Barra de avance**, no un número suelto. El porcentaje grande, con color de
   la paleta del bloque 116 y la frase del bloque 113 debajo (*sin empezar · en
   curso · por acabar · detenida*). Un «0 %» en gris se lee como «no hay dato»;
   una barra vacía se lee como «no ha empezado», que es la verdad.
2. **Botón a la orden.** Donde dice «Orden abierta y asignada» hay un enlace que
   abre esa OM. Hoy el dato está y el camino no: *modelo + endpoint ≠ función.*
3. **Deslizamiento entre cámaras** en vez de pila infinita: una cámara ocupando
   la pantalla con toda su información, y flechas / puntos para pasar a la
   siguiente, con el contador «3 de 10». La pila se queda como vista alterna
   para quien quiera verlas todas de golpe.

**Criterio visual, asumido:** en una pantalla de planta manda **un** objeto a la
vez. Lo que se amontona no se lee, se ojea — y lo que se ojea se equivoca.

---

## Bloque 125 · Mis activos: una sola puerta para «cómo se llega»

Este es el hallazgo más de fondo del paseo, porque no es visual: es **de
propiedad**.

**Lo que dijo:**

> «Entiendo que en mis activos es donde se va a registrar… No sé por qué está
> esto. Explícame para qué está esto.»
> «Producción no puede ver el tema de estructura de activos. Esto es netamente
> para gestión de mantenimiento.»
> «Ojo, los activos son para gestión de mantenimiento, no para el tema técnico.
> El tema técnico es para campo.»
> «Ahora, declarar cómo se llega, ¿por qué eso le aparece a Producción? Esto no
> está bien. Tenemos dos cosas… aquí debería poderse editar el tema de cómo se
> llega. Todo en uno solo, no dos.»
> «Cambiarle el nombre, por ejemplo: actualización de activos, activos sin
> especificar — pero que no aparezcan ahí.»

### Las tres cosas que hay que separar

| Qué es | De quién es | Dónde vive |
|---|---|---|
| **Estructura de activos** (alta, jerarquía, tren, etapa, criticidad) | **Gestión de mantenimiento** | Fuera de los cuatro menús principales |
| **Cómo se llega** (referencia física, acceso, andamio, permiso) | Se **declara en campo**, se **valida** arriba | **Un solo sitio** |
| **Lo técnico del aparato** (marca, modelo, serie, IP) | Campo, con OM detrás | Ficha del activo |

**El bug concreto:** «declarar cómo se llega» existe **en dos pantallas** —«Mis
activos» y «Estructura de activos»— y le aparece a Producción, que no tiene nada
que declarar ahí. Dos puertas al mismo dato es la definición de dato poco
fehaciente: dos personas lo cambian, nadie sabe cuál vale.

### Lo que se construye

- **Una sola pantalla** para declarar y editar «cómo se llega». La otra entrada
  desaparece del menú.
- **«Mis activos» se renombra y se acota.** Es la bandeja de **activos que me
  faltan por completar** — no un explorador de la estructura. Nombre candidato:
  **«Activos por completar»**. La estructura completa se va a Gestión técnica,
  con su permiso.
- **Producción deja de ver lo que no le toca.** Si no puede declararlo ni
  decidir con ello, no está en su menú.
- Los cuatro menús principales quedan limpios: **Mi bandeja · Mis cámaras ·
  Activos por completar · Mi cobertura.**

---

## Bloque 126 · Mi cobertura: hoy es un cascarón

**Lo que dijo, literal:**

> «Mira, mi cobertura, esto es penoso porque esto muestra como si fuese una
> entidad vacía. Esto no debería estar así.»

Es uno de los cuatro menús principales y es el que peor entra por los ojos.

### Lo que se construye

La pantalla tiene que contestar **de un vistazo**: *¿qué estoy cubriendo yo hoy,
y dónde tengo un hueco?* Lo mismo que ya hacen las pantallas de Producción del
bloque 120: **titular arriba** (lo peor primero), esqueleto mientras carga,
estado vacío que explique — «no tienes zonas asignadas», no un marco en blanco.

Antes de rediseñarla hay que decidir una cosa que no puedo decidir yo: **qué es
una cobertura para él** —zonas, cámaras, trenes— y **qué hueco es el que le
quita el sueño**. Con eso, la pantalla sale sola.

---

## Bloque 127 · Tres defectos que él no nombró pero salen en las capturas

No los reportó; están en las fotos. Van aparte porque son **suciedad visible en
una demo**, y la demo es lo que decide.

1. **Imagen rota en «Mis cámaras».** «Campo de visión de AA-CAM-T1-FX-001» se
   pinta como un `img` roto —el icono gris de imagen no encontrada—. En una
   presentación eso se lee como «el sistema no tiene las fotos». Hace falta un
   marcador propio: *«Sin campo de visión cargado»*, con la opción de subirlo.
2. **Activo de prueba con basura.** «waeawe / ewaea aweawe · aweawe» está a la
   vista en Mis activos. No se borra a ciegas —nada se borra— pero **no puede
   salir en una demo**: o se marca como dato de prueba y se filtra, o él lo
   retira con su propio criterio.
3. **La columna ACTIVIDAD de Órdenes es ilegible.** Toda la hoja de ruta —los
   catorce pasos— metida en una celda, y al lado una torre de botones. La tabla
   deja de leerse. Va: **resumen de una línea** en la tabla, la hoja completa al
   abrir la orden, y los botones agrupados en un menú de fila.

---

## Lo que NO se toca en este lote

Por decisión suya, y para no volver a irnos del tema:

- **Zabbix** y el enlace agente→incidencia: van a **propuesta**, no a código.
- **Correo (bloque 111):** parado hasta que Aceros Arequipa autorice servidor.
- **Mensajería interna / derivaciones:** idea suya, viable y mejor que el correo
  —pero **como derivaciones con estado, nunca como chat**—. También a propuesta,
  hasta que él diga.
- **Campos de switch capa 2 / capa 3, gestionable, VLAN:** necesita migración y
  `prisma generate` en su máquina. Preparado, no empezado, por acuerdo.

---

## El orden que propongo (y que él decide)

| Orden | Bloque | Por qué ahí |
|---|---|---|
| 1.º | **127** | Es un día de trabajo y quita la suciedad que se ve en una demo |
| 2.º | **124** | Mis cámaras es la pantalla que más se enseña; la barra y el deslizamiento cambian la impresión entera |
| 3.º | **125** | Es el que ordena de verdad: una sola puerta al dato, y cada área viendo lo suyo |
| 4.º | **126** | Necesita que él defina qué es «cobertura» antes de dibujar nada |
| 5.º | **123** | El más grande: toca modelo, permisos y aprobación. Es la primera piedra del doble visto bueno |

**Nada de esto arranca hasta que él diga por cuál.**

---

# REGLA TRANSVERSAL · Ningún dato resaltado se queda en el aire

Añadida por el usuario el 20/09/2026, **antes de programar nada**. No es un
bloque: es una condición que cumplen **todos** los bloques de aquí en adelante,
y que hay que ir cumpliendo hacia atrás en lo ya hecho.

**Sus palabras:**

> «Si vas a especificar un dato importante que dice, no sé, "tres de Laminación
> sin ubicación" o lo que sea, asegúrate que sea un desplegable o un botón que
> te redirija al problema para que puedas gestionarlo. No pueden ser solamente
> cosas así al aire. Un dato así que yo tengo que buscar todo hasta abajo,
> irme hasta abajo del software para poder verlo… no. Tiene que sintetizar el
> problema para poder yo gestionar el problema dentro del software, dentro del
> módulo donde se va a resolver.»
>
> «Cada cosa que esté resaltada en negrita, que tú consideres que debe estar
> así, tiene que tener o bien un desplegable con información valiosa, o un
> botón que me lleve directamente —y estrictamente— al proceso que se tiene que
> hacer. El mismo botón, por ejemplo, que abra "generar OM rápido". Tiene que
> ser rápido: un mismo botón, pum, ahí, hacerlo todo de frente.»

## Qué significa, dicho como norma

**Un número resaltado es una acusación. Si acusa, tiene que ofrecer el remedio
en el mismo sitio.**

Hoy el sistema dice «3 activos sin ubicación» y ahí se acaba. El jefe tiene que
adivinar en qué módulo se arregla eso, bajar hasta el fondo, filtrar y
encontrarlos. **Eso es trabajo que el software le está pasando al humano** — y
es justo lo contrario de lo que este software existe para hacer.

## Los tres niveles, y cuál toca en cada caso

| Nivel | Cuándo se usa | Qué hace |
|---|---|---|
| **1 · Desplegable** | El dato resaltado son **pocos elementos** (≤ 10) y verlos ya resuelve la duda | Se abre ahí mismo: qué activos son, con su nombre y su sitio. Sin salir de la pantalla |
| **2 · Botón que lleva** | Son **muchos**, o el arreglo vive en otro módulo | Abre el módulo **ya filtrado por ese problema**. No el módulo a secas: el módulo con el filtro puesto |
| **3 · Botón que resuelve** | El arreglo es **una acción concreta y conocida** | Ejecuta el proceso desde ahí: *Generar OM rápida*, *Asignar ubicación*, *Pedir extensión*. Sin navegar |

**El nivel 3 es el objetivo.** El 2 es el mínimo aceptable. El 1 vale cuando no
hay nada que arreglar, sólo que mirar. **El nivel 0 —un número suelto— deja de
existir.**

## La regla corta, para no olvidarla

> **Si está en negrita, se puede tocar. Si se puede tocar, lleva a donde se
> arregla. Y si se sabe cómo se arregla, lo arregla.**

## Consecuencias inmediatas

- Cada **titular** de pantalla (bloque 120) pasa a ser pulsable.
- Cada **KPI** del Resumen de planta pasa a ser pulsable.
- Los cuatro menús principales —Mi bandeja, Mis cámaras, Activos por completar,
  Mi cobertura— existen **para eso**: él lo dijo en el mismo paseo. *«Me imagino
  que está así para poder ver qué está pasando y para que yo me redirija al
  problema en sí, para poder gestionarlo y resolverlo.»* **Confirmado: los
  cuatro son puertas a la gestión, no informes.**
- El bloque **124** ya lo pedía en pequeño (el botón «Orden abierta y asignada»
  que lleva a la OM). Ese botón no era un capricho: era esta regla asomando.
- Hace falta un **verificador**: ninguna pantalla puede pintar una cifra
  destacada sin destino. Se escribe cuando se implemente el primer lote, y se
  prueba reintroduciendo el fallo, como todos.

## Lo que hay que inventariar antes de programar

Barrido de **todas** las cifras y frases destacadas del sistema, y para cada una
tres columnas: *qué acusa · dónde se arregla hoy · qué nivel le toca*. Ese
inventario es el primer paso del lote, y sale de leer las pantallas, no de
suponer.

---

# Corrección del usuario · 20/09/2026 (segunda pasada)

Corrige los bloques **125** y **126**. Manda esto sobre lo escrito arriba.

## Los cuatro menús son para TODOS, Producción incluida

> «Estos cuatro cuadros salen para Producción también, o sea, para todos en
> general.»

No son la bandeja del jefe: son la portada del sistema para cualquiera. Cambia
lo que puede salir en ellos: **nada confidencial**.

## Bloque 125 · CORREGIDO — «Mis activos» es informativo, no declarativo

**El error:** hoy «Mis activos» es *«Mis activos y cómo se llega a ellos»* —
exigen manlift, sin declarar, botón «Declarar cómo se llega». **Eso no va ahí.**

> «Declarar cómo se llega y todo eso debe estar en estructura de activos, o un
> lado que diga activos. Ahí tiene que estar eso, no acá, porque **esta es una
> información confidencial**; eso solamente lo puede modificar el área de
> mantenimiento, porque mantenimiento es el que proporciona esa información.»

### Qué es cada pantalla, ya decidido

| Pantalla | Qué enseña |
|---|---|
| **Mis cámaras** | **Las fallas.** Lo que no da imagen, lo que está abierto |
| **Mis activos** | **Cuadro general: qué hay y dónde va.** Los activos de mi tren, su sitio —gabinete, sala de equipos, a qué switch— y si tienen OM |
| **Estructura de activos** (Mantenimiento) | Alta, jerarquía y **cómo se llega** — manlift, acceso, permiso. Confidencial, sólo Mantenimiento lo modifica |

### «Mis activos», lo que sí lleva

> «Mira, acá te lo puedo mostrar: esto va así, allá. Un cuadro general de los
> activos que hay en mi tren.»
> «Ubiquiti, por ejemplo, esto es una antena. Forti Switch, su nombre. **No digo
> que salga su IP ni nada**, pero sí que salga eso.»

- Nombre del activo, **tipo** (antena, switch, cámara, NVR), **marca y modelo**.
- **Dónde está montado**: gabinete, sala de equipos, a qué switch cuelga.
- **Si tiene OM y en qué va.** El púlpito no sabe que hay una OM abierta:
  > «Acá debería salir si la OM ya se está trabajando o no se está trabajando.
  > Esa información es vital para Producción.»
- **Sin IP, sin credenciales, sin cómo se llega.**

Los chips *exigen manlift · sin declarar · sin servicio* están bien pensados —
pero **viven en Estructura de activos**, no aquí.

## Bloque 126 · CORREGIDO — «Mi cobertura» se llama «Zonas críticas»

> «Mi cobertura, me imagino que es sólo para el tema de las ubicaciones de las
> cámaras: qué está apuntando, dónde está. Lo que podemos poner ahí es en qué
> zona se está… "hay una cámara sin dar imagen, ninguna en zona vital" — me
> imagino que es para darle prioridad. En vez de "Mi cobertura", poner **zonas
> críticas**, algo que sea entendible.»
> «Darle más sazón: que los botones, todo, para **gestionar rápido**, porque es
> tema crítico.»

- **Renombrar a «Zonas críticas».** «Cobertura» no se entiende; «crítico» sí.
- Lo que contesta: **qué zona vital está ciega ahora mismo**, ordenado por
  criticidad de la zona, no por cámara.
- **Gestión rápida en la misma tarjeta** — es la regla transversal aplicada
  donde más duele: zona ciega → generar OM al toque.

## Bloque 125 · SEGUNDA CORRECCIÓN — «Mis activos» es el resumen de dependencias

Esto es lo que quería decir desde el principio, y ahora está claro.

> «Acá te da como un cuadro de **dependencias**, por así decirlo. Mira, esta
> antena está yendo aquí. Ese tiene que ser como un **resumen general**: mira,
> este aparato está inoperativo, entonces **por ende todos están inoperativos**.
> Eso es lo que yo veo acá.»
> «Que salga tal cual el nombre, pero **más sintetizado**. Acá sale Tren 1,
> gabinete, Púlpito de control… sale en general.»
> «**No hay que desperdiciar esta gran idea**, porque sí va bien: tiene que ser
> un resumen de las dependencias.»

### La forma, no la lista

Hoy «Mis activos» es una **lista agrupada** por sitio. Tiene que ser un **árbol
de dependencia** que se lea de un vistazo:

```
Tren 1 (Laminación)
  └ Púlpito de control
      └ AA-AP-T1-PUL-001 · Ubiquiti airMAX PMP   ← CAÍDA
          └ 4 equipos abajo, todos sin servicio por ella
  └ Gabinete R-01 · Sala de equipos
      └ AA-NVR-T1-R01-001 · Hikvision DS-96xxNI
```

**Lo que aporta y hoy no está:** la **causa arriba**. Si la antena se cayó, los
cuatro de abajo no están averiados — están **sin servicio por culpa de ella**.
Una sola falla, no cinco. Eso es exactamente lo que Producción necesita saber
antes de reportar cinco cámaras muertas.

### Acotado por tren — obligatorio

> «Esta antena se ha caído… y **esa información sólo debe salir para cada jefe
> de Producción según su tren**. No tiene por qué importarle éste para acá y
> éste para allá: según su tren.»

El ámbito por tren ya existe en el sistema (bloque 4C). Aquí se aplica sin
excepción: **el jefe de línea del Tren 2 no ve el árbol del Tren 1.**

### Y así se cae lo otro

> «Así podemos quitarnos el tema de esa vaina de acá.»

Confirma la corrección anterior: los chips de *declarar cómo se llega / exigen
manlift* desaparecen de esta pantalla. El árbol de dependencias ocupa su sitio.

### Relación con lo ya construido

**«Impacto de una caída»** (bloque 7, topología) ya calcula esta dependencia y
ya la dibuja. **No se construye de cero: se sintetiza.** Aquélla es la pantalla
de análisis del ingeniero; ésta es el resumen diario, acotado al tren, que se
lee en tres segundos y desde el que se gestiona.

## Bloque 125 · TERCERA PASADA — cómo se navega el árbol y qué avisa

### Quién ve cuánto

| Rol | Alcance |
|---|---|
| **Jefe de Mantenimiento** | **Todo.** Los tres trenes |
| **TI** | **Todo.** Valida la red industrial de capa 1, 2 y 3 |
| **Jefe de línea / Producción** | **Sólo su tren** |

> «Como yo soy jefe de mantenimiento, yo sí veo todo. Y TI también ve todo.»

El ámbito por tren (bloque 4C) ya distingue esto. No se inventa nada: se aplica.

### El árbol tiene un nivel más: el área dentro del tren

> «En el Tren 1 existe, por ejemplo, sale **eléctrica**, un montón de cosas.
> Entonces ahí podrías poner un **desplegable**.»

Un tren no es una lista plana de equipos: tiene áreas —eléctrica, salas,
zonas—. El árbol se **despliega por nivel** y arranca **cerrado**, con el
recuento en la cabecera. Quien quiera bajar, baja. Quien no, ve el resumen.

```
▸ Tren 1 (Laminación)      12 equipos · 1 avería
   ▸ Eléctrica              4 equipos · ok
   ▾ Sala 1                 5 equipos · 1 avería  ← abierto
       AA-AP-T1-PUL-001 · Ubiquiti airMAX PMP    CAÍDA
         └ 4 equipos sin servicio por ella
   ▸ Púlpito de control     3 equipos · ok
```

### El aviso: masticadito, no chanfaina

> «Si hay un problema, un error, que salga aquí una **notificación chiquitita**
> —no sé cómo lo podrías colocar, es de tu criterio— y pum, ahí: **averías**.
> Y pones "se averió en Sala 1", o "se averió en tal zona del tren". Algo así.
> **No tiene que estar toda una chanfaina, tiene que ser algo masticadito.**»

Regla de escritura del aviso: **dónde + qué**, una línea, sin jerga.
*«Sala 1 — antena caída, 4 equipos sin imagen.»*
Nunca el volcado del equipo. El detalle está un clic más abajo, no en el aviso.

### Y lo que tiene que contestar la pantalla

> «Es la parte visual para Producción, para todos en general, para poder ver un
> **resumen de cómo está la situación actual**: si se está resolviendo, si hay
> una OM abierta, y **si no hay una OM abierta, realizar la OM**.»

Tres estados por avería, y sólo tres:

| Estado | Qué se ve | Qué se puede hacer ahí mismo |
|---|---|---|
| **Sin OM** | La avería está sola | **Botón: generar OM** — la regla transversal, nivel 3 |
| **OM abierta, sin empezar** | Quién la tiene | Botón que abre la OM |
| **En curso** | Avance y de cuándo es el dato | Botón que abre la OM |

Esto cierra el círculo: **ver el problema y resolverlo sin cambiar de pantalla.**

---

## Bloque 123 · AMPLIADO — Mi bandeja: el concepto está bien, el diseño no

> «Mi bandeja, puta, está bien. Para poder **descargar informes**, descargar
> todo eso, ver cosas en general, **cosas esperando**. Está bien — pero ser más
> redundante y **tener un mejor diseño**.»

No se replantea qué es: es la bandeja de **lo mío y lo que espera por mí**. Lo
que cambia es cómo se ve y qué se puede hacer sin salir:

- **Lo que espera**, agrupado y con su espera declarada — no un montón.
- **Descarga de informes desde la bandeja**: el PDF del técnico, la hoja de ruta
  en Excel, el informe de reemplazo. Hoy están repartidos por el sistema.
- **Solicitud de extensión** (lo del bloque 123 original) vive aquí.
- Cada cifra destacada, tocable. Regla transversal.

---

## Bloque 124 · recordatorio — Mis cámaras

Ya anotado arriba y sigue vigente: **barra de avance** · **botón que lleva a la
OM** · **deslizamiento** entre cámaras, no pila · y **desplegable** con la
información de cada una.

---

# CORRECCIÓN IMPORTANTE · La capa de resumen no ejecuta nada

Me lo tuvo que decir dos veces. Sustituye a lo que escribí arriba sobre «botón
que genera la OM» y «descargar informes desde la bandeja».

> «Mi bandeja es para lo que es: para ver la información. Desde ahí no se
> descarga nada, ni un PDF ni nada. Es solamente un mensajero.»
> «Ahí no tiene que haber ninguna funcionalidad. Ahí tiene que mandarte a donde
> está la funcionalidad, porque son procesos que tienen que hacerse de acuerdo
> al módulo.»
> «Esos cuatro, si aparecen, es para poder hacer un resumen masticado de todo lo
> que está sucediendo en planta.»

**Las cuatro pantallas ven y mandan. No hacen.** El proceso vive en su módulo y
sólo ahí — un proceso lanzable desde dos sitios es un proceso con dos verdades,
el mismo error que «declarar cómo se llega» duplicado.

**Y no se pierde la rapidez que él pidió.** *«Generar OM rápido»* significa que
el botón te deja **dentro del módulo de OM con el formulario ya cargado**
—activo, tren, avería puestos— para que sólo haya que confirmar. Sus palabras:
*«un botón que me lleve directamente y estrictamente **al** proceso»*. **Al**
proceso, no en lugar del proceso.

Queda escrito como principio de arquitectura en `CLAUDE.md` **§58**, para
futuros trabajos.

---

# Segundo paseo · Módulos de Producción (20/09/2026, noche)

## 0. LO ÚNICO QUE SE ARREGLÓ YA — la pantalla caída

**«Avance de órdenes» (`/tablero-om`) reventaba.** Error real:
`Cannot access 'B' before initialization`.

**Causa, y es mía, del bloque 120:** en `TableroOm.tsx` escribí

```
function titular() { ... lee r ... }
const tit = titular();      // la llamada
const filas = d?.data;
const r = d?.resumen;       // r se declara DESPUÉS
```

`function` sube, `const` no. La llamada caía en la zona muerta del `const`.
**TypeScript lo daba por bueno, el lint también, y en desarrollo se veía
bien.** Sólo rompía en el build de producción, y ahí los nombres van
minificados: por eso el mensaje decía `'B'` y no señalaba nada.

**Arreglado** moviendo los datos delante de quien los lee, y cerrado con
**`verificar:tdz` (verificador 27)**, probado reintroduciendo el fallo: verde
con el código bueno, rojo con el fallo puesto, verde otra vez. Revisadas las
otras pantallas con el mismo patrón (`Zonas`, `Capacidad`): están bien.

*Escribir el verificador costó tres intentos y los tres errores quedan
documentados dentro del propio archivo: leía constantes de otro componente,
confundía un `const` de un bloque interior con el del componente, y contaba
como llamada el comentario que explicaba el arreglo.*

## 1. Los enlaces llevan a donde no toca

| Desde | Botón | Hoy lleva a | Problema |
|---|---|---|---|
| Por tren | **¿Qué está fallando?** | Mis cámaras | *«¿Por qué mis cámaras? No lo entiendo.»* Sale de una pantalla por tren y aterriza en una pantalla personal |
| Por tren | **¿De qué depende?** | Impacto de una caída | **Llega SIN el tren.** *«Si estás hablando de un tren específico, ¿por qué te manda de todas formas general?»* |
| Impacto | cámara de la lista | Ficha/QR del activo | *«¿Por qué aparece esto? Acá no debería salir la información del activo»* |

**Regla que sale de aquí, y va con §58.6:** un enlace que nace en un contexto
—un tren, una zona, un equipo— **llega con ese contexto puesto**. Si no, el
usuario tiene que volver a filtrar lo que ya había filtrado.

## 2. Módulos que se solapan o no se entienden

- **Zonas vitales** y **Mi cobertura**: *«esto creo que es lo mismo»*. Lo es.
- **Estado por Tren**: *«¿cuál es el objetivo? Necesito que me expliques por qué
  está ese módulo ahí, porque ni siquiera sé cómo sustentarlo.»* Y sus cifras se
  repiten en Resumen de planta y en Por tren: *«una cámara sin imagen, una
  cámara sin imagen, una zona sin imagen…»*
- **Resumen de planta**: *«¿tú crees que ésta es la información que necesito
  para saber cómo está mi planta? Yo creo que no.»*
- **Impacto de una caída**: el contenido le convence —*«ok, mira, ¿ves? Eso es
  información»*— pero no el envoltorio.

## 3. Lenguaje: jerga que Producción no tiene por qué saber

- **«protegido por el anillo»** → *«yo soy Producción, ¿qué coño es anillo?»*
  Hay que decirlo en efecto, no en topología: *«si se cae, las cámaras siguen
  viéndose: la red tiene camino alternativo.»*
- **«1 equipo está fallando y de él 1 cámara depende»** → *«a veces es confuso.
  Hay que ver otra forma de colocarlo.»* Mejor el efecto primero:
  *«Grabador AA-NVR-T1-R01-001 caído — 1 cámara sin grabar.»*
- **«¿Qué pasa si se cae?»** en Zonas vitales → no se entiende qué se espera
  ahí. El campo pide el efecto en producción; el rótulo no lo dice.

## 4. Cosas que no responden

- Los **chips y desplegables de Estado por Tren no se pueden quitar ni pulsar**:
  *«yo quiero interactuar con estos botones… creo que ni siquiera funcionan.»*
  Es la regla transversal sin aplicar.
- En **Zonas vitales no se pueden añadir zonas** desde la propia pantalla.

## 5. Lo visual, otra vez

> *«Hay que mejorar el apartado visual. Sin duda. Guíate de un modelo, por
> favor.»*
> *«No sintetizarlo, reducirlo, sino darle más vida, más color, darle más
> sazón.»*

No es pedir adornos: es que la información que YA está correcta —y él lo
reconoce— no se está leyendo porque llega en forma de tabla y de párrafo.

---

# Tercer paseo · Gestión del mantenimiento (20/09/2026, noche)

## ARREGLADO YA · El menú se apagaba al abrir una pestaña (bloque 129)

Lo cazó él: *«yo sigo dentro de Dashboard y sin embargo no se selecciona;
solamente cuando voy a Análisis recién se selecciona. Ojo, eso puede ser
también un bug.»* Lo era.

`NavLink` compara rutas, y `/indicadores` no empieza por `/dashboard`: para
React Router son dos pantallas sin relación. La relación vive en `pestanas.ts`
(bloque 118) y **el menú no la estaba leyendo**. Pasaba igual con Preventivo,
Correctivo y Mejora respecto de «Órdenes (OM)».

No es cosmético: **el menú es el mapa**. Si se apaga, el usuario deja de saber
dónde está — y en una pantalla de pestañas eso ocurría en cada clic. Arreglado
leyendo la misma tabla que dibuja las pestañas: una sola verdad, no dos listas
que mantener a la par.

## Incidencias — lo que hay que cambiar

- **Producción debe poder crear incidencias, sólo de SU tren.** *«Solamente
  para que puedan generar incidencias y todo lo relacionado con sus incidencias
  dentro de su tren: Tren 1, sala eléctrica, barra…»*
- El apartado visual **le parece bien**. Se queda como está.
- **En «Convertir en OM», el formulario pide cosas que Producción no sabe.**
  *«Esto también debe ponerlo Producción… en vez de técnico, especificar los
  problemas que se tengan a la mano. Responsabilidad del técnico, colocarlo
  después.»* → **Quien reporta describe el síntoma; el técnico completa equipo,
  materiales y duración después.** El formulario debe partirse en esas dos
  mitades, no pedirlas juntas.

## Órdenes (OM) — «lo que más me preocupa»

- **La lista está fea y desordenada.** *«Los botones, esto está feo… imagínate
  cómo sale en una laptop. Tiene que ser bonito, presentable.»* La torre de
  siete botones por fila es lo primero que hay que agrupar.
- **La columna ACTIVIDAD sí le gusta** —que salga la actividad completa— pero
  hoy vuelca los catorce pasos de la hoja de ruta en una celda. Resumen en la
  tabla, hoja completa al abrir.
- **«En proceso» sale partido en dos líneas.** *«¿Por qué hay una barra abajo?
  Tiene que ser solamente "en proceso".»*
- **Los botones se salen de su sitio** en algunas resoluciones.
- **El botón «Informe» tiene que verse presentable**, es lo que se enseña.
- **Falta poder desactivar la generación automática de preventivos.** *«Los
  mantenimientos se generan de acuerdo a la disponibilidad del personal.»*
- **Tipo de trabajo:** *«¿por qué está Predictivo ahí? Dijimos que no iba.»*
  Y **«Mapeo de activos»** hay que decidirlo: o es un preventivo más, o es un
  tipo propio **y entonces sus OM tienen que alimentar el mapeo**, no quedarse
  sueltas.
- **Para la exposición:** él pide que le explique cómo funciona hoy la
  **generación automática del preventivo** (frecuencia por equipo, hoja de ruta,
  zona crítica). Va en el guion de la presentación.

## Ventanas de parada — el módulo que sobra, y lo que debe quedarse

Su razonamiento, que es bueno: **las paradas las decide Producción y cambian
todo el tiempo.** Al técnico se lo dice su planner, no el software. Un módulo
que hay que mantener a mano con un dato que caduca en horas **es un módulo
desperdiciado** — y encima invita a confiar en una hora que ya cambió.

**Lo que sí quiere conservar:** el dato de parada **dentro de la propia OM** —
*«empezó parada, no empezó parada, estamos empezando a tal hora»*. Ahí el dato
nace del trabajo real y sirve para medir el avance, en vez de ser una previsión
que nadie actualiza.

## Lo que está bien y no se toca

- **Criticidad de activos:** *«creo que es lo único que está bien.»* Sólo pide
  que **el buscador busque solo al escribir**, sin pulsar «Buscar» — y eso vale
  para todos los buscadores del sistema.
- **Hojas de ruta:** *«está sintetizado, todo bien»*, con una condición dura:
  **tiene que salir al 100 % igual que el Excel.** (Verificado: columnas B–R,
  fórmulas y los catorce pasos coinciden con su hoja real.)
- **Indicadores:** le parece bien. *«Tanto el Excel como todo lo demás tiene que
  botarme bien.»*

## Cámaras de grúa — por qué está separado, dicho por él

> *«Las grúas no son iguales que las cámaras de tren… por eso yo lo separé para
> segmentarlo. Y ojo: en las grúas no solamente hay cámaras, también hay
> grabadores y antenas.»*

Tres consecuencias:

1. **Las inspecciones de grúa tienen que generar OM**, no vivir aparte.
2. **Sus equipos —cámaras, grabadores, antenas— deben entrar en Criticidad de
   activos** como dato propio de grúa.
3. **Hace falta QR de cámara de grúa**, como el de activo y el de gabinete.

## Mejoras propuestas — le gusta, y le falta el circuito

> *«No sé cómo diablos está funcionando.»*

Hoy la propuesta nace desde el procedimiento de un equipo. Lo que él quiere:

- El **técnico rellena un formulario** de propuesta: qué propone, por qué, con
  foto.
- Lo leen **Mantenimiento, TI y Producción**.
- **Sale en PDF detallado**: propuesta, imagen, razón y todo lo demás.

Es la vía formal para que lo que ve quien está delante del equipo llegue arriba
sin depender de que alguien se acuerde en una reunión.

## Inventario → se llama **Repuestos**

> *«Inventario y Estructura de activos se pueden malinterpretar. Esto es para
> ver el tema de repuestos.»*

Tiene razón: son dos inventarios distintos —lo instalado y lo que hay en
almacén— y el nombre no los separa.

---

# Cuarto paseo · Gestión técnica (21/09/2026)

**Instrucción suya:** *«Ahorita solamente analiza y guarda toda la información
que te estoy dando… después vamos a reestructurar bien esta infraestructura
para poder avanzar de golpe todo lo que te estoy observando.»* Sin código.

## EL PROBLEMA DE FONDO · Los nombres se repiten y nadie sabe qué es qué

> *«¿Por qué hay siempre repetición de títulos? Criticidad de activos,
> Estructura de activos… es confuso.»*
> *«¿Por qué repites tanto el tema de los procesos, o por qué los segmentas de
> esa forma que no tienen sentido?»*

No es un problema de rótulos: es que **el mismo concepto está partido en
pantallas distintas sin que se vea la relación**. Mi cobertura / Zonas vitales /
Ubicaciones / Etapas del proceso son cuatro entradas para hablar de **dónde
está y qué importa**. Ése es el trabajo de reestructuración pendiente.

## Lo que hay que EXPLICARLE y arreglar (él lo pidió expreso)

### Ubicaciones · «Etapas del proceso» · «Catálogos»

> *«¿Qué significa etapas del proceso? Quiero que me lo especifiques y que
> arregles todo esto ya. No quiero propuestas: verifica en otros lados y
> arregla. Esto no tiene que estar aquí.»*
> *«Catálogo… corto, falla eléctrica, conector. ¿Por qué eso va en Ubicaciones?
> Podemos ponerle catálogo de problemas.»*

**Lo que son hoy, dicho en claro:**

- **Ubicaciones** = el árbol físico: Empresa → Planta → Tren → Etapa/Gabinete.
  Es obligatorio al crear un activo. **Eso sí pertenece aquí.**
- **Etapas del proceso** = los tramos del recorrido del material (púlpito, sala
  eléctrica, desbaste…). Cada etapa lleva **ambiente**, **criticidad mínima** y
  **cada cuántos días toca el preventivo**. **No es una ubicación: es una regla
  de mantenimiento** que se aplica a lo que viva ahí.
- **Catálogos** = las listas de síntoma / causa / acción del cierre de OM
  (corto, falla eléctrica, conector). **No tiene NADA que ver con ubicaciones.**

**Acuerdo: Catálogos sale de Ubicaciones.** Nombre propuesto por él: **«Catálogo
de problemas»** o similar, y su sitio es Gestión del mantenimiento, junto al
cierre de OM. Y **«Etapas del proceso»** hay que renombrarlo a lo que hace —
manda la frecuencia y la criticidad mínima, no el sitio.

### Riesgo de activos — «no entiendo para qué está, de verdad»

Lo que hace: **no dice qué está roto, dice qué no se va a poder arreglar.**
Dos pestañas: **Almacén** (repuesto que sostiene una zona vital y no hay stock)
y **Equipos** (modelo sin recambio en el mercado o sin soporte del fabricante).

Él no lo entiende y **además no es interactivo** — los cinco recuadros dicen
«pulsa para ver sólo estos» y no llevan a ninguna parte. **Es la regla
transversal sin aplicar, en la pantalla que más la necesita.**

### Calidad de datos — ¿por qué está en Gestión técnica?

> *«Eso debería estar en Gestión del mantenimiento. Explícame para qué está
> aquí, cuál es el objetivo.»*

Mide si la información sirve para trabajar: completitud, validez, unicidad,
consistencia, vigencia. **Tiene razón en moverla:** quien tiene que actuar sobre
los huecos es Mantenimiento, y la propia pantalla ya reparte cada fila entre
«Técnico de campo», «Mantenimiento» y «Técnico de red». *Un informe va donde
está quien decide con él* (§56.3).

### Accesibilidad — el orden del proceso no se ve

> *«Lo que me preocupa es que se vayan a perder. Ellos tienen que entender un
> proceso: primero anotas el activo, luego vas a Accesibilidad.»*

- **Renombrar** a algo que diga qué es: *Accesibilidad y trabajo en altura*.
- **El técnico tiene que verla.** Hoy es de revisión del Jefe.
- **Las columnas están muy separadas** — engorroso.
- Y hay que **enseñar el orden**: activo → marcar inaccesible → solicitud →
  visto bueno.

## Cambios concretos pedidos

| Pantalla | Qué pide |
|---|---|
| **Estructura de activos** | Otro nombre, que no se confunda con Criticidad de activos |
| **Etiquetas QR** | **Segmentar la impresión** por tren o por zona. *«Imagínate cuánto papel voy a gastar… no hay que hacer una chanfaina al imprimir los QR»* |
| **Equipos retirados** | El buscador **no tiene botón** ni busca al escribir |
| **Gabinetes** | Está vacío: falta **ver dependencias** (qué cuelga de él), **filtro por tren** y un buscador que diga tren / ubicación / referencia, no «equipo» |
| **Instalaciones** | **Producción debe poder solicitar** una instalación; el técnico la recibe y la completa en campo, **desde el teléfono**. El formulario necesita: materiales, zona, manlift, alimentación 220 V, caja de paso, tuberías, canalización. *«Búscalo bien para armar el formulario»* |
| **Campañas de mapeo** | *«¿Cuál es la necesidad? El mapeo debe ser sólo una OM.»* → **se elimina como módulo** |
| **Avance del mapeo** | Renombrar a algo tipo «Estado general de la información» |
| **Manuales y planos** | Le gusta y lo quiere reforzar: **subida de plano**, **subida de manual**, y **un formulario que genere el procedimiento** en archivo |

## LA IDEA MÁS IMPORTANTE DE ESTE PASEO · El formulario que se adapta

> *«El mapeo creo que pasa como preventivo. Entonces tengo una idea: por
> ejemplo, el OM lo seleccionamos Preventivo y luego que te aparezca otro
> buscador que diga qué va a hacer — mapeo, toda esa vaina — para que **el
> formulario cambie** y también ayude a la reducción de tiempo, **que se vaya
> autocompletando según los criterios** que se van a utilizar para esa OM.»*
>
> *«Ese es el objetivo: **automatizar, reducir tiempo, reducir el estrés, que
> este software sea un apoyo, no al contrario. No nos vamos a perder en el
> software.**»*

Esto resuelve de una vez el lío de «Predictivo» y «Mapeo de activos» en el
desplegable de tipo de trabajo: **no son tipos de OM, son SUBTIPOS**. ISO 14224
da la razón: preventivo y correctivo son las clases; el resto es el trabajo
concreto.

**Cómo queda:**

1. **Tipo** (la clase): Preventivo · Correctivo · Mejora.
2. **Qué se va a hacer** (el subtipo): mapeo de activos, limpieza de lente,
   alineación de antena, cambio de disco…
3. **Y el formulario se arma solo** con lo que ese subtipo necesita — y se
   autocompleta con lo que el sistema ya sabe del equipo.

Es la frase que cierra la presentación: **el software rellena lo que ya sabe;
el técnico sólo pone lo que sólo él puede saber.**

---

# Quinto paseo · Dependencias y Sistema (21/09/2026)

## ARREGLADO YA · «No queda ni un puerto libre» era mentira

Él lo cazó leyendo la pantalla: decía **«No queda ni un puerto libre»** y al
lado, en la misma tabla, **«0 ocupados · 24 sin mapear»**. Las dos cosas no
pueden ser verdad a la vez.

**El fallo era mío, y de lógica:** `libres = mapeados − ocupados`. Si nadie ha
registrado qué hay enchufado en cada puerto, `mapeados` es cero, y cero menos
cero da cero libres. **La cuenta estaba bien; la frase mentía**, porque leyó
«cero libres» como «lleno» cuando la verdad era «no se sabe».

**Y la diferencia cuesta dinero:** «lleno» significa comprar un switch; «no se
sabe» significa ir al gabinete y mirar.

Arreglado: mientras queden puertos sin registrar, la pantalla **no afirma que
no haya sitio**. Y se añadió la columna **Puertos** para que se vea de dónde
sale cada número.

### La respuesta a su pregunta, «¿en qué te basas?»

| Número | De dónde sale |
|---|---|
| **Puertos** | La **ficha del switch** en Activos de planta (`portCount`) |
| **Ocupados** y **Libres** | Lo registrado **puerto por puerto en Conexiones** |
| **Sin registrar** | La resta: lo que la ficha declara menos lo que hay anotado |
| **Con PoE** | Sólo si el presupuesto PoE está declarado. **No se estima**: un PoE supuesto es como se quema una fuente |

*Por eso «Conexiones» enseña 24 puertos y «Capacidad» decía 0: la primera
dibuja los huecos que la ficha declara, la segunda contaba sólo lo registrado.*

## Lo que pidió y queda anotado

### Electricidad — el bloque más crítico que falta

> «Cada cámara tiene que tener un punto de alimentación —el PoE— y el switch,
> ¿en qué está alimentado? Si el switch pierde el 220, ¿cómo lo restauramos?
> **Ni siquiera sabemos dónde está el tablero.** Ese tablero también tiene que
> estar segmentado para generarle un QR y saber dónde está ubicado.»

**Lo que hay que construir:** tabla de tableros por zona · qué alimenta cada
llave · la cadena completa `tablero → circuito → switch PoE → cámara` · y
**QR de tablero eléctrico**, como el de activo y el de gabinete.

Hoy la pantalla dice «6 equipos sin saber de qué llave cuelgan», que es
exactamente el problema.

### Cableado — certificación

Pide aplicar la metodología de **certificación de cableado y fibra**
(ANSI/TIA-568, pruebas de canal/enlace permanente, OTDR para fibra) y que el
resultado de la certificación viva en la ficha del tramo.

### Nomenclatura y funcionalidad, módulo por módulo

> «Quiero que entiendas que **cada funcionalidad de cada módulo se tiene que
> determinar por qué**. Porque así podemos especificar a qué rol vamos a ponerle
> cada cosa.»

Es la misma regla que ya rige el resto: **cada pantalla dice qué contesta y
para quién**. Falta aplicarla en Dependencias, que es donde más se nota.

| Pantalla | Qué pide |
|---|---|
| **Conexiones** | Mejor nomenclatura al declarar la dependencia |
| **Mapa de red** | *«¿Qué significa esto? Un equipo sin dirección que revisar, no entiendo.»* Explicar «fuera del plan de direcciones» sin jerga |
| **Puntos críticos** | Confirmar que funciona y para quién es |
| **Grabadores** | *«¿Qué te dijeron por radio? Eso no significa nada»* — el rótulo del buscador no se entiende fuera de contexto |
| **Direccionamiento IP** | Pulir; «Declarar subred» y el estado vacío no se entienden |
| **Rotulado** | *«Esta metodología está bien como la has detallado»* — sólo mejorar lo visual |
| **Equipos conocidos** | *«¿Cómo vas a ponerme 13 direcciones de esa forma?»* Las direcciones en tabla con **IP y MAC**, y los registrados en otro apartado |
| **Auditoría y Exportar** | Pulir |
| **Monitoreo** | **No se toca.** Va a la PPT como **plus vendible** |
| **Usuarios · Sesiones · Roles** | Le parecen bien; sólo repaso visual |
| **Limpieza de datos** | Confirmado: sirve para detectar datos absurdos. *Ahí es donde retira el activo «waeaweaw»* |

### El rol de cada dato — lo que él quiere poder decidir

> «Al técnico tiene que ver estas cosas: los canales, los puertos libres,
> cuántos canales tiene.»

Cuando cada módulo declare **qué contesta**, el permiso sale solo.
