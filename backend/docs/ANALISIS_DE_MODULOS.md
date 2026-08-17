# SGIT-CCTV · Análisis módulo por módulo

**Aceros Arequipa · Planta Pisco · Laminación (Trenes 1, 2 y 3)**
Actualizado: 17 de agosto de 2026 · hasta el bloque 42

---

## Cómo leer este documento

No es el catálogo de funciones. Es el análisis para **decidir qué mejorar**, así que cada módulo lleva:

- **Qué hace** — en una línea.
- **Por qué existe** — el problema real de planta que atacó. Si un módulo no puede responder esto, sobra.
- **A favor** — lo que aporta hoy.
- **En contra** — lo que le falta, lo que asume de más, o dónde se va a romper. **Esta columna es la que vale.**

Hay **42 módulos de backend** y **45 pantallas**. No todos pesan igual: cinco sostienen el sistema y el resto los rodea.

Una advertencia honesta antes de empezar: **nada de esto ha corrido nunca con datos reales de planta**. Todo lo que se ha probado son datos que se inventaron para probarlo, y los datos inventados son limpios. Varias de las desventajas de abajo sólo se van a notar de verdad la primera semana con datos de Pisco.

---

# GRUPO A · El ciclo de una falla

El corazón. Si esto falla, el resto es decoración.

## 1. Incidencias (`incidents`)

**Qué hace.** Registra que algo no funciona: qué equipo, qué se ve, quién avisó y cuándo.

**Por qué existe.** Antes el aviso viajaba por radio y moría ahí. Nadie podía responder «¿desde cuándo?» ni «¿cuántas veces ha pasado esto?». Sin un registro de la falla, ningún indicador posterior significa nada: el MTBF sale de contar fallas, y no se puede contar lo que no se anotó.

**A favor.** Es el punto de entrada más barato del sistema — abrir una incidencia son tres campos. Y el estado de la cámara **se deriva** de tener una incidencia abierta, así que no hay forma de que el equipo diga «operativo» mientras hay una falla viva.

**En contra.** Depende de que alguien reporte. **Hoy nada detecta una cámara caída sola** — el agente de monitoreo no está instalado. Así que la hora que se guarda no es cuándo se cayó: es cuándo alguien miró el púlpito y se dio cuenta. Entre las dos puede haber un turno entero, y el sistema lo dice pero no lo puede arreglar solo.

## 2. Órdenes de mantenimiento (`maintenance`)

**Qué hace.** La orden de trabajo completa: se abre, se asigna, se avanza con partes, se cierra firmada y sale su informe en PDF.

**Por qué existe.** Es el registro de qué se hizo, quién y con qué. Sin él no hay trazabilidad ni informe que enseñar en una auditoría.

**A favor.**
- El **avance con motivo de catálogo** es lo mejor que tiene: «quedó al 60 % porque faltó manlift» es contable, y así se puede saber cuántas paradas se pierden por falta de repuesto y cuántas por falta de equipo. Escrito a mano no se podía contar.
- Aguanta **varias órdenes a la vez**: correlativo con reintento y espera al azar, y guardas de estado en cada escritura. Probado con 100 creaciones simultáneas contra PostgreSQL real, todas únicas, 0 fallos.
- El cierre exige firma y sólo lo hace el Jefe.

**En contra.** Es el módulo más grande y el que más ha crecido por acumulación. Su servicio ronda las 900 líneas y **no tiene pruebas de todos sus caminos**. Es donde más probable es que un cambio futuro rompa algo sin que nada avise.

## 3. Correctivo, Preventivo, Predictivo, Mejora

**Qué hacen.** Cuatro vistas del mismo modelo de orden, separadas por tipo.

**Por qué existen.** Porque son cuatro conversaciones distintas. El correctivo se habla con Producción; el preventivo con el calendario; el predictivo con la tendencia; la mejora con el presupuesto. Mezclarlas en una tabla convierte las cuatro en ruido.

**A favor.** El **intervalo preventivo se deriva del ambiente** de la zona —calor radiante 30 días, climatizado 90— y no de una casilla «crítico sí/no» marcada a criterio de quien registró el equipo. Es la diferencia entre un plan que refleja la planta y uno que refleja a una persona.

**En contra.** **Predictivo no predice nada todavía.** Necesita historial y no hay. Hoy es una pantalla honesta pero vacía; el día de la presentación hay que saber que se va a ver así.

## 4. Procedimientos de restauración (`procedimientos`)

