# ESTÁNDAR DE ACTIVOS — Aceros Arequipa, Planta Pisco

**LAMINACIÓN · Trenes 1, 2 y 3**
Esto es la norma del proyecto. Lo que no cumpla esto está mal, sin discusión.

---

## REGLA 1 — Qué es un ACTIVO y qué no

> **Un ACTIVO es un aparato que se mantiene, se avería y se reemplaza por otro
> igual.**
>
> **Un CABLE no es un activo. Es lo que conecta dos activos.**

| ES ACTIVO | NO ES ACTIVO |
|---|---|
| Cámara | **Cable UTP** |
| Switch PoE | **Fibra óptica** |
| Grabador (NVR) | **Cable de energía** |
| Antena / enlace inalámbrico | **Patch cord** |
| Fuente PoE / inyector | **Canaletas y bandejas** |
| UPS | |
| Tablero eléctrico | |
| PC de púlpito, pantalla | |

**El criterio, para no discutirlo nunca más:**

- ¿Tiene marca, modelo y número de serie? → **activo**
- ¿Se le hace una rutina de mantenimiento? → **activo**
- ¿Se pide como repuesto en almacén con un código? → **activo**
- ¿Es un tramo que UNE dos aparatos? → **conexión, no activo**

### Cómo se guarda un cable entonces

Como **CONEXIÓN entre dos activos**, que es lo que es:

```
Cámara AA-CAM-T1-001  ──── fibra ────  Switch AA-SW-T1-01
```

Se guarda el medio (fibra / cobre / inalámbrico), los dos extremos y el tramo.
**Y eso ya existe en el sistema** — es la pantalla «Conexiones» y la tabla de
enlaces de red.

Un cable roto **no genera una orden sobre el cable**: genera una orden sobre
**el equipo que se quedó sin comunicación**, y en el diagnóstico se dice que
fue el tramo. Que es exactamente como se trabaja en planta.

### ⚠️ Lo que estaba mal y se corrige

En la lista de tipos de activo existe **`FIBER` (Fibra)** y se ofrecía al dar
de alta un equipo, tanto en **Activos** como en **Instalaciones**.

- **Se retira de las dos pantallas de alta.** Ya no se puede crear.
- **No se puede borrar de la base**, porque quitar un valor de una lista de
  ese tipo rompe los registros que ya lo usen. Queda prohibido de uso y hay un
  verificador que lo caza si alguien lo vuelve a poner.
- Si hay equipos cargados como fibra, salen en una lista para pasarlos a
  conexión.

---

## REGLA 2 — La cadena de dependencia de la planta

Va **de abajo hacia arriba**, y es la que manda:

```
        220 V   ·  TABLERO ELÉCTRICO + CIRCUITO
          │
          │  alimenta
          ▼
        SWITCH PoE            ← todo cuelga de aquí
          │
          │  da RED y CORRIENTE por el mismo cable
          ▼
   CÁMARAS   ·   ANTENAS   ·   GRABADOR
```

**Lo que hay que entender, y es el corazón del módulo:**

- Una **cámara** se cae → se pierde **una** vista.
- Un **switch PoE** se cae → se pierden **todas** las cámaras que cuelgan de él.
- El **circuito de 220 V** se cae → se pierden **todos** los switches del tablero.

Por eso el switch **no es un aparato más**: es el punto donde una falla se
multiplica.

---

## REGLA 3 — La criticidad SUBE por la cadena

> **Un equipo que no vigila nada hereda la PEOR letra de todo lo que depende
> de él.**

| Equipo | Su letra sale de |
|---|---|
| **Cámara** | Lo que vigila: impacto en producción, riesgo para personas, si hay otra cámara que cubra lo mismo, cuántas veces falla, y qué cuesta llegar a ella |
| **Switch PoE** | La **peor** de las cámaras que alimenta |
| **Grabador (NVR)** | La **peor** de las cámaras que graba |
| **Fuente PoE / UPS** | La **peor** de lo que alimenta |
| **Tablero / circuito** | La **peor** de los switches que alimenta |

**La cantidad NO sube la letra.** Un switch con dieciséis cámaras C sigue
siendo C: perder dieciséis cosas que no importaban sigue sin importar. La
cantidad se dice en la explicación, no en la letra.

---

## REGLA 4 — Cómo se calcula la letra de una cámara

Método **CTR — Criticidad Total por Riesgo**. Es el estándar de industria
pesada, y por eso se sostiene delante de un ingeniero.

```
CRITICIDAD = FRECUENCIA con que falla  ×  CONSECUENCIA de que falle
```

**Se multiplica, no se suma.** Un equipo importantísimo que lleva cinco años
sin fallar no necesita que suban a revisarlo cada mes. Sumando saldría A;
multiplicando, no.

