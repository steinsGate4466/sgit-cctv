# SGIT-CCTV — Qué hace el software

**Aceros Arequipa · Planta Pisco · Laminación (Trenes 1, 2 y 3)**
Actualizado: 16 de agosto de 2026 · hasta el bloque 41

---

## 1. Qué problema resuelve

En Laminación hay cámaras que vigilan el proceso. Cuando una se cae, hoy pasa
esto:

- El púlpito lo nota **cuando lo nota**. Nadie sabe a qué hora dejó de ver.
- Se avisa por radio. No queda registro de a qué hora se avisó.
- Mantenimiento va. Producción no sabe si fueron, ni cómo va, ni qué falta.
- Cuando alguien pregunta «¿qué pasa con esa cámara?», la respuesta es «ya
  están viendo».

Este sistema convierte eso en un dato con hora, nombre y estado, que las tres
áreas —Producción, Mantenimiento y TI— miran en la misma pantalla sin pisarse.

---

## 2. Quién lo usa y qué ve cada uno

### Jefe de tren y jefe de producción — **miran, no tocan**

Pantalla **«Mis cámaras»**. Por cada cámara de su tren que no esté dando
imagen:

| Qué ve | Para qué le sirve |
|---|---|
| **La foto de a qué apunta** | «AA-CAM-T2-COL-004» no le dice nada; la imagen del campo de visión, sí |
| **Línea de tiempo con horas** | se fue → se reportó → orden abierta → trabajando, con el hueco entre cada paso |
| **Avance y última nota** | «60 % · hace 25 min: cable cortado en la bandeja» |
| **Qué material falta, con su código SAP** | para mover una compra el mismo día |
| **Hasta dónde se puede llegar** | en marcha, con permiso, o exige parada |
| **Por qué está parada** | «14 h esperando un repuesto, lo normal serían 48 h» |

**Ni un botón que cambie nada.** Es sólo lectura, y el backend lo respalda: el
endpoint acepta un solo verbo y exige `om.mirar`, una llave estrecha creada
para esto. Producción observa, Mantenimiento ejecuta, y esa frontera es la que
permite compartir pantalla sin fricción.

### «Activos por tren» — la pantalla del manlift

La otra mitad de la pregunta. «Mis cámaras» dice qué falla ahora; ésta dice
**qué hay en el tren, dónde está montado y cuánto de eso exige manlift**, que
es lo que Producción costea.

Los equipos salen agrupados por los tres sitios donde cambia la forma de
llegar: dentro de un **gabinete**, dentro de un **tablero eléctrico** o en
**campo**. Y arriba, lo único que se traduce en una decisión de gasto:

> «3 equipos con trabajo pendiente exigen manlift, y están en 1 punto: se
> pueden atender en 1 subida en vez de 3.»

Ése es el ahorro. Hasta hoy cada subida se pedía suelta y se pagaba suelta,
porque nadie tenía delante la lista que enseña que están en el mismo poste.

**No hay soles en ninguna parte.** Se cuentan equipos y subidas. Una tarifa
metida en el sistema envejece sola y a los seis meses da una cifra falsa con
aspecto de exacta; el número que Producción puede decidir es cuántas veces
sube el equipo.

**Y lo que nadie ha declarado sale en gris, nunca en verde.** El medio de
acceso se declara equipo por equipo —en la misma zona hay una cámara en la
pared a 2 m y otra en el poste a 8 m— y mientras nadie lo diga, el sistema no
supone que se llega a pie. Si lo supusiera, Producción vería un número bajo, lo
aprobaría, y el día del trabajo faltaría el manlift.

Declarar cómo se llega **no** es de Producción: es de quien instaló el equipo o
subió la última vez. Queda con nombre y fecha.

También tienen **«Mi cobertura»** (qué zonas están ciegas, ordenadas por lo que
duele) y **«Zonas vitales»**, la única pantalla donde Producción escribe: dice
qué zonas no pueden quedarse sin vista, y eso sube sola la prioridad de todas
sus cámaras.

### Ingeniero y jefe de mantenimiento

**«Mi bandeja»** — lo que espera una decisión, ordenado **por quién está parado
esperando**, no por cantidad. Un permiso de altura sin firmar deja a alguien al
pie de la escalera; una orden vencida ya lleva días.

**«Estado por Tren»** — el titular arriba, lo pendiente debajo, y ocho vistas
para explorar: cámaras, mapeo, cableado, grabadores, gabinetes, trabajos,
incidencias y accesos.

**«Riesgo»** — dónde no vamos a poder arreglar. Repuestos que sostienen zonas
vitales y no están en stock, y modelos sin recambio en el mercado.

### Técnico de campo — desde su propio teléfono

Escanea el **QR** del equipo y ve su ficha, si hay una orden abierta, el
procedimiento de restauración de ese modelo y las notas del turno anterior.

Registra avance, materiales y fotos. **Sin señal, lo registrado se guarda y
sube solo** al volver la red.

---

## 3. Los módulos

