# Qué hace SGIT-CCTV

**Aceros Arequipa · Planta Pisco · Laminación (Trenes 1, 2 y 3)**
Informe para leer sin conocimientos técnicos. Actualizado 10/08/2026.

---

## En una frase

Es el sistema que sabe **qué cámaras hay, dónde están, si funcionan, qué se
les ha hecho y qué hay que hacerles** — y que convierte cada trabajo en un
documento firmado en vez de un recado por radio.

---

## El problema que resuelve

Hoy la información de las cámaras de Laminación vive en tres sitios: la
cabeza de dos personas, un Excel que alguien actualiza cuando se acuerda, y
mensajes de WhatsApp. Eso significa que:

- Nadie sabe cuántas cámaras hay realmente.
- Cuando una falla, se busca a quien «sabe de eso».
- No se puede demostrar por qué un trabajo no se hizo.
- Si esa persona se va, se va la planta con ella.

El sistema no inventa un proceso nuevo: **pone por escrito el que ya existe.**

---

## Lo que hace, módulo a módulo

### Infraestructura — qué hay y dónde está

**Activos.** Cada cámara, grabador, switch, antena, pantalla y PC, con su
código, marca, modelo, número de serie, ubicación y estado. Con foto, con QR
pegado al equipo y con **cómo se llega** escrito en texto llano —«desde el
púlpito del T2, bajar la escalera norte, poste de la izquierda»— porque el
personal nuevo recibe hoy un código y no sabe dónde está.

**Ubicaciones.** El árbol de la planta: planta → tren → etapa → punto. De ahí
salen solos el tren, la etapa del proceso y la criticidad: no se teclean, se
deducen.

**Gabinetes.** Qué hay dentro de cada rack.

**Conexiones de red.** El switch dibujado puerto por puerto, como se ve con la
linterna en el gabinete, y los enlaces que no pasan por un puerto numerado:
anillo de fibra, radioenlaces.

**Grabadores.** La rejilla de canales de cada NVR: qué cámara está en qué
canal y cuáles quedan libres.

**Cableado.** Cada tramo con sus metros. Ethernet tiene un límite duro de 90 m:
pasado eso el enlace **no falla, falla A VECES** — funciona con frío y se cae
con calor. Eso es el «se arregla y vuelve a fallar» que nadie explica, y nadie
lo va a descubrir si no está anotado que ese tramo mide 118 m.

**Puntos críticos y topología.** Qué se cae si se cae un equipo. Un switch que
alimenta 14 cámaras no es un switch más.

**Instalaciones** *(nuevo)*. Ver más abajo.

### Operación — qué está pasando

**Incidencias.** Lo que reporta el púlpito: «no se ve la salida del T2».
Categorías de planta reales, no genéricas.

**Órdenes de mantenimiento (OM).** Correctivo, preventivo, predictivo, mejora
y mapeo. Con quién la pidió, por dónde entró, quién la ejecuta, quién
acompaña, qué materiales salieron del almacén, avance parcial cuando la parada
se acorta, y cierre **firmado** con síntoma, causa y acción de catálogo.

**Ventanas de parada** *(nuevo)*. Ver más abajo.

**Mi bandeja.** Lo que espera una decisión hoy, por persona.

### Mantenimiento

**Preventivo automático.** El sistema genera solo las órdenes según el
intervalo de cada tipo de equipo y la agresividad del ambiente: una cámara
junto al horno no se limpia cada seis meses.

**Cámaras de grúa.** Módulo propio porque fallan distinto: el cable se fatiga
en la cadena portacables, la antena se desalinea con la vibración, y no se
llega sin manlift.

**Trabajo en altura.** Solicitud, autorización y registro. SSOMA.

### Almacén

**Inventario y repuestos.** Con retiro firmado desde la OM: se sabe qué salió,
para qué y quién lo autorizó. Y con carga desde el Excel de SAP.

### Sistema

**Auditoría.** Quién hizo qué, cuándo, desde qué IP y **desde qué PC de la
planta**.

**Usuarios y roles editables.** Con ámbito por tren: quien trabaja en el T2 ve
el T2.

**Avisos por Telegram.** Cinco tipos de alerta.

**Descarga a Excel.** Todo, tabla por tabla. Para llevarlo a una reunión, para
pasárselo al ingeniero, y como copia legible por una persona.