**Qué hace.** Cómo se arregla cada **modelo** de equipo, paso a paso, con sus advertencias. Y las propuestas de mejora que deja el técnico con los minutos reales que le costó.

**Por qué existe.** El conocimiento de cómo se restaura una cámara vive en la cabeza de dos personas. Cuando una se va de vacaciones, el turno de noche está solo con un equipo que no sabe abrir.

**A favor.** Cuelga del **modelo** y no del activo — con 300 cámaras habría 300 procedimientos vacíos. Y comparar minutos estimados contra reales es lo que hace que cada mantenimiento mejore el siguiente.

**En contra.** **No tiene pantalla de administración.** Sólo se llega escaneando el QR del equipo. El backend está entero y el Jefe no tiene dónde revisar las propuestas cómodamente. Es una deuda concreta y pequeña.

## 5. Catálogos (`catalogos`)

**Qué hace.** Causas, síntomas, acciones y motivos de avance, editables desde la interfaz.

**Por qué existe.** Regla del proyecto: todo lo de planta se edita desde la interfaz. Un enum en el código obliga a un despliegue para añadir una causa nueva.

**A favor.** Convierte texto libre en algo contable. Sin catálogo, «¿por qué se nos caen las cámaras del horno?» no tiene respuesta agregable.

**En contra.** Un catálogo mal poblado el primer día se arrastra años, porque la gente elige la primera opción que se le parece. **Merece una sesión con el ingeniero antes del despliegue**, no rellenarlo sobre la marcha.

---

# GRUPO B · Saber qué hay y dónde

## 6. Activos (`assets`)

**Qué hace.** El inventario técnico: cámaras, grabadores, switches, antenas, PCs, pantallas, decodificadores. Con ficha por tipo, fotos, QR e historial.

**Por qué existe.** Es la base de todo lo demás. Sin saber qué hay, no hay cobertura, ni preventivo, ni repuestos.

**A favor.**
- **La ficha incompleta se permite y se marca.** El técnico guarda en campo con lo mínimo y completa después. Un formulario exigente hace que la gente invente datos para poder guardar, y eso es peor que un hueco.
- El **estado efectivo se calcula**, no se guarda: `CON_INCIDENCIA` se deriva de tener una incidencia abierta. Un estado guardado se desincroniza el día que alguien cierra la incidencia y se olvida.
- Borrado suave: el historial sobrevive.

**En contra.** Es la pantalla más cargada del sistema: **doce columnas y veintiocho campos**. Sirve para el ingeniero y abruma a cualquier otro. Por eso Producción tiene ahora «Mis activos» aparte — pero la de Activos sigue igual de densa para quien sí la usa.

## 7. Ubicaciones (`locations`) — **el módulo que sostiene todo**

**Qué hace.** El árbol de planta: Empresa → Planta → Tren → Etapa → Zona → Rack.

**Por qué existe.** Del árbol se **derivan** el tren, la etapa, el ambiente, la criticidad, el intervalo preventivo y si se puede intervenir en marcha. Ninguna de esas seis cosas se guarda en el activo.

**A favor.** Una sola verdad. Antes había dos jerarquías compitiendo —el árbol y un campo `train` en el activo— y nada impedía que se contradijeran. Mover una zona de sitio recalcula todo lo que cuelga de ella, sin tocar un solo activo.

**En contra.** **Es el punto único de fallo del sistema.** Un árbol mal cargado hace que todo lo derivado salga mal a la vez, y en silencio: no da error, da números. Si algo merece revisión antes del despliegue, es este árbol.

## 8. Gabinetes (`cabinets`), Cableado, Conexiones, Grabadores

**Qué hacen.** El armario y lo que hay dentro; los tramos de cable con sus metros y categoría; puertos de switch y enlaces; NVR con sus canales.

**Por qué existen.** Son las preguntas que TI hace y nadie sabía responder: en qué puerto está esa cámara, cuántos canales libres quedan, si ese tramo pasa de 90 m.

**A favor.** El límite de **90 m** está codificado y se marca solo. Un tramo largo da fallos intermitentes imposibles de reproducir, y se diagnostican durante meses.

**En contra.** Se llenan a mano y **nada los verifica contra la red real**. Un puerto anotado mal se queda mal para siempre. Aquí es donde una integración con el switch aportaría más que cualquier pantalla nueva.

## 9. Campañas de mapeo (`campanas`) y Avance del mapeo

**Qué hacen.** Reparten el levantamiento por zonas y controlan la calidad de lo levantado.

