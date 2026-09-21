# Plan de bloques · 21/09/2026 — la noche antes de la presentación

Sale de los cuatro paseos del usuario: `docs/PASEO_20260920_HALLAZGOS.md`,
`CLAUDE.md` §57 a §60.

---

## Lo que él vio, y tiene razón

> *«Creo que gran parte de los problemas vienen siendo parte solamente de
> reestructurar o reubicar el tema de las visualizaciones.»*

**Es exactamente eso.** De las ~40 observaciones de los cuatro paseos:

| Naturaleza | Cuántas | Toca el modelo | Riesgo |
|---|---|---|---|
| **Mover, renombrar, fusionar o quitar pantallas** | 12 | No | Bajo |
| **Enlazar cifras con su módulo** | 9 | No | Bajo |
| **Legibilidad de tablas y botones** | 7 | No | Bajo |
| **Flujos nuevos** (extensión, subtipos, instalaciones) | 8 | **Sí** | **Alto** |
| **Bugs** | 4 | No | 2 ya arreglados |

**Tres cuartas partes son reubicación.** Por eso el software «se ve» mal
teniendo los datos bien: la información está, pero repartida donde nadie la
busca.

---

## La regla que ordena la noche

**No se toca el modelo de datos la noche antes de una presentación.** Un
`schema.prisma` nuevo pide migración, y una migración que falla a las once de
la noche no deja demo. Todo lo de esta noche es **frontend y rutas**: si algo
sale mal, se ve en el acto y se revierte en un minuto.

Lo que toca modelo va al **GRUPO C**, después de presentar.

---

# GRUPO A · Reestructurar la visibilidad — ESTA NOCHE

## Bloque 130 · Un nombre, un sitio

Cada cosa con el nombre de lo que hace, y en la sección de quien decide con
ella. Sin código nuevo: menú, rótulos y rutas.

| Hoy | Pasa a | Por qué (palabras suyas) |
|---|---|---|
| **Catálogos** (dentro de Ubicaciones) | **Catálogo de fallas**, en Gestión del mantenimiento | *«Corto, falla eléctrica, conector… ¿por qué eso va en Ubicaciones?»* Es el cierre de OM |
| **Etapas del proceso** | **Etapas y frecuencia** | No es una ubicación: manda el ambiente, la criticidad mínima y cada cuántos días toca el preventivo |
| **Calidad de datos** | A **Gestión del mantenimiento** | *«Eso debería estar en gestión de mantenimiento»* — y la pantalla ya reparte los huecos entre campo, mantenimiento y red |
| **Inventario** | **Repuestos** | *«Inventario y Estructura de activos se pueden malinterpretar»* |
| **Estructura de activos** | **Activos de planta** | *«¿Por qué hay siempre repetición de títulos? Criticidad de activos, Estructura de activos… es confuso»* |
| **Avance del mapeo** | **Estado de la información** | *«Eso se podría cambiar por información general del estatus»* |
| **Mi cobertura** | **Zonas críticas** | *«Poner zonas críticas, algo que sea entendible»* |
| **Zonas vitales** | Se funde en Zonas críticas | Es la misma pantalla dos veces. La **declaración** se queda como acción del módulo |
| **Estado por Tren** | Se funde en **Resumen de planta** | *«Ni siquiera yo sé cómo sustentarlo»*. Mis cifras repetidas en tres sitios |
| **Campañas de mapeo** | **Fuera del menú** | *«El mapeo debe ser sólo una OM»* |
| **Ventanas de parada** | **Fuera del menú** | Las paradas las decide Producción y cambian solas; el dato se mueve dentro de la OM (bloque 138) |

**Lo protege:** `verificar:menu` (ninguna pantalla huérfana) y
`verificar:titulos` (cabecera y lector dicen lo mismo). Nada se borra: las
rutas siguen vivas, sólo dejan de estar en el menú.

**Resultado:** el menú pasa de 50 entradas a unas 44, y ninguna repite concepto.

## Bloque 131 · Los cuatro menús son resumen y puerta

`CLAUDE.md` §58. **Mi bandeja · Mis cámaras · Mis activos · Zonas críticas**
**ven y mandan, no hacen.**

- **Fuera de ellos:** descargar informes, generar OM, declarar nada.
- **Dentro:** desplegables con información, y enlaces que dejan el módulo
  destino **ya filtrado por el problema del que se venía**.
- **Mis activos** deja de ser lista y pasa a **árbol de dependencias**: tren →
  área (eléctrica, sala, púlpito) → equipo padre → lo que cuelga. Con **la causa
  arriba**: si la antena cayó, los de abajo están *sin servicio por ella*, no
  averiados. Desplegable, arranca cerrado, con el recuento en la cabecera.
- **Acotado por tren**, salvo Mantenimiento y TI, que ven todo.
- **Sin IP ni credenciales**: estos cuatro los ve Producción.
- **«Declarar cómo se llega» sale de aquí** → Activos de planta. *«Es
  información confidencial y sólo la modifica Mantenimiento.»*