**Limpieza de datos.** Borrado definitivo de basura, sólo para el Jefe.

**Equipos conocidos.** Traduce una IP en un sitio: la auditoría deja de decir
`10.20.3.14` y dice «PC del púlpito del Tren 2».

---

## Lo nuevo de esta entrega

### Ventanas de parada

**El problema.** A las cámaras de la línea no se les puede tocar con el tren
en marcha. Hay que esperar a que Producción pare — y Producción **avisa a
última hora y mueve la hora**, a veces tres veces.

**Lo que hace el módulo.** Apuntar la parada en treinta segundos desde el
celular, colgarle el trabajo que se va a hacer, y **moverla las veces que haga
falta con el motivo obligatorio**.

**Por qué el motivo es obligatorio.** Cuesta cinco segundos y es lo que
convierte *«siempre nos mueven la parada»* en *«se movió 14 veces este mes, 9
por cambio de programa»*. Lo primero es una queja. Lo segundo va a una reunión.

**Y separa lo previsto de lo real.** Lo que dijo Producción y lo que pasó son
dos datos distintos. Restarlos da la desviación — y si la ventana prometida
son cuatro horas y siempre son dos, el trabajo se está planificando sobre
tiempo que no existe.

### Instalaciones

**El problema.** Poner una cámara nueva no es mantenimiento. Mantenimiento
arregla lo que existe; esto pone lo que no existe. Y las preguntas son otras:
¿hay corriente ahí? ¿llega la red? ¿cuántos metros de cable? ¿se sube sin
manlift? ¿quién autoriza entrar?

**La idea central: el formulario cambia según el sitio.**

| Sitio | Lo que se pregunta |
|---|---|
| **Púlpito** | ¿Falso techo? ¿Canaleta? ¿Climatizado? ¿Qué pantalla hay? **¿Quién autoriza entrar en turno?** |
| **Grúa** | ¿Se puede detener? ¿Manlift? ¿Va por la cadena portacables o por antena? ¿Hay línea de vista? |
| **Sala eléctrica** | ¿Permiso eléctrico? ¿Bloqueo LOTO? Aviso de interferencia electromagnética |
| **Patio** | ¿Gabinete estanco? ¿Qué grado IP? Pisco es zona salina |
| **Nave** | Ambiente, altura, ¿hace falta parar el tren? |
| **Oficina** | Lo básico: corriente, red, metros |

Un formulario único con cuarenta campos consigue que el técnico rellene
cuatro, y que los cuatro que importan de la grúa queden enterrados entre
treinta que no aplican.

**El ciclo son cuatro pasos, y cada uno lo hace alguien distinto:**

1. **Pide** quien la necesita. Sólo dice **qué** y **para qué**. No se le
   piden metros de cable: pedírselo sólo consigue un número inventado que
   después alguien toma por bueno.
2. **Va y mide** un técnico. Este paso es el que hoy no existe en planta, y
   por eso los trabajos se cotizan mal. Se puede guardar **a medias**: se está
   en el sitio, con guantes.
3. **Decide** el Jefe, **con el costo delante**. No se puede aprobar algo sin
   visita: sería firmar sin saber si son 20 metros de cable o 200.
4. **Se instala**, y **nace el activo** en el inventario, con lo que se midió
   en la visita ya volcado en su ficha. Ése es el remate: sin él, la cámara
   queda puesta en la pared y **fuera del sistema** — que es exactamente el
   problema que este software existe para resolver.

---

## Qué NO hace, y es importante saberlo

- **No sustituye a SAP.** Convive: guarda el código SAP y exporta a Excel.
- **No ve video.** No es un visor. Gestiona los equipos que dan el video.
- **No detecta la MAC de un PC.** No se puede: la MAC no llega al servidor.
  Se declara a mano desde la reserva DHCP o el switch.
- **No inventa datos de planta.** Si una etapa, una causa o una rutina no
  están cargadas, el sistema avisa; no rellena con un valor «razonable».
- **No adivina las paradas.** Alguien las apunta.

---

## Estado

| | |
|---|---|
| Módulos | 33 |
| Pantallas | 36 |
| Endpoints | 262 |
| Pruebas automáticas | 458 |
| Migraciones | 24 |

**Listo para estrenar** una vez cerrado el ámbito por identificador (12.3) y
activados los respaldos con PITR en Railway.