**Por qué existen.** Levantar 300 activos es un proyecto, no una tarea. Sin reparto y sin control de calidad, se levanta rápido y mal.

**A favor.** El avance se mide sobre **todo lo que existe**, incluido el stock: una cámara en almacén sin ficha también está sin mapear. Y el avance de un tren sin empezar es 0, no 100.

**En contra.** Sólo tiene sentido durante el levantamiento inicial. Pasado eso queda como una pantalla que nadie abre — algo que revisar en seis meses.

## 10. Electricidad (`electricidad`) e IPAM (`ipam`)

**Qué hacen.** Tableros, circuitos y qué alimenta cada llave. Y el direccionamiento IP: qué IP poner, cuál está duplicada.

**Por qué existen.** «¿Qué llave le corta la luz a esta cámara?» y «¿qué IP le pongo?» son las dos preguntas que más tiempo hacen perder en campo.

**A favor.** El impacto eléctrico se calcula siguiendo la cadena de tableros hacia arriba: si cae el general, se sabe qué cae debajo.

**En contra.** Los dos dependen de que alguien cargue el dato. **Un IPAM incompleto es peor que no tenerlo**: si dice que la .45 está libre y no lo está, el técnico crea un conflicto de IP confiando en el sistema.

## 11. Estándar de rotulado (`estandares`)

**Qué hace.** ANSI/TIA-606-C aplicado a la planta: cómo se nombra cada cosa.

**Por qué existe.** Sin norma, cada técnico rotula a su manera y a los dos años nadie sabe qué es qué.

**A favor.** Está escrito y se consulta. Es documentación viva, no un PDF en una carpeta.

**En contra.** **Es informativo: no obliga a nada.** Nada impide dar de alta un activo con un código fuera de norma. Un verificador que lo exigiera al guardar sería el paso natural.

---

# GRUPO C · Lo que Producción necesita

## 12. Zonas vitales (`zonas`) — **el único sitio donde Producción escribe**

**Qué hace.** Producción declara qué se pierde si una zona se queda a ciegas.

**Por qué existe.** Antes la prioridad de una cámara la ponía Mantenimiento con su criterio. Pero *qué se pierde si esa zona no se ve* sólo lo sabe quien conoce el proceso.

**A favor.** Se declara **una vez por zona** y la prioridad de todas sus cámaras sube sola. Nadie marca cámara por cámara y nadie se olvida. Y sólo sube, nunca baja: una zona declarada MEDIA no puede rebajar una cámara que Mantenimiento marcó ALTA por motivos técnicos.

**En contra.** **Producción todavía no ha declarado ninguna.** Es el bloqueante más barato que queda y no es código: es una reunión de media hora. Sin zonas vitales, «Mi cobertura» sale vacía y el módulo de Riesgo no puede priorizar.

## 13. Mis cámaras — el panel del jefe de tren

**Qué hace.** Por cada cámara caída de su tren: la foto de a qué apunta, la línea de tiempo con horas, el avance con la última nota del técnico, qué material falta con su código SAP, y hasta dónde se puede llegar hoy.

**Por qué existe.** Es lo que pidió Producción textualmente. Y resuelve la llamada por radio: la respuesta está en pantalla con horas.

**A favor.**
- **La foto de a qué apunta.** Un código de activo no le dice nada a un jefe de línea; la imagen del campo de visión, sí.
- **«Se fue» y «lo reportaron» son datos distintos**, y no se mezclan. La hora de caída sólo se declara si el agente la vio y con tres fallos seguidos.
- **Miran, no tocan.** Un solo verbo en el endpoint.

**En contra.** Sin agente de monitoreo, la mitad de la línea de tiempo dice «no se sabe». El módulo es honesto al respecto, pero **la pantalla luce a la mitad de lo que puede lucir** hasta que TI instale el agente.

## 14. Mis activos — el manlift que costea Producción *(bloque 41)*

**Qué hace.** Qué hay en el tren, agrupado por gabinete, tablero eléctrico y campo, con la altura y el medio de acceso. Y arriba: cuántas subidas de manlift hacen falta, agrupadas por punto.

**Por qué existe.** Producción paga el manlift. Cada subida se pedía suelta y se pagaba suelta, porque nadie tenía delante la lista que enseña que tres equipos están en el mismo poste.

**A favor.**
- Los tres grupos no son decorativos: son los tres sitios donde **cambia la forma de llegar**.
- **Lo no declarado sale en gris y no suma.** Si el sistema asumiera «se llega a pie», Producción aprobaría un número bajo y el día del trabajo faltaría el equipo.
- Cuenta equipos y subidas, **nunca soles**. Una tarifa metida en el sistema envejece sola.

