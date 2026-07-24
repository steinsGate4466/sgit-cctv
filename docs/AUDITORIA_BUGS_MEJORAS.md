# Auditoría de bugs y mejoras — SGIT-CCTV

Aceros Arequipa · Planta Pisco · Estado a Julio 2026 (tras F6.6)

## 1. Bugs corregidos en esta tanda (F6.6)

- **Informe del equipo no visible para el técnico** → ahora lo genera cualquiera con `asset.read` (incluye técnico). El informe no lleva contraseñas.
- **Ubicaciones sin foto** → se agregó foto de referencia por ubicación (subir/ver, MinIO).
- **El informe de OM no reflejaba lo que hizo el técnico** → ahora incluye el **checklist de condición** (Limpieza, Cableado, etc. con OK/Observado/Cambiar).
- **Faltaba descargar el informe desde Preventivo/Correctivo** → botón “Informe” en cada OM de esas vistas.

## 2. Bugs corregidos antes (histórico)

Ver foto (MIME), estado `EN_ESPERA` faltante, bloqueo de login en servidor, filtro global de errores (no más “Internal server error”), CORS con lista blanca, estado operativo derivado (F5), Modal que se cerraba al arrastrar, renovación de token sin cerrar sesión, categorías de incidencia de planta.

## 3. Bugs / riesgos PENDIENTES (por prioridad)

**🔴 Alto**
- **`prisma db push` en vez de migraciones versionadas.** Cada cambio de esquema puede pedir “data loss” (ya lo vimos). Se debe migrar a `prisma migrate` (con historial) — hacerlo con calma y probado en local, no en caliente.
- **Sin pruebas automatizadas.** Cualquier cambio puede romper login, firma o cifrado sin aviso.

**🟡 Medio**
- **Permisos firmados en el JWT:** al cambiar el rol de un usuario, toma efecto recién al próximo refresh (~15 min); no hay revocación inmediata de sesiones.
- **Dependencia de MinIO para fotos/PDF:** si MinIO cae, subir/ver fotos falla (el resto del sistema sigue; ya es degradación controlada).
- **Ubicación “obligatoria” solo en la UI:** el backend aún acepta activos sin ubicación (para no romper datos viejos). Se puede endurecer luego.
- **Listado de activos sin paginación:** bien para cientos; a miles conviene paginar.

**🟢 Bajo**
- Rate-limit solo en login (otros endpoints sin límite).
- Textos/labels afinables.

## 4. Funcionalidad PENDIENTE (alineación con lo pedido)

- **Predictivo y Mejora aún no tienen su vista/métrica propia.** Hoy existen Preventivo y Correctivo como tableros; falta:
  - **Predictivo:** tablero de alerta temprana por reglas (condición “Cambiar” recurrente, ≥N correctivos, señal de enlace degradada). El tipo `PREDICTIVO` ya existe.
  - **Mejora:** vista/métrica de las OM tipo MEJORA (upgrades/reubicaciones).
- **Accesibilidad / Manlift (SSOMA):** solicitud del técnico + aprobación del Jefe + documento sustentado (PETAR/IPERC/ATS). Diseñado, no construido.
- **Foto en plano del activo (`PLANO`)**: el tipo existe; el flujo de “plano” a futuro.
- **Notificación real al Jefe** (hoy el registro de la incidencia/OM ES el aviso; falta correo/alerta).

## 5. Roadmap sugerido (antes de F7)

1. **F6.7** — Tableros de **Predictivo** (reglas) y **Mejora** (cerrar la segmentación de los 4 tipos).
2. **F6.8** — Módulo **Accesibilidad/Manlift (SSOMA)** con aprobación del Jefe e informe.
3. **F6.9 (deuda)** — **Migraciones versionadas** + primeras **pruebas** de caminos críticos (login, firma, cifrado).
4. **F7** — Monitoreo en vivo (HikCentral/Zabbix) que alimenta el predictivo real.

## 6. Nota de arquitectura
Todo lo construido es aditivo y reutiliza los patrones existentes (firma electrónica, MinIO, PDF con pdfkit, guard de permisos, estado derivado). No hay módulos “sueltos”: cada uno cuelga del `WorkOrder`/`Asset`/`Location` existentes sin duplicar datos.