## Bloque 132 · Ningún dato resaltado se queda en el aire

`CLAUDE.md` §57.1. **Si está en negrita, se puede tocar. Si se puede tocar,
lleva a donde se arregla.**

1. **Inventario primero:** barrido de todas las cifras destacadas del sistema →
   *qué acusa · dónde se arregla hoy · a qué módulo debe llevar*.
2. **Enlazar**, empezando por las que él señaló:
   - Riesgo de activos: los cinco recuadros dicen «pulsa para ver sólo estos» y
     **no llevan a ninguna parte**.
   - Estado por Tren: los chips no responden.
   - Resumen de planta y los titulares de las pantallas de Producción.
3. **`verificar:enlaces` (verificador 28):** ninguna pantalla puede pintar una
   cifra destacada sin destino. Probado reintroduciendo el fallo.

## Bloque 133 · Que las tablas se lean

- **Órdenes:** la columna ACTIVIDAD resume en una línea; los catorce pasos de la
  hoja de ruta se ven al abrir la orden, no en la celda.
- **Los siete botones por fila** se agrupan: dos principales y el resto en un
  menú de fila. *«Los botones, esto está feo… imagínate cómo sale en una
  laptop.»*
- **«En proceso» en una sola línea**, no partido en dos.
- **Botones que no se salen de su sitio.**
- **Todos los buscadores buscan al escribir**, sin pulsar «Buscar» (Criticidad,
  Equipos retirados, Gabinetes, Activos de planta).

## Bloque 134 · Que no se vea suciedad en la demo

- **Imagen rota** del campo de visión → marcador propio *«Sin campo de visión
  cargado»* con opción de subirlo.
- **Activo de prueba «waeaweaw / ewaea aweawe»**: no se borra nada —se marca
  como dato de prueba y se filtra de las pantallas, o lo retira él con su
  criterio.
- **Lenguaje sin jerga** en Impacto de una caída: «protegido por el anillo» →
  *«si se cae, las cámaras siguen viéndose: la red tiene camino alternativo»*; y
  el titular por el efecto primero: *«Grabador AA-NVR-T1-R01-001 caído — 1
  cámara sin grabar»*.
- **Gabinetes** deja de estar vacío: filtro por tren, buscador que hable de
  tren/ubicación/referencia, y **qué cuelga de este gabinete**.

---

# GRUPO B · Ya hecho hoy

- **Bloque 128 ·** «Avance de órdenes» reventaba (`Cannot access 'B' before
  initialization`): `titular()` leía `r` antes de declararlo. Arreglado, con
  **`verificar:tdz`** probado reintroduciendo el fallo.
- **Bloque 129 ·** El menú se apagaba al abrir una pestaña. Ahora lee la misma
  tabla que dibuja las pestañas.

---

# GRUPO C · Toca modelo o permisos — DESPUÉS de presentar

| Bloque | Qué | Por qué espera |
|---|---|---|
| **135** | **Extensión de OM con visto bueno** del supervisor; se retira «fuera de plazo» | Estado nuevo + permiso. Primera piedra del doble visto bueno |
| **136** | **Tipo → subtipo → el formulario se arma solo** y se autocompleta | La idea que ordena todo (§60.1). Campo nuevo + formularios por tipo de activo |
| **137** | **Instalaciones:** Producción solicita, el técnico completa **en campo, desde el móvil** (materiales, zona, manlift, 220 V, caja de paso, tuberías, canalización) | Modelo + pantalla móvil |
| **138** | **La parada se declara dentro de la OM** («empezó parada / estamos empezando a tal hora») | Campos nuevos en la OM |
| **139** | **Incidencias:** Producción crea sólo en su tren; el formulario se parte — quien reporta describe el síntoma, el técnico completa después | Permisos + formulario |
| **140** | **Grúas:** la inspección genera OM, **QR de cámara de grúa**, y sus equipos entran en Criticidad | Modelo |
| **141** | **Mejoras propuestas:** formulario del técnico → lo leen las tres áreas → **PDF detallado** | Modelo + PDF |
| **142** | **QR segmentado** por tren o zona al imprimir | *«Imagínate cuánto papel»* |
| **143** | **Pantalla para apagar la generación automática** de preventivos | El interruptor ya existe (`PREVENTIVE_AUTOGEN`), falta pantalla |
| **144** | **Accesibilidad:** la ve el técnico, columnas juntas, y enseña el orden | Permiso |
| **145** | **Switch capa 2 / capa 3, gestionable, VLAN** en su formulario | Migración + `prisma generate` |

---

# A propuesta, no a código

Zabbix y el enlace agente→incidencia · correo · mensajería interna como
**derivaciones con estado** (nunca chat). Cada una con qué aporta, qué exige y
quién debe aprobarla.

---

# El orden de esta noche

**130 → 133 → 134 → 132 → 131**

Los tres primeros son los que cambian la impresión entera y no pueden romper
nada. El 132 depende del inventario de cifras. El **131 es el más grande** —el
árbol de dependencias— y va al final a propósito: si no entra esta noche, no
deja cojo a ningún otro.