**En contra.** **Depende por completo de que alguien declare el acceso equipo por equipo.** Con la planta sin declarar, el módulo enseña un mar de gris y poco más. Es trabajo de campo que no se puede automatizar.

## 15. Mi cobertura

**Qué hace.** Qué zonas están sin vista, ordenadas por lo que se pierde.

**Por qué existe.** «¿Cuánto de mi línea estoy dejando de ver?» es la pregunta de gestión de Producción.

**A favor.** Ordena por impacto declarado, no por número de cámaras. Diez cámaras caídas en el patio importan menos que una en la colada.

**En contra.** Sin zonas vitales declaradas **no puede ordenar nada**. Hereda el bloqueante del módulo 12.

## 16. Estado por Tren

**Qué hace.** El tablero de infraestructura de cada tren: disponibilidad, canales libres, tramos fuera de norma, gabinetes sin foto.

**Por qué existe.** Para el ingeniero y para TI: la salud de la infraestructura de una línea, de un vistazo.

**A favor.** Todo lo que cuenta está en un módulo puro y probado.

**En contra.** **Esta pantalla nunca fue para Producción y se la estaba enseñando.** Con el bloque 42 ya no le aparece. Además tenía un fallo que salió en pantalla: «2 de 6 equipos funcionando con normalidad (100 %)» — mantenimiento no contaba como afectado para la disponibilidad pero tampoco como operativo. Corregido, pero es el ejemplo de que **un tablero con muchos números tiene muchas formas de contradecirse**.

---

# GRUPO D · Materiales, planificación y seguridad

## 17. Inventario (`inventory`)

**Qué hace.** Repuestos, stock, movimientos, retiro desde la orden, conteos e importación desde Excel de SAP.

**Por qué existe.** «No hay repuesto» es la causa número uno de que una orden se quede a medias.

**A favor.** Las salidas son **atómicas y transaccionales**: incremento a nivel de base, no calculado en JavaScript. Con dos técnicos retirando a la vez, el saldo cuadra. Probado con retiradas simultáneas.

**En contra.** El stock **no se sincroniza con SAP**: se importa desde un Excel que alguien tiene que bajar. En cuanto SAP y el sistema se separen, el módulo empieza a mentir sin avisar. Es la integración con más valor pendiente.

## 18. Accesibilidad y trabajo en altura (`access`)

**Qué hace.** Solicitud de manlift, grúa o andamio, con altura, justificación y fotos. La aprueba sólo el Jefe.

**Por qué existe.** El manlift es caro y el trabajo en altura desde 1,80 m exige PETAR/IPERC/ATS. Es un requisito de SSOMA, no una comodidad.

**A favor.** Deja el sustento por escrito y con dueño. Si pasa algo, se sabe quién autorizó.

**En contra.** Vive **separado de «Mis activos»**, que ahora sabe qué equipos exigen elevador. Lo natural sería que una subida agrupada generase la solicitud sola. Hoy son dos pasos manuales.

## 19. Ventanas de parada (`paradas`)

**Qué hace.** En qué ventanas se puede intervenir con la línea detenida.

**Por qué existe.** Buena parte del trabajo de CCTV en laminación sólo se puede hacer con el tren parado.

**A favor.** Junto con la intervenibilidad, separa lo que **no necesita parada** de lo que sí. Antes todo esperaba a una ventana, y las órdenes que podían hacerse en marcha competían por un hueco que no necesitaban.

**En contra.** **Las ventanas se cargan a mano y se mueven.** Nadie las sincroniza con la programación real de producción. Una ventana desactualizada hace que se planifique sobre una parada que no va a ocurrir.

## 20. Cámaras de grúa (`grua`)

**Qué hace.** Inspección específica de las cámaras y antenas sobre puente grúa.

**Por qué existe.** Ahí no se llega sin manlift y a veces sin parar la grúa. Cada subida cuesta mucho, así que hay que subir **una vez** y revisarlo **todo**.

**A favor.** Convierte una intervención cara en una lista cerrada. Nadie sube dos veces por olvidarse del dBm.

**En contra.** Muy específico. Si en Pisco hay pocas cámaras sobre grúa, es un módulo con poco uso — **conviene confirmar cuántas hay antes de invertir más aquí**.

## 21. Instalaciones (`instalacion`)

**Qué hace.** Pedir e instalar equipo nuevo, con los requisitos según el tipo de sitio.