| Módulo | Qué hace |
|---|---|
| **Activos** | Inventario técnico: cámaras, NVR, switches, gabinetes. Con QR, fotos y ficha por tipo |
| **Ubicaciones** | El árbol de planta: tren → etapa → zona → gabinete. De aquí se derivan tren, ambiente y criticidad |
| **Incidencias** | Lo que se reporta, con categoría, prioridad y evidencia |
| **Órdenes (OM)** | Correctivo, preventivo, predictivo, mejora y mapeo. Con apertura y cierre **firmados** |
| **Preventivo** | Planes por activo con intervalo derivado del ambiente. Genera órdenes solo |
| **Almacén** | Repuestos con stock decimal, retiro desde la OM, conteo físico e importación de Excel |
| **Zonas vitales** | Producción declara qué se pierde si una zona se queda a ciegas |
| **Cableado** | Tramos con metros, y el aviso de los que pasan de 90 m |
| **Electricidad** | Tableros, circuitos y qué se cae si salta uno |
| **Red** | Puertos de switch, enlaces, canales de grabador y puntos críticos |
| **IPAM** | Subredes, direcciones libres y duplicadas |
| **Monitoreo** | Estado observado de la red: qué responde y qué no |
| **Instalaciones** | El ciclo de pedir una cámara nueva: solicitada → evaluada → aprobada → instalada |
| **Campañas de mapeo** | Repartir zonas entre técnicos y medir el avance del levantamiento |
| **Paradas** | Ventanas en las que se puede intervenir con la línea detenida |
| **Rotulado** | El estándar ANSI/TIA-606-C: generador y revisor de códigos, y el color de cable |
| **Riesgo** | Repuestos críticos y obsolescencia de equipos |
| **Avisos** | Telegram al técnico cuando se le asigna algo |
| **Auditoría** | Quién hizo qué, cuándo, desde qué IP y desde qué equipo |
| **Limpieza** | Borrado definitivo con dos llaves, y **«dejar la base vacía»** |

---

## 4. Las cuatro reglas que atraviesan todo

### 4.1 Los datos derivados no se guardan

Tren, etapa, ambiente, criticidad, intervalo preventivo, intervenibilidad y
estado efectivo **se calculan** recorriendo el árbol. No hay columna `tren` en
la tabla de activos.

Guardarlos sería más rápido, y significaría que mover una cámara de zona deja
su criticidad antigua pegada hasta que alguien se acuerde. Nadie se acuerda.

*Se ve en la demo:* la cámara se crea OPERATIVA y la incidencia abierta la pone
en CON_INCIDENCIA sola. Al cerrar la incidencia, vuelve sola.

### 4.2 «Sin datos» nunca es «bien»

- El MTBF exige **dos** fallos. Con uno devuelve `null`, no un número inventado.
- La cobertura de una zona sin cámaras devuelve `null`, no `0 %`.
- Un equipo sin fecha de instalación sale **SIN DATOS**, en gris. Ni verde ni rojo.
- Un material escrito a mano, sin código: no se dice que falte, se dice que no
  se puede saber.
- **La hora de caída sólo se declara si el agente de monitoreo la vio**, y con
  tres fallos seguidos. Sin agente se dice «reportada a las…», nunca «se cayó a
  las…». Entre las dos puede haber horas.

### 4.3 El control de acceso va por permisos, nunca por nombre de rol

39 permisos, 7 roles base, y roles nuevos que se arman desde la pantalla.

Renombrar un rol no rompe nada. Un verificador **falla el CI** si alguien
vuelve a escribir `role === 'Jefe de Mantenimiento'` en el código.

### 4.4 Nada irreversible con una sola llave

El borrado definitivo pide **dos permisos**: uno amplio y `purga.definitiva`,
que se concede aparte. Y hay que **escribir el código** del registro a mano.

---

## 5. Qué se comprueba solo

**704 pruebas automáticas en 45 suites.**

**16 verificadores propios.** Ninguno es de estilo: cada uno nació de un fallo
real que ni el compilador ni las pruebas vieron.

| Verificador | El fallo que lo trajo |
|---|---|
| Inyección de dependencias | Tumbó el arranque en producción. Compilaba y las pruebas pasaban |
| Filtros de Prisma | 400 en el tablero. La constante estaba anotada `: any` |
| Campos de Prisma | 200 bloques `select`; un campo inexistente revienta en la consulta |
| Migraciones | Esquema editado sin migración. Comprueba en ambos sentidos |
| Constructores | `new X()` sobre un módulo importado con `import *` |
| Roles y permisos | Encontró 11 desfases; entre ellos, que la semilla revocaba permisos |
| Node con soporte | Node 20 murió y el proyecto siguió 3 meses encima sin parches |
| Dockerfile | Arrancaba con `prisma db push`, que **puede eliminar columnas** |
| Ámbito por tren | Un `@SinAmbito()` robado de otra ruta (OWASP A01) |
| Cascada CSS | Propiedades declaradas dos veces con valores distintos |
| Foco | El cursor saltaba al primer campo con cada tecla |
| Diálogos del navegador | 117 ventanas grises con la dirección del servidor en el título |
| **Densidad de pantalla** | 9 454 palabras de texto encima de los datos |

