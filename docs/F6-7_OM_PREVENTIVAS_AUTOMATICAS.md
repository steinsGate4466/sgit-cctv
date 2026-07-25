# F6.7 — Generación automática de OM PREVENTIVAS

Aceros Arequipa · Planta Pisco · SGIT-CCTV

## Regla de oro

**Solo se generan automáticamente las órdenes PREVENTIVAS.**
Correctivo, Mejora y Predictivo **nunca** se crean solos: nacen de una incidencia
reportada, de una propuesta de mejora o del análisis del equipo. Esto está garantizado
en el código (la generación fija `type: 'PREVENTIVO'`) y verificado en la auditoría del módulo.

## Qué hace la tarea automática

Una vez al día, a la hora de planta configurada (por defecto **06:00**), el sistema:

1. Busca los **planes preventivos activos vencidos**.
2. Crea la OM preventiva correspondiente **solo si corresponde** (ver reglas).
3. Deja **traza de auditoría** con lo generado y lo omitido.

Si el servicio se reinicia, **no vuelve a ejecutarse** el mismo día: consulta la traza de
auditoría del día de planta antes de correr (idempotente).

## Reglas de negocio aplicadas (endurecimiento)

| # | Regla | Por qué |
|---|---|---|
| 1 | Solo planes **activos** y vencidos (o dentro de la ventana configurada) | No generar trabajo que no toca |
| 2 | Se **excluyen activos dados de baja o en estado BAJA / STOCK** | No se mantiene un equipo que no está en operación |
| 3 | **No duplica**: si el activo ya tiene una OM preventiva abierta, se omite | Evita inflar el backlog con la misma tarea |
| 4 | La OM **hereda la zona** (ubicación + gabinete) del activo | El técnico sabe a dónde ir en una planta enorme |
| 5 | `scheduledDate` = **fecha real de vencimiento**, no “hoy” | El indicador de OM vencidas refleja el atraso verdadero |
| 6 | Código correlativo tomado del **mayor del año**, con verificación de colisión | Convive con los códigos manuales de SAP sin chocar |
| 7 | Un fallo del job **nunca tumba la aplicación**; se reintenta al ciclo siguiente | Estabilidad del servicio |

## Configuración (variables de entorno)

| Variable | Por defecto | Para qué |
|---|---|---|
| `PREVENTIVE_AUTOGEN` | `on` | `off` desactiva la generación automática |
| `PREVENTIVE_AUTOGEN_HOUR` | `6` | Hora de planta a partir de la cual corre |
| `PREVENTIVE_LOOKAHEAD_DAYS` | `0` | Generar también las que vencen dentro de N días |
| `PLANT_UTC_OFFSET` | `-5` | Huso horario de la planta (Perú) |

No es obligatorio definirlas: con los valores por defecto ya funciona.

## En la aplicación

- El tablero **Preventivo** muestra un aviso con el estado de la automatización: si está
  activa, a qué hora corre y **cuándo fue la última ejecución** (con cuántas OM generó).
- El botón **“Generar OM vencidas”** sigue disponible para el Jefe (generación manual),
  y ahora informa cuántas se omitieron y por qué.
- La API acepta `POST /preventive/generate?days=N` para adelantar las que vencen en N días.

## Decisión técnica

Se implementó con un temporizador propio en lugar de agregar `@nestjs/schedule`:
evita tocar `package.json` (fuente de problemas en despliegues anteriores) y mantiene el
build estable. Si a futuro se necesitan más tareas programadas, se puede migrar a la
librería sin cambiar la lógica de negocio, que vive en `PreventiveService`.

## Despliegue

**No hay cambios de esquema**: basta con `git push` (Railway reconstruye solo).
No requiere `db push` ni `seed`.