**Por qué existe.** Una cámara nueva mal planteada —sin PoE, sin canal libre, sin ruta de cable— se descubre el día del montaje, con la cuadrilla arriba.

**A favor.** Comprueba los requisitos antes, no durante.

**En contra.** Se solapa parcialmente con Órdenes de tipo Mejora. **Hay dos caminos para pedir un equipo nuevo** y eso confunde a quien no usa el sistema a diario.

---

# GRUPO E · Control y trazabilidad

## 22. Roles y permisos (`roles`)

**Qué hace.** El ingeniero crea roles y reparte permisos, con ámbito por tren.

**Por qué existe.** La planta no cabe en cinco roles fijos. Y el control de acceso **se expresa siempre con permisos, nunca con nombres de rol**: renombrar un rol no puede romper nada.

**A favor.** El verificador de roles compara la semilla, el backend y el frontend, y falla si se desincronizan. Cazó 11 desfases en un día.

**En contra — y es la más grave del documento.**
1. **Nada comparaba el código contra la base que está corriendo.** El Jefe de Mantenimiento llevaba desde el bloque 34 sin `role.manage` en la base local: no podía abrir la pantalla de Roles y nadie se enteró, porque un permiso que falta no da error. Existe ya `diagnostico:roles`, pero **hay que ejecutarlo contra Pisco antes de la presentación**.
2. **La pantalla deja armar un rol marcando cuarenta casillas** y no avisa de que acabas de darle a Producción el módulo de infraestructura entero. Pasó. El bloque 42 lo cierra para las plantillas de la semilla, pero **un rol creado a mano en producción sigue pudiendo salir incoherente**.

## 23. Ámbito por tren *(bloque 42)*

**Qué hace.** Un rol marcado como sectorizado sólo ve su tren. Sin tren asignado, no ve nada.

**Por qué existe.** Aceros Arequipa es celoso con la información: que el jefe del Tren 1 vea el Tren 3 no es ruido en pantalla, es información que sale de su área.

**A favor.** **Falla hacia el lado seguro.** Antes un ámbito vacío significaba «toda la planta» — un dato que falta leído como permiso total. Y la comparación va por una única función: la versión anterior comparaba por subcadena, así que un ámbito de «T1» habría alcanzado también a un futuro «T10».

**En contra.** El ámbito es **un campo por usuario que alguien tiene que mantener**. Si el Jefe de Tren 2 pasa al 3 y nadie lo cambia, sigue viendo el que no es. Por eso el tren va escrito en el título de cada pantalla — se ve en un segundo — pero **no hay nada que lo verifique solo**.

## 24. Auditoría (`audit`)

**Qué hace.** Quién hizo qué, cuándo, desde qué IP y desde qué equipo.

**Por qué existe.** Es la prueba. Y en un sistema donde el Jefe firma cierres y aprueba alturas, hace falta.

**A favor.** Es lo único que **no se borra nunca**, ni con el vaciado definitivo.

**En contra.** Crece sin límite y **no tiene política de retención**. En dos años será la tabla más grande de la base y nadie lo habrá decidido.

## 25. Limpieza y purga (`purga`)

**Qué hace.** Borrado definitivo de basura y «Dejar la base vacía» antes del despliegue real.

**Por qué existe.** El día del despliegue la base tiene que estar limpia: sólo usuarios, roles, permisos y catálogos.

**A favor.** Doble llave —permiso amplio más `purga.definitiva`— y frase de confirmación. Y enseña la lista completa antes de tocar nada.

**En contra — pendiente de tu decisión.** **No borra gabinetes ni tableros eléctricos.** Después de un vaciado quedan gabinetes sin nada dentro. No lo toqué porque decidir si un gabinete es «planta» (como las ubicaciones, que se conservan) o «dato operativo» es una decisión tuya, no mía.

## 26. Equipos conocidos (`equipos`) y control de acceso por dispositivo (`acceso`)

**Qué hacen.** Registro de PCs conocidos y qué aparatos pueden entrar.

**Por qué existen.** Una IP en la auditoría no dice nada; «el PC del púlpito del Tren 2» sí.

**A favor.** Convierte la auditoría en algo legible por una persona.

**En contra.** Otra tabla que alguien mantiene a mano y que envejece.

---

# GRUPO F · Lo montado y todavía apagado

Aquí está la deuda más honesta del sistema: **módulos completos que no están conectados a nada**.