Más una **prueba de calor** contra PostgreSQL real: 100 personas creando
órdenes a la vez, y 30 técnicos retirando del mismo repuesto.

---

## 6. Qué pasa cuando dos personas trabajan a la vez

Con dos o tres órdenes vivas, esto se cruza de verdad:

| Situación | Qué hace el sistema |
|---|---|
| Dos crean una OM en el mismo segundo | Reintenta con espera al azar. Las dos entran, con código distinto |
| El técnico avanza mientras el jefe cierra | **No la resucita.** 409 que dice en qué quedó |
| Dos cierran la misma orden | El segundo recibe aviso. No pisa la firma del primero |
| Tres retiran del mismo repuesto | El descuento lo hace PostgreSQL. Ni una pieza perdida |
| Dos jefes aceptan dos mejoras | Las dos quedan en el procedimiento |

Y las pantallas **se recargan al volver del bolsillo**, no cada 30 segundos: el
teléfono y los datos son del técnico.

---

## 7. Preparar la demo y dejar la base limpia

### Para enseñarlo

```
npm run demo:cargar
```

Carga **dos cámaras caídas** con prefijo `DEMO-`:

1. **Colada continua** — el caso bueno: técnico trabajando, 60 %, se puede
   resolver con el tren en marcha.
2. **Salida de horno** — el caso que le importa a Producción: parada esperando
   un inyector PoE que **no hay en almacén**, con su código de SAP.

### Antes del despliegue real

Pantalla **Limpieza → «Dejar la base vacía»**. Enseña qué se va a borrar,
exige escribir `DEJAR LA BASE VACIA`, y deja:

**SE BORRA** — activos, incidencias, órdenes, avances, materiales, almacén,
fotos, instalaciones, campañas.

**NO SE TOCA** — usuarios, roles y permisos (para poder entrar), el árbol de
planta, los catálogos, la configuración, y **la auditoría** (incluido el
registro de este mismo borrado).

---

## 8. Lo que falta

### Código

| Qué | Por qué importa |
|---|---|
| **Prueba de integración en CI** | Nadie comprueba que la aplicación arranque contra una base real |
| Aplicar el patrón a las 40 pantallas restantes | Cuatro están hechas; el resto tiene su tope anotado y no puede empeorar |
| Pruebas de `auth.service` | 283 líneas sin cubrir, y es la puerta |
| 27 claves foráneas sin índice | Con la base casi vacía no se nota; con meses de auditoría, sí |
| NestJS 10 → 11 | Cierra las 7 vulnerabilidades moderadas que quedan |

### Acciones de TI

1. **Instalar el agente de monitoreo.** Sin él no se sabe a qué hora se cayó
   una cámara, sólo cuándo alguien avisó — y la diferencia puede ser de horas.
2. **PITR en Railway antes de cargar datos reales**, y ensayar una restauración.
3. **Rotar la contraseña de PostgreSQL.**
4. **`CREDENTIAL_ENC_KEY`** — el backend no arranca en producción sin ella.
5. **Token de Telegram** — hoy los avisos están apagados.

### Acciones de Producción

Declarar **2–3 zonas vitales**. Sin eso, «Mi cobertura» y la mitad de Riesgo
salen vacías.

### Tras desplegar

Comprobar en **Roles** que existen y tienen sus permisos:

- **Jefe de Mantenimiento** → «Borrar definitivamente (sin vuelta atrás)»
- **Jefe de Producción** → «Mirar el trabajo sobre mis cámaras»

---

## 9. Seguridad

| | Críticas | Altas | Moderadas |
|---|---|---|---|
| Backend | 0 | **0** | 7 |
| Frontend | 0 | **1** | 3 |

Punto de partida: 13 altas. **Ni un solo `npm audit fix --force`**: todo son
*overrides* de versión menor o de parche, verificados con la suite completa.

Lo que queda son NestJS 10 —el parche está en la 11, salto mayor de framework—
y `vite`, que vive en la máquina que compila y nunca llega al navegador.

### En el teléfono del técnico

Es **su** teléfono, y eso cambia las reglas:

- Sesión de **30 minutos** en campo (15 en escritorio). El técnico camina
  varios minutos entre cámaras.
- **PIN** propio.
- Registro de dispositivo con tres modos: libre, avisar, estricto.
- Credenciales que **se ocultan solas a los 60 segundos**.
- **Al cambiar de aplicación se tapa lo sensible**, antes de que Android o iOS
  tomen la captura del conmutador.
- El jefe puede **cerrar todas las sesiones** de golpe.

---

## 10. Cómo se comprueba

```
cd backend
npm ci
npm run verificar        # los 13 verificadores del backend
npm run build
npm test                 # 704 pruebas
npm run prueba:calor     # concurrencia contra PostgreSQL real

cd ../frontend
npm ci
npm run typecheck
npm run lint
npm run verificar:dialogos
npm run verificar:densidad
npm run verificar:foco
npm run build
```

El CI de GitHub Actions ejecuta todo esto en cada push, más un trabajo que
levanta un PostgreSQL 18 —la misma versión mayor que producción— y aplica las
34 migraciones sobre una base limpia.
