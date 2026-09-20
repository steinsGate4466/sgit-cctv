# Bloque 121 · Elegir el equipo

> *«He visto un formulario que sale switch, switch, pantalla, no sé qué, cuando
> el formulario es de otra cosa.»*

---

## 1 · Lo que encontré

**Diez formularios** pintaban la lista de activos plana: cuatrocientos equipos
de catorce tipos, ordenados por código. Una cámara, un switch, una pantalla y
un teléfono IP seguidos, sin nada que los separe.

La ficha por tipo (`AssetSpecFields`) sí filtraba. **Los otros diez, no.**

### Por qué es un fallo de datos y no de estética

El técnico busca la cámara `1262AT04`, ve `1262AP02` dos líneas más arriba y la
pulsa. La orden queda apuntada al equipo equivocado.

A partir de ahí **el historial de los dos está mal**: el del que no se tocó
—que acumula una intervención que no existió— y el del que sí, que se queda sin
ella. Y nadie lo descubre, porque no hay forma de saberlo mirando.

Es exactamente el margen de error humano que el software existe para cerrar.

---

## 2 · La regla: agrupar, no filtrar

La tentación era filtrar por tipo. **Sería peor.** Una incidencia puede ser de
cualquier equipo, y una lista filtrada dejaría fuera justo el que falló.

`<SelectorDeActivo>` **agrupa** con `<optgroup>`:

```
Cámaras
    1262AT04 · Lecho de enfriamiento
    1262AT05 · Lecho de enfriamiento
Switches PoE
    1262SW01 · Gabinete 1262
Pantallas de púlpito
    …
```

Sigue pudiendo elegirse cualquier cosa; ya no se confunde de familia.

Filtrar se hace **sólo cuando de verdad no cabe otro tipo** —el grabador de una
cámara es un NVR y no puede ser otra cosa—, y entonces se pasa `tipos`.

### Dos decisiones dentro del componente

**El orden de los grupos no es alfabético.** Es el de `TIPOS_ACTIVO`, que ya
está ordenado por lo que más se toca en planta: cámara, antena, switch,
grabador. Repetirlo aquí hace que el técnico encuentre lo suyo **en el mismo
sitio en todos los formularios**.

**Se enseña dónde está cada equipo.** Dos cámaras del mismo modelo en dos
trenes tienen códigos casi iguales. Lo que las distingue para quien está en
campo no es el código: es «lecho de enfriamiento» o «púlpito».

---

## 3 · Los ocho formularios corregidos

| Formulario | Qué se elige ahí |
|---|---|
| Asignar OM | El equipo que el ingeniero asigna |
| Detallar OM | El equipo sobre el que se va a trabajar |
| Equipos de la OM | Los que se apuntan (bloque 110-B) |
| Incidencias | El activo afectado |
| Órdenes (alta) | El activo de la orden |
| Preventivo | El activo del plan |
| Cableado | Origen y destino del tramo |
| Documentos · Inventario | Equipo del documento y del repuesto |

---

## 4 · `verificar:selector-activo` — verificador 26

Ningún `<option>` puede pintarse iterando una lista de activos dentro de un
`<select>`.

Exentos, con su motivo escrito: el propio componente, y `AssetSpecFields`
—donde el tipo del enlace es obligatorio y sólo cabe una familia, así que
agrupar no aportaría nada—.

No mira los desplegables de usuarios, ubicaciones o catálogos: no son equipos y
no tienen familias que confundir.

**Probado reintroduciendo el fallo.**

---

## 5 · Verde

```
frontend   26 verificadores VERDE · typecheck OK · lint 0 avisos
```
