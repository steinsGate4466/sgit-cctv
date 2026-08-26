# SGIT-CCTV · Qué hace cada módulo

**Aceros Arequipa — Planta Pisco · LAMINACIÓN (Trenes 1, 2 y 3)**
Agosto 2026 · 40 módulos de servidor · 52 pantallas · 942 pruebas

> Informe básico: una frase por módulo, en castellano y sin jerga.
> Agrupados por el **ciclo de mantenimiento**, no por orden alfabético,
> porque así es como se usan.

---

## ① Estructura de activos — qué hay y dónde está

| Módulo | Qué hace |
|---|---|
| **locations** | El árbol de planta: `Planta → LAMINACIÓN → Tren → Etapa → Zona → Gabinete`. Es la columna vertebral: de aquí se **deducen** el tren, la etapa, el ambiente, la criticidad y el intervalo preventivo de cada equipo. No se escriben a mano |
| **assets** | La ficha de cada cámara, grabador, switch o antena. Marca, modelo, IP, serie, estado. Es lo que abre el QR |
| **cabinets** | Los gabinetes y sus etiquetas imprimibles. Un gabinete agrupa lo que comparte corriente y espacio |
| **zonas** | Criticidad productiva de la zona y —lo importante— **cómo se interviene**: en marcha, con permiso eléctrico, con permiso de altura o con el tren parado. Va firmado con nombre y fecha |
| **equipos** | Registro de equipos conocidos de la red con su MAC declarada a mano (sacada de la reserva DHCP o del switch). Un servidor web **no puede leer la MAC** del cliente |
| **estandares** | El estándar de rotulado TIA-606-C: comprueba que los códigos que se escriben cumplen la norma |

## ② Criticidad y estado — qué está bien y qué no

| Módulo | Qué hace |
|---|---|
| **dashboard** | El tablero: estado por tren, cámaras caídas, zonas sin cubrir, puntos calientes. Todo **calculado en cada consulta**, nunca guardado |
| **indicadores** | Los números del mes: backlog, cumplimiento del preventivo, MTTR y el reparto correctivo / preventivo / predictivo |
| **riesgo** | Repuestos bajo mínimo y equipos que se están quedando obsoletos |
| **cobertura** *(pantalla)* | Qué zonas están vigiladas de verdad y cuáles se dan por vigiladas sin estarlo |
| **salud de datos** *(pantalla)* | Fichas incompletas: sin IP, sin ubicación, sin foto. Lo que hace que un indicador mienta |

## ③ Planeamiento — cuándo se toca

| Módulo | Qué hace |
|---|---|
| **preventive** | Los planes preventivos por tipo de equipo. El sistema **propone** las órdenes; **el Jefe decide** cuáles se crean. No se generan solas |
| **predictive** | Lo que anticipa una falla: termografía, degradación de imagen, reintentos de red |
| **paradas** | Las ventanas de parada de tren. Son **manuales** —Producción avisa por radio— y la hora se mueve. Por eso se guardan la hora **prevista** y la **real** por separado, y cada movimiento exige motivo |
| **procedimientos** | Los pasos escritos de cada trabajo, y las mejoras que propone quien los ejecuta |
| **checklist** | Rutinas de campo por tipo de equipo: lo que hay que mirar, en orden |

## ④ Ejecución — el trabajo del día

| Módulo | Qué hace |
|---|---|
| **incidents** | Las incidencias: síntoma, causa y acción **de catálogo**, nunca texto libre. Con texto libre no se puede contar después qué falla más |
| **maintenance** | Las órdenes de mantenimiento (OM). Nacen con fecha, se les anota el avance, y **sólo el Jefe de Mantenimiento las cierra** |
| **corrective** | El flujo correctivo: de la incidencia a la orden, y de la orden al cierre firmado |
| **troubleshooting** | El arranque de diagnóstico: si se cae **una** cámara empieza por su corriente; si se caen **todas**, es el switch |
| **inventory** | Almacén: repuestos, herramientas, retiro de material contra una OM, y carga desde el Excel de SAP |
| **instalacion** | Instalaciones nuevas: visita técnica, medición y aprobación. **Al cerrar nace el activo**, en la misma transacción |
| **campanas** | Campañas de mapeo: repartir zonas entre técnicos y medir el avance |
| **grua** | Las grúas y sus revisiones, que tienen su propia norma |
| **acceso / access** | Permisos de acceso físico: qué hace falta para llegar al equipo (escalera, andamio, manlift) y quién lo autoriza |

