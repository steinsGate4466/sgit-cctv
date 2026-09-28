# SGIT-CCTV · Reestructura tras la presentación (28/09/2026)

**Observaciones:** demasiados módulos, demasiadas letras, procesos enredados. Producción quiere un mapa.
> Numeración: el 146 ya era el QR del tablero eléctrico, así que la reestructura empieza en el 147.

**Regla:** no se borra ninguna pantalla. Se **agrupa**, se **acorta** y se **simplifica el proceso**. Ninguna ruta cambia.

---

## 1. Los módulos: de 48 entradas a 9

| # | Módulo | Pestañas |
|---|---|---|
| 1 | **Estado de planta** *(será Mapa)* | Resumen · Mi tren · Por tren · Mis cámaras · Zonas críticas · Impacto de una caída |
| 2 | **Trabajo** | Mi bandeja · Incidencias · Órdenes · Avance · Hojas de ruta · Grúas |
| 3 | **Equipos** | Activos · Mis activos · Criticidad · Instalaciones · Acceso y altura · Retirados · Estado de la información · Calidad de datos |
| 4 | **Red y energía** | Capacidad · Conexiones · Mapa de red · Puntos críticos · Grabadores · IP · Cableado · Rotulado · Electricidad · Monitoreo |
| 5 | **Ubicaciones** | Árbol de planta · Gabinetes · Zonas vitales |
| 6 | **Repuestos** | Almacén · Obsolescencia |
| 7 | **Documentos** | Manuales y planos · Catálogo de fallas · Mejoras propuestas |
| 8 | **Indicadores** | Dashboard · Exportar |
| 9 | **Ajustes** | Mi cuenta · Avisos · *(admin)* Usuarios · Sesiones · Roles · Equipos conocidos · Auditoría · Limpieza |

Dentro de cada módulo, lo que antes era una entrada del menú pasa a ser una **pestaña**.

## 2. Qué ve cada rol (lo deciden sus permisos; objetivo del bloque 148)

| Rol | Menú | Pantalla de inicio |
|---|---|---|
| **Técnico** | Estado de planta · Trabajo · Equipos · Red y energía · Documentos | **Mis trabajos** (sus OM de hoy) |
| **Producción** | Estado de planta · Trabajo *(solo reportar y ver avance)* | **Mapa de su tren** |
| **Mantenimiento** | Los 9 | **Mapa** + pendientes |
| **Admin** | Los 9 | Mapa |

> **Hoy (tras el 148):** con los permisos de la semilla, el Técnico ve 8 módulos, no 5: tiene `inventory.read`, `document.read`, `dashboard.read`… Dejarlo en 5 es **quitar permisos a un rol**, y esa decisión es de Cristhian, no del código.

## 3. Reglas de «menos letras»

1. **Una línea** de explicación por pantalla. El resto va plegado en «¿Cómo se calcula?».
2. Etiquetas de **3 palabras como máximo**.
3. Tablas de **6 columnas como máximo**. El detalle va en la ficha.
4. Por fila: **1 botón principal** y el resto en `⋯`.
5. **Color + ícono** para el estado, no frases.
6. Los formularios **piden solo lo que sabe quien los llena**. Lo demás lo completa otro después.

## 4. Los procesos, en pasos cortos

| Proceso | Quién | Pasos |
|---|---|---|
| **Reportar una falla** | Producción | Tocar el equipo en el mapa o escanear su QR → qué pasa → foto (opcional). Listo. |
| **Atender** | Técnico | Mis trabajos → abrir OM → checklist → foto → cerrar. La parada y la extensión se piden desde la misma OM. |
| **Preventivo** | Automático | Criticidad A/B/C → cada 30/60/90 días → hoja de ruta → la OM sale sola. |
| **Instalación nueva** | Producción → Técnico | Producción pide qué y dónde → el técnico completa en campo desde el móvil. |
| **Alta de equipo** | Mantenimiento | Tipo → subtipo → el formulario se arma solo. |
| **Mejora** | Técnico → 3 áreas | Propone en un formulario → lo revisan Producción, Mantenimiento y Técnica → PDF. |

## 5. Bloques, en orden

### Fase A · Ordenar (sin tocar datos, sin migración)

| Bloque | Qué | Resultado |
|---|---|---|
| **147** ✅ | Menú por módulos + pestañas | 9 entradas en lugar de 48; las pantallas del módulo salen como pestañas. Ninguna ruta cambia |
| **148** ✅ | Inicio por rol | Cada rol entra directo a su pantalla (técnico → sus trabajos, producción → su tren) |
| **149** 🟡 | Menos letras (Zonas e Incidencias listas; Órdenes 219→202) | Aplicar las reglas de la sección 3 a todas las pantallas; el verificador de densidad las vigila |
| **150** | Ficha única del equipo | Datos · Red · Energía · Acceso · Documentos · Historial · QR, en una sola pantalla |

### Fase B · Procesos simples (pendientes del grupo C)

| Bloque | Qué |
|---|---|
| **139** ✅ | Reportar falla en 3 pasos; Producción solo en su tren; el técnico completa después |
| **138** ✅ | La parada se declara dentro de la OM |
| **135** ✅ | Extensión de OM con visto bueno del supervisor |
| **136** | Tipo → subtipo → el formulario se arma solo |
| **137** | Instalaciones: Producción pide, el técnico completa en el móvil |
| **143** ✅ | Pantalla para prender y apagar los preventivos automáticos |
| **144** | Accesibilidad visible para el técnico, con el orden de trabajo |
| **140** | Grúas: la inspección genera OM, QR de cámara de grúa, entra en Criticidad |
| **141** ✅ | Mejoras propuestas → PDF detallado |
| **142** ✅ | QR segmentado por tren o zona al imprimir |

### Fase C · Plano Vivo (necesita el plano de un área)

| Bloque | Qué |
|---|---|
| **151** | Modelo `Plano` + subir, calibrar y colocar equipos |
| **152** | `/mapa` de lectura con estado real y tarjeta por rol |
| **153** | Capas y métricas: zonas, cobertura, impacto, cable vs 90 m, altura |
| **154** | «Estás aquí» con QR y ruta a pie |

Detalle: `docs/ARQUITECTURA_PLANO_VIVO.md`.

### Fase D · Después (a propuesta)

Correo (verificación y avisos) · agente de monitoreo o Zabbix · puente con SAP · revisar si los indicadores de ingeniería (MTBF, MTTR, nivel de servicio) ya usan el evento de falla.

---

## 6. Por qué este orden

- **A primero:** es lo que más cambia la impresión y no toca datos. Se puede subir a Railway sin riesgo.
- **B después:** cada bloque toca modelo o permisos; van de uno en uno, con migración aditiva.
- **C cuando llegue el plano:** sin plano real no se inventa nada.

## Pendientes de Cristhian (no son código)

Rotar `JWT_SECRET` · cambiar la contraseña del admin · borrar `frontend/_borrar` · conseguir el plano de un área.
