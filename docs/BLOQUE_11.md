# Bloque 11 — «Lo que se ve»

**Alcance cerrado. Cuatro entregas. Cero migraciones.**

---

## Por qué este bloque y no otro

Las cuatro cosas de aquí abajo tienen tres propiedades en común, y por eso van
juntas:

1. **Se ven.** Abres la aplicación y están ahí. Se pueden enseñar al ingeniero
   sin explicar nada técnico.
2. **Son aditivas.** Añaden pantalla o botón. Ninguna cambia el comportamiento
   de algo que ya funciona.
3. **No tocan el esquema de datos.** **Cero migraciones en todo el bloque.**

Ese tercer punto es el importante: de los incidentes graves que ha tenido este
proyecto, la mayoría vinieron de migraciones. Un bloque sin migraciones es un
bloque que no puede romper la base.

**Tampoco se toca autenticación.** Es el único módulo cuyo fallo no degrada el
sistema: lo apaga.

---

## Las cuatro entregas

### 11.0 · Cerrar el bloque 6
**Estado:** listo, esperando aplicarse.
El arreglo del `build` (`Asset.model`, no `Asset.name`) más el verificador de
campos de Prisma. Ya está empaquetado en `APLICAR_SIN_GIT`.

*Sin esto no se puede seguir: el backend no compila.*

---

### 11.1 · Descargar a Excel
**Qué se ve:** un botón **«Descargar Excel»** en Activos, Órdenes, Inventario,
Incidencias y Gabinetes. Y en un sitio central, un **libro completo** con una
hoja por tabla.

**Para qué sirve, en orden de uso real:**
- Llevarse la información a una reunión sin acceso al sistema.
- Pasarle datos al ingeniero Juan y a SAP.
- Una copia legible por una persona, que sobrevive a cualquier cosa que le pase
  a la nube.

**Lo que no promete:** volver a subir el Excel **no reconstruye el sistema**.
Son 52 tablas enlazadas por identificador. La reimportación se ofrecerá sólo
para catálogos y datos maestros, donde volver a subir es seguro.

**Riesgo:** muy bajo. Módulo nuevo, sólo lectura. Añade una dependencia
(`exceljs`), que es la única cosa del bloque que toca `package.json`.

---

### 11.2 · Confirmar antes de borrar, con recuento
**Qué se ve:** al borrar un gabinete o una ubicación, un aviso que dice **lo que
se va a llevar por delante**:

> *«Borrar el gabinete R-03 eliminará también 14 cámaras, 3 enlaces de red y
> 8 puertos de switch. Esto no se puede deshacer.»*

**Por qué:** hay **36 relaciones en cascada** en el esquema y **sólo `Asset`
tiene borrado lógico**. Los otros 51 modelos borran de verdad. Hoy el sistema
no avisa de nada de eso.

Esto no arregla el diseño — lo pone delante de los ojos justo antes de pulsar,
que es donde sirve. Arreglar el diseño (borrado lógico en todo) sería una
migración, y este bloque no lleva migraciones.

**Riesgo:** bajo. Un endpoint que cuenta, y un aviso.

---

### 11.3 · El QR abre la orden de un toque
**Qué se ve:** el técnico escanea el QR del gabinete o del activo y, además de
la ficha, tiene un botón **«Abrir orden aquí»** que crea la OM con el equipo,
la ubicación y el tren ya puestos.

**Por qué:** hoy el QR informa. Con esto, actúa. Es la diferencia entre una
etiqueta bonita y una herramienta de campo — y ahorra teclear en el móvil con
guantes, que es donde se abandona el sistema.

**Riesgo:** bajo. Reutiliza el alta de OM que ya existe y está probada.

---

### 11.4 · Cierre del bloque
Documentación de cada entrega, `ESQUELETO_DE_BLOQUES.md` al día, y el
`PLAN_MAESTRO.md` con lo que quede pendiente para el 12.

---

## Metodología — cómo se trabaja cada entrega

1. **Una sola cosa por entrega.** Nada de paquetes grandes: si algo falla, se
   sabe qué fue.
2. Escribo el código y verifico aquí todo lo que se puede verificar sin tu
   máquina.
3. Te llega un script que **escribe, verifica, compila y PARA**. No toca git.
4. **Tú lees el diff y escribes el commit.** Es tu punto de control.
5. Despliegas, lo abres, y me dices si se ve. Si no se ve, no está terminado.
6. Lo documento y cierro. Siguiente.

## Definición de terminado

Una entrega está hecha cuando cumple **las cuatro**:

- [ ] **Se ve** en pantalla y se puede enseñar sin explicar nada técnico.
- [ ] `npm run verificar` + `npm test` + `build` en **verde en tu máquina**.
- [ ] **Cero migraciones.**
- [ ] Documentada en `docs/` y marcada en el plan.

## Reglas del bloque

- **No se toca autenticación.**
- **No se toca el esquema de datos.**
- **Alcance congelado.** Lo que aparezca en el camino **no entra**: se anota
  para el bloque 12. Esta regla existe para que el bloque termine.

---

## Lo que NO está en este bloque, y está bien que no esté

| Queda fuera | Cuándo |
|---|---|
| Ola 0 de seguridad (rotar secretos, backups, PITR) | **En paralelo, la haces tú en el panel.** No es trabajo de código |
| Campañas de mapeo (bloque 9) | Bloque 12 |
| Borrador sin señal | Bloque 12 |
| Ámbito por identificador, 2FA, dispositivo | Después del estreno |
| Ventanas de parada | Bloqueado por decisión del ingeniero |
| Triggers, réplica, respaldo de MinIO | Descartado o más adelante |