| Módulo | Estado real | Qué falta |
|---|---|---|
| **Monitoreo** (`monitoreo`) | Montado, esperando a TI | **El agente.** Sin él no se sabe la hora de caída de ninguna cámara. Es lo que más valor añadiría hoy. |
| **Notificaciones** (`notificaciones`) | Montado y apagado | El token de Telegram. Sin él los avisos no salen. |
| **Integración** (`integration`) | Andamiaje | SAP, HikCentral, Zabbix y Active Directory. Nada conectado. |

**A favor de haberlos montado.** Cuando TI dé el visto bueno, se enciende con una variable de entorno en vez de un proyecto.

**En contra.** Son cuatro módulos de código que **hoy no hacen nada** y que hay que mantener igual. Si TI dice que no en tres meses, hay que retirarlos, no dejarlos ahí.

---

# GRUPO G · Análisis y salida

## 27. Indicadores (`indicadores`)

**Qué hace.** MTTR, MTBF, disponibilidad, backlog, cumplimiento.

**Por qué existe.** Es el lenguaje de un comité de mantenimiento.

**A favor.** **«Sin datos, nunca cero.»** El MTBF necesita dos fallas para existir; con una devuelve «sin datos», no un número. Un indicador inventado en un comité es peor que no tenerlo.

**En contra.** **Va a estar casi entero en «sin datos» durante semanas.** Es correcto y es incómodo de enseñar. Conviene no llevarlo a la presentación.

## 28. Riesgo (`riesgo`)

**Qué hace.** Dónde no vamos a poder arreglar: repuesto que sostiene una zona vital y no está en stock; modelo sin recambio en el mercado.

**Por qué existe.** El sistema sabía responder «qué está roto» y «qué toca mantener». No sabía responder la que se hace en el comité: **«¿qué se va a romper y no vamos a poder arreglar?»**

**A favor.** Un equipo sin fecha de instalación **no sale en verde**: sale como «sin datos», con su propia tarjeta y su propia tarea concreta.

**En contra.** Depende de zonas vitales declaradas y de fichas completas. Con la planta a medio cargar, **la mitad va a salir en gris**.

## 29. Exportación (`exportacion`) y Documentos (`documents`)

**Qué hacen.** Descarga a Excel y almacenamiento de planos, manuales y respaldos de configuración.

**Por qué existen.** Porque la gente vive en Excel, y porque los manuales están en el correo de alguien.

**A favor.** Excel es la forma más rápida de que un jefe se lleve el dato a su reunión sin pedir permiso a nadie.

**En contra.** Los archivos van a MinIO y **el bucket externo de respaldo todavía no está**. Hoy los documentos viven en un solo sitio.

---

# Las cinco cosas que yo mejoraría primero

Ordenadas por lo que devuelven, no por lo que cuestan.

**1. Instalar el agente de monitoreo.** No es código: es TI. Desbloquea la hora de caída real, y con ella la mitad de «Mis cámaras», el MTTR de verdad y los avisos. **Es la mejora con más impacto de toda la lista y no depende de mí.**

**2. Que Producción declare 2 o 3 zonas vitales.** Media hora de reunión. Desbloquea Mi cobertura, Riesgo y la priorización de todo el sistema.

**3. Ejecutar `diagnostico:roles` contra la base de Pisco.** Ya encontró un permiso perdido desde el bloque 34 en la base local. La de producción no la ha mirado nadie.

**4. Cargar 20 o 30 activos reales de un solo tren antes de la presentación.** Todo lo probado hasta hoy son datos inventados, y los datos inventados son limpios. Media hora que vale más que cualquier bloque nuevo.

**5. La prueba de arranque en CI.** Es el único hueco técnico que ya causó una caída real: una dependencia no declarada que compila, pasa los tests y revienta al levantar. Hoy la única prueba de que la aplicación arranca es que Railway lo intente — en el peor momento posible.

---

# Lo que NO haría todavía

- **Los gráficos de tendencia.** Sin datos salen vacíos, y un gráfico en blanco en una presentación se lee como que el software no funciona.
- **NestJS 10 → 11.** Cierra siete avisos moderados y no arregla nada que se vea. Después del despliegue.
- **Aplicar el patrón de pantalla a las 40 restantes.** Están medidas y con trinquete: no pueden empeorar. Se van mejorando cuando se toque cada una por otro motivo.
- **Integrar con SAP.** Es el que más valor tendría a un año vista y el que más depende de permisos que todavía no hay.

---

*Documento de análisis interno · SGIT-CCTV · Aceros Arequipa, Planta Pisco*
