# SGIT-CCTV — Manual del ingeniero

**Aceros Arequipa · Planta Pisco · Laminación (Trenes 1, 2 y 3)**

Este documento responde dos preguntas, en este orden:

1. **¿Qué hace el software?** — explicado sin tecnicismos.
2. **¿Qué tiene que hacer el ingeniero para ponerlo en marcha y mantenerlo vivo?**

No describe lo que el sistema hará algún día. Describe lo que hace hoy. Al final
hay una lista honesta de lo que todavía no está.

---

## PARTE 1 — Qué hace el software

### El problema que resuelve

Hoy la información del CCTV de Laminación vive repartida: qué cámara está caída
está en la cabeza de quien la vio, el trabajo hecho está en un cuaderno o en un
WhatsApp, el repuesto que se usó no queda registrado en ningún sitio, y cuando
Producción pregunta "¿cómo está mi tren?" hay que ir a mirar.

SGIT-CCTV junta todo eso en un solo sitio y hace que **cada cosa que pasa deje
rastro**: quién, cuándo, en qué equipo, con qué repuesto y con qué resultado.

### La idea central: el árbol de planta

Todo el sistema cuelga de una estructura:

```
Planta Pisco
  └── LAMINACIÓN
        ├── Tren 1
        │     ├── Etapa (horno, desbaste, acabado, enfriamiento...)
        │     │     └── Zona
        │     │           └── Gabinete
        │     │                 └── Cámara / NVR / Switch
        │     └── ...
        ├── Tren 2
        └── Tren 3
```

Esto importa porque **el tren y la etapa de un equipo no se escriben a mano**: se
deducen de dónde cuelga. Si mueves un gabinete de sitio, todo lo que hay dentro
cambia de tren solo. Y de ahí sale automáticamente la **criticidad** del equipo y
cada cuánto toca revisarlo.

### Los cinco flujos de trabajo

**1. Algo se rompe → Incidencia.**
Cualquiera con permiso reporta que un equipo está caído. Queda con fecha, autor y
equipo afectado.

**2. La incidencia se convierte en Orden de Mantenimiento (OM).**
Hay cuatro tipos: **correctiva** (se rompió), **preventiva** (toca por
calendario), **predictiva** (los datos dicen que va a fallar) y **de mejora**.

**3. El ingeniero asigna. El técnico detalla y ejecuta.**
El ingeniero decide quién y cuándo. El técnico, desde el móvil, registra el
avance, adjunta fotos, retira repuestos del almacén y anota **síntoma, causa y
acción** eligiendo de un catálogo (no texto libre — así después se puede contar
qué falla más).

**4. Se cierra y se firma.**
Sólo quien tiene permiso de cierre puede firmar. Al cerrar sale un **informe PDF**
con fotos y firmas, y —si Telegram está activo— se manda solo.

**5. Todo queda auditado.**
Cada acción se guarda con nombre y hora. La auditoría es consultable.

### Lo que además vigila solo

- **Estado por tren**: un semáforo por tren y etapa, en vivo.
- **Mi tren**: si a un usuario le asignas un tren, ve sólo el suyo.
- **Mi bandeja**: lo que espera una decisión suya hoy. Es la pantalla con la que
  se empieza el día.
- **Preventivo automático**: llegada la fecha, la OM se crea sola.
- **Puntos críticos de la red**: calcula qué equipo, si cae, deja más cámaras sin
  llegar al grabador. Un anillo de fibra bien montado da impacto CERO — y eso es
  la prueba de que el cálculo es correcto.
- **Mapa de la red**: dibujo real de cómo está conectado todo, por saltos hasta
  el grabador.
- **Monitoreo**: compara lo que dicen los grabadores con lo que hay registrado y
  marca lo que no cuadra.
- **QR por activo y por gabinete**: se escanea con el móvil y sale la ficha del
  equipo, su historial y sus órdenes abiertas.
- **Trabajo en altura**: solicitud y autorización dentro del sistema. Es una
  decisión de seguridad y queda firmada.
- **Almacén**: repuestos, mínimos, y retiro ligado a la OM que lo consumió.
- **Avisos por Telegram**: al cerrar o poner en espera una OM, y un resumen
  diario a las 07:00.

---

## PARTE 2 — Qué debe hacer el ingeniero

El ingeniero es **el dueño del sistema**. Nadie más decide estas cosas. Se divide
en dos: lo que se hace **una vez** (puesta en marcha) y lo que se hace **siempre**
(día a día).

### A. Puesta en marcha — en este orden

El orden importa: cada paso necesita el anterior.

#### Paso 1 — Roles

`Roles y permisos` → hay **cuatro plantillas listas**: Jefe de línea
(Producción), Técnico de red, Contratista y Consulta. Se parte de una y se
ajusta.

> **Regla:** no marcar permisos "por si acaso". `Ver credenciales` da acceso
> directo a las contraseñas de las cámaras. `Administrar usuarios` permite a esa
> persona darse a sí misma cualquier permiso.

#### Paso 2 — Usuarios y ámbito

`Usuarios` → crear cuenta, asignar rol y —importante— asignar **ámbito de tren**.
Un usuario con ámbito Tren 2 ve Tren 2. Un usuario sin ámbito lo ve todo.