```
CONSECUENCIA = (Impacto en producción × Falta de respaldo)
             + Riesgo para personas
             + Dificultad de llegar
```

| Factor | Quién lo pone |
|---|---|
| Impacto en producción (1 a 4) | **El ingeniero**, una vez por equipo |
| ¿Vigila un riesgo para personas? (sí / no) | **El ingeniero**, una vez por equipo |
| Cuántos equipos más cubren lo mismo | **El sistema, solo** |
| Dificultad de llegar (a pie / escalera / manlift / con parada) | **El sistema, solo** |
| Fallas en los últimos 12 meses | **El sistema, solo** |

**De cinco factores, el sistema calcula tres.** Sólo hay que declarar dos.

### Dos reglas que no se negocian

1. **La seguridad no se promedia.** Si vigila un sitio donde una persona puede
   resultar herida → **es A**. Aunque no afecte a producción, aunque haya
   nueve cámaras de respaldo, aunque no haya fallado nunca.

2. **Sin clasificar NO es C.** Queda como *«sin clasificar»* y sale en una
   lista de pendientes. Ponerlo en C haría que cuatrocientas cámaras sin
   revisar parecieran poco importantes.

---

## REGLA 5 — La letra decide el mantenimiento

| Letra | Se revisa cada |
|---|---|
| **A** | 30 días |
| **B** | 60 días |
| **C** | 90 días |

*(Números iniciales. El ingeniero los cambia desde la pantalla, sin tocar
código.)*

**Se cruza con el ambiente, y manda el que más exige:**

| Caso | La letra pide | El ambiente pide | Queda en |
|---|---|---|---|
| Cámara A en púlpito climatizado | 30 d | 90 d | **30 días** |
| Cámara C en calor radiante del horno | 90 d | 30 d | **30 días** |

El calor del horno destruye sellos aunque la cámara sea C, y una cámara A hay
que revisarla aunque esté en un sitio cómodo. **No se pierde ninguna de las
dos razones.**

Y **si un equipo todavía no tiene letra, manda el ambiente** — o sea que el
módulo se puede encender mañana sin haber clasificado nada, y no se rompe
nada.

---

## REGLA 6 — Las tres ramas del software

El sistema se reparte por **oficio**, no por módulo.

### ① GESTIÓN — el ingeniero de mantenimiento
*Decide y mide.*

Mi bandeja · Incidencias · Órdenes (OM) · Ventanas de parada · **Criticidad
A/B/C** · Preventivo · Correctivo · Predictivo · Mejora · Cámaras de grúa ·
Propuestas de los técnicos · Inventario · Riesgo · Dashboard · Indicadores ·
Exportar

### ② PRODUCCIÓN — púlpito, jefe de línea, jefe de tren
*Mira la línea y avisa. No toca nada.*

Mi tren · Mis cámaras · Mis activos · Mi cobertura · Por tren · Vista general ·
Estado por Tren · De qué depende · Zonas vitales

### ③ CAMPO — los técnicos que levantan y llenan los datos
*Todo lo que se rellena con el equipo delante.*

Activos · Ubicaciones · Gabinetes · Instalaciones · Campañas de mapeo · Avance
del mapeo · Accesibilidad · **Conexiones** · Cableado · Electricidad ·
Grabadores · Mapa de red · Direccionamiento IP · Puntos críticos · Monitoreo ·
Equipos conocidos · Rotulado · Salud de los datos · Manuales y planos

### ④ SISTEMA
Usuarios · Roles · Auditoría · Avisos · Limpieza de datos · Mi cuenta

**Nadie ve las cuatro.** Los permisos recortan solos: un operario de púlpito
ve dos entradas, no cuarenta y nueve.

---

## REGLA 7 — Rotulado

Sigue **ANSI/TIA-606-C**, que es la norma de rotulado de infraestructura de
telecomunicaciones, y **ISA-95** para los niveles de la planta
(Empresa → Planta → Área → Línea → Equipo), que es lo que el ingeniero ya usa.

El código de un equipo dice dónde está y qué es:

```
AA - CAM - T1 - PUL - 001
│    │     │    │     └── correlativo
│    │     │    └──────── sitio (púlpito, lecho, MCC…)
│    │     └───────────── tren
│    └─────────────────── tipo de equipo
└──────────────────────── Aceros Arequipa
```

---

## Resumen en cinco líneas

1. **El cable no es un activo.** Es una conexión entre dos activos.
2. **Todo cuelga del switch, y el switch cuelga del 220 V.**
3. **La criticidad sube por esa cadena**: el switch hereda la peor letra de sus
   cámaras.
4. **La letra decide cada cuánto se revisa**, cruzada con el ambiente: manda el
   que más exige.
5. **Tres ramas**: Gestión, Producción y Campo.