## ⑤ Red y energía — de qué depende cada cámara

| Módulo | Qué hace |
|---|---|
| **network** | El mapa de la red, armado **en cada consulta**. Calcula el impacto de una caída como **pérdida de alcance al grabador** — por eso un anillo de fibra bien montado da impacto CERO, que es la respuesta correcta |
| **ipam** | Direccionamiento IP: subredes, reservas y qué IP está libre de verdad |
| **electricidad** | Tableros, circuitos y mediciones de tensión, corriente y temperatura |
| **cableado** *(pantalla)* | Los tramos de cable y si cumplen la norma de longitud |
| **grabadores** *(pantalla)* | Los NVR y sus canales. Si un grabador **no declara** cuántos canales tiene, **no se inventa** |
| **credentials** | Las contraseñas de los equipos CCTV, cifradas. Nunca se muestran en claro |

## ⑥ Gobierno del sistema

| Módulo | Qué hace |
|---|---|
| **auth** | Entrada al sistema, renovación de sesión y cierre. Los permisos **viajan dentro del token**: cambiar un rol no surte efecto hasta cerrar sesión y volver a entrar |
| **users** | Personas, su rol y su **ámbito de tren**. Quien firmó algo se desactiva, nunca se borra |
| **roles** | Los roles y sus permisos, editables desde la interfaz. **Todo el control de acceso va por permisos, jamás por el nombre del rol** |
| **audit** | Quién hizo qué, cuándo y desde dónde. Se escribe **antes** de cada borrado, y la copia guarda el nombre del equipo de ese día |
| **purga** | Baja (conserva historial) y purga (borrado real). **Si hay una orden cerrada, no se purga**. Dos llaves: permiso *y* cargo |
| **notificaciones** | Avisos por Telegram cuando algo se cae |
| **monitoreo** | El agente que corre en los PC de púlpito y reporta si el equipo sigue vivo |
| **exportacion** | Descargar todo a Excel para llevarlo a una reunión |
| **integration** | La puerta hacia SAP. Hoy es manual: el código SAP se escribe a mano en la OM |
| **storage** | Las fotos y los informes, guardados en MinIO |
| **catalogos** | Los catálogos de síntomas, causas, acciones y motivos — **editables desde la interfaz**, sin tocar código |
| **documents** | ⚠️ **Cascarón vacío.** El modelo existe y los permisos existen, pero no hay pantalla. *Modelo + endpoint ≠ función* |

---

## Las pantallas de campo — el móvil del técnico

| Pantalla | Qué hace |
|---|---|
| **AssetScan** (el QR) | Se escanea el QR del equipo y sale **todo**: primero el aviso de cómo se interviene esa zona, luego la ficha, las órdenes abiertas, y los botones para anotar avance, abrir una OM o reportar avería |
| **CabinetScan** | Lo mismo para un gabinete: qué cuelga de él |
| **MiTren / MisActivos / MisCamaras** | Lo que le toca a cada uno según su tren |
| **Bandeja** | Lo que espera una decisión hoy |

---

## Lo que NO existe todavía

Dicho de frente, para que nadie lo dé por hecho:

1. **Hojas de ruta** (las *task lists* de SAP PM) — no hay entidad.
2. **Criticidad ABC con método**, y que el ABC decida la frecuencia del preventivo.
3. **Programación** que case hoja de ruta + frecuencia + ventana de parada.
4. **Evento de falla separado de la orden** — sin él, MTBF y MTTR son aproximaciones.
5. **Nivel de servicio** y **cumplimiento normativo** — dos de los cuatro indicadores del ciclo.
6. **Módulo de documentos** — permiso huérfano.
7. **Correo**: código de verificación y aviso de registro. Está en la presentación y **no hay una sola línea escrita**.
8. **Integración automática con SAP** — hoy el código se escribe a mano.