> **Ojo:** los permisos viajan dentro de la sesión. Si cambias el rol a alguien
> que ya está dentro, **tiene que cerrar sesión y volver a entrar** para que le
> aparezcan las opciones nuevas. Esto explica el 90% de los "no me sale el menú".

#### Paso 3 — Ubicaciones

`Ubicaciones` → construir el árbol: Tren → Etapa → Zona → Gabinete.
**Este paso es el cimiento.** Sin él, todo lo demás queda sin tren y sin
criticidad.

#### Paso 4 — Activos y gabinetes

`Activos` → dar de alta cámaras, NVR y switches colgándolos de su ubicación.
`Gabinetes` → registrar los gabinetes e imprimir sus **etiquetas QR**.

#### Paso 5 — Enlazar la red

`Puntos críticos de la red` → decir qué está conectado con qué (cámara → switch →
switch → grabador). **Sin esto el mapa sale vacío y el cálculo de impacto no
funciona.** Es el paso que más se olvida.

#### Paso 6 — Catálogos de planta

`Catálogos` → cargar los **síntomas, causas, acciones y motivos de espera** reales
de Laminación. Vienen vacíos a propósito: son de la planta, no del programa. De
aquí sale luego el análisis de "qué falla más".

#### Paso 7 — Rutinas preventivas

`Preventivo` → definir, por tipo de activo, qué se revisa y cada cuánto. A partir
de ahí las OM preventivas se crean solas.

#### Paso 8 — Almacén

`Inventario` → repuestos y **stock mínimo**. El mínimo es lo que dispara el aviso.

#### Paso 9 — Telegram (opcional pero recomendado)

1. En Telegram, hablar con **@BotFather** → `/newbot` → nombre del bot.
2. BotFather devuelve un **token**.
3. En SGIT: `Avisos` → pegar el token → **Comprobar** → **Guardar**.
   El sistema pregunta a Telegram si el token es válido antes de aceptarlo.
4. Cada persona que quiera recibir avisos: abre el bot y escribe
   `/start SU-CÓDIGO`. El código se lo da el sistema en su perfil.

> El token **no se pega en el chat ni se enseña en capturas**. El sistema lo
> guarda cifrado y sólo vuelve a enseñar los 4 últimos caracteres.

#### Paso 10 — Comprobación

Con todo cargado: abrir `Estado por Tren` y `Puntos críticos`. Si el mapa dibuja y
los semáforos tienen sentido, el sistema está en servicio.

### B. Día a día del ingeniero

| Cuándo | Qué hace |
|---|---|
| Al llegar | Abre **Mi bandeja**: lo que espera decisión suya |
| Durante el día | **Asigna** las OM nuevas a técnico y fecha |
| Cuando se lo piden | **Autoriza trabajo en altura** (decisión de seguridad, queda firmada) |
| Al terminar un trabajo | **Cierra y firma** la OM → sale el informe PDF |
| Semanal | Revisa **Puntos críticos**: qué equipo dejaría más cámaras ciegas |
| Semanal | Revisa **Monitoreo**: qué no cuadra entre grabador y registro |
| Mensual | Revisa **Diagnóstico**: qué falla más y cuánto se tarda en repararlo |
| Cuando cambie la planta | Ajusta **Ubicaciones** y **Catálogos**. El sistema no adivina |

### C. Lo que sólo puede hacer él

- Cerrar y firmar órdenes.
- Autorizar trabajo en altura.
- Crear roles y decidir qué puede hacer cada uno.
- Ver y cambiar las credenciales de cámaras y grabadores.
- Consultar la auditoría.

---

## PARTE 3 — Lo que todavía NO está

Dicho claro para que no se prometa lo que no hay:

| Falta | Qué significa | Qué se necesita |
|---|---|---|
| **Ventanas de parada** | El sistema no sabe cuándo para el tren, así que no programa el preventivo para esa ventana | Decidir de dónde salen las paradas: ¿manual, Producción o SAP? |
| **Rejilla de canales del NVR** | No se ve canal por canal qué grabador tiene qué | En desarrollo (bloques 6a/6b) |
| **QR que abre una OM directa** | Hoy el QR muestra la ficha; todavía no abre la orden de un toque | Bloque 5b |
| **Campañas de mapeo** | Salir a levantar la planta por zonas con avance medido | Bloque 9 |
| **Importación SAP** | La correspondencia de columnas del Excel de SAP | Hace falta un export real de SAP |

---

## Anexo — Preguntas que van a salir

**"No veo una opción del menú."**
Cerrar sesión y volver a entrar. Los permisos viajan en la sesión.

**"El mapa de la red está vacío."**
Falta el Paso 5: enlazar los equipos entre sí.

**"La página se quedó en blanco."**
Ya no debería. Si pasa, sale un recuadro con el detalle del error y un botón para
copiarlo — **ese texto es lo que hace falta para arreglarlo**. Sin él hay que
adivinar.

**"¿Puede entrar un contratista?"**
Sí, con el rol Contratista: sólo ve y trabaja las órdenes que se le asignen.

**"¿Y si alguien borra algo por error?"**
La auditoría guarda quién hizo qué y cuándo. Borrar un activo sí pierde su
historial: por eso ese permiso lo tiene muy poca gente.
