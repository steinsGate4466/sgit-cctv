# Barrido de código · 17/09/2026

Barrido automático módulo por módulo sobre los 40 módulos del backend y las 56
pantallas del frontend. Cada hallazgo se verificó **abriendo el código**, no se
reporta lo que dijo el barrido: la primera pasada dio 21 «fallos» de permisos y
**20 eran míos**, no del software.

---

## Lo que salió LIMPIO

| Barrido | Resultado |
|---|---|
| 355 rutas del backend vs 381 llamadas del frontend | **0 botones que llamen a algo que no existe** |
| Rutas literales tapadas por una con parámetro | **0** |
| Listas `.map` sin `key` | **0** |
| Porcentajes con denominador sin proteger | **0** (el único candidato estaba protegido una línea antes) |
| `toFixed` sobre un valor nulo | **0** |
| `<img>` sin `alt` | **0** |
| Permisos del menú contra los del endpoint | **0 reales** — las pantallas ya se protegen con `can(...)` |

Esto confirma la trazabilidad de botones que se midió en el bloque 102 y
prueba que el trabajo de los bloques 68, 77 y 83 sobre permisos **aguantó**.

---

## HALLAZGO 1 · ALTO · El historial puede enseñar el equipo equivocado

`frontend/src/components/HistorialActivo.tsx:41`

```tsx
useEffect(() => {
  setCargando(true);
  api.get('/assets/' + assetId + '/historial')
    .then((r) => setD(r.data))      // <-- no comprueba que assetId siga siendo el mismo
}, [assetId]);
```

**El escenario, y por eso es alto:** el ingeniero está dando de alta una OM y
cambia el equipo en el desplegable. Se disparan dos peticiones. Si la primera
—la de la cámara que ya descartó— llega **después**, es la que se queda en
pantalla. La ficha dice una cámara y el historial es de otra.

Y este componente existe precisamente para que nadie intervenga a ciegas: se
enseña **antes** de tocar el equipo, con las señales de reincidencia. Un
historial cruzado no es una molestia visual — es mandar a un técnico a campo
con la información de otro equipo.

**Arreglo:** el patrón `let vivo = true` con `return () => { vivo = false; }`
que este mismo proyecto ya usa en `BorrarDefinitivo.tsx` y en `Assets.tsx`.
Seis líneas.

## HALLAZGO 2 · MEDIO · La misma carrera en cinco sitios más

| Archivo | Se relanza al cambiar | Qué se cruza |
|---|---|---|
| `components/DetallarOm.tsx:32` | `wo.id` | la duración típica de otra OM |
| `components/OmHerramientas.tsx:40` | `workOrderId` | las herramientas de otra OM |
| `pages/AssetScan.tsx:112` | `id, recarga` | **escanear dos QR seguidos en campo** |
| `pages/CabinetScan.tsx:31` | `id` | ídem con gabinetes |
| `pages/Ipam.tsx:61` | `busca` | el buscador de IP: tiene rebote de 300 ms, que **reduce** la carrera pero no la cierra |

`AssetScan` es el peor de los cinco: el técnico escanea una cámara, no carga
rápido, escanea la siguiente, y se queda mirando la ficha de la primera con el
código de la segunda en la cabecera.

> **Un dato viejo que se hace pasar por el nuevo es peor que un error.** Es la
> misma regla del bloque 42 con la edad del dato, en otro sitio.

**Ni uno de los once efectos revisados lleva guardia.** Tres de ellos
(`MisActivos`, `MisCamaras`, `TableroOm`) están a salvo por casualidad: su
dependencia sale de un `useState` sin actualizador y no cambia nunca.

## HALLAZGO 3 · MEDIO · 86 colores escritos a mano

86 sitios en el frontend con el color metido a pelo en el estilo en línea:

```tsx
<div style={{ fontSize: 12, color: '#475569' }}>
<span style={{ color: '#b91c1c' }}>reincidente</span>
```

La hoja de estilos tiene `--ok`, `--warn`, `--crit`, `--muted`, `--border`…
y estos 86 no las usan. Consecuencias reales, no de gusto:

1. **El mismo estado se ve de dos colores** según la pantalla: hay cuatro rojos
   distintos (`#dc2626`, `#b91c1c`, `#b3261e`, `#8c1414`) para decir lo mismo.
2. **Cambiar la paleta es imposible** — habría que tocar 86 sitios a mano, y el
   día que se quiera un modo oscuro para el púlpito de noche, no se puede.
3. En una exposición se nota: parece hecho por dos personas distintas.

`verificar:clases` no lo caza porque no son clases; son estilos en línea.

## HALLAZGO 4 · BAJO · Tres tablas sin estado vacío

`pages/Roles.tsx:178`, `pages/Rotulado.tsx:265`, `components/HistorialActivo.tsx:195`

Sin datos pintan la cabecera y ninguna fila. Una tabla con encabezados y cero
filas no dice «no hay nada»: parece que la pantalla se rompió al cargar. El
resto del proyecto ya resuelve esto con el recuadro `vacio`.

## HALLAZGO 5 · BAJO · El 403 se esconde en silencio

Varios paneles hacen `.catch(() => null)` sobre una lectura que puede dar 403
por permisos: `Dashboard` con `/network/criticos` y `/troubleshooting/metrics`,
`Assets` con `/electricidad/tableros`.

El panel simplemente no aparece. Para el usuario, **«no tienes permiso» y «no
hay datos» son indistinguibles**. No es grave —nadie ve datos que no debe— pero
es la mitad de puerta que este proyecto persigue en todas partes. Un
`/network/cadena` de `Assets.tsx` sí lo hace bien: silencia a propósito y lo
deja escrito con su motivo.

## HALLAZGO 6 · BAJO · N+1 que quedan, todos acotados

Se revisaron los 13 `await` dentro de un bucle del backend. **Ninguno es grave**
después del arreglo de `reincidentes()` de hoy:

- 4 leen fotos de MinIO para armar un PDF — acotados por el número de fotos.
- 2 escriben por tandas dentro de `$transaction` — hecho a propósito.
- 1 manda avisos de Telegram en fila — a propósito, por el límite de ritmo.
- `hojas-ruta.service.ts:279` consulta activos por cada hoja de ruta dentro de
  una exportación a Excel: acotado por el número de tipos de equipo (~12) y en
  una operación que ya es pesada. **Deuda declarada, no urgencia.**
- `campanas.service.ts:98` crea una zona por iteración en vez de `createMany`.

## HALLAZGO 7 · BAJO · Una fila pulsable sin teclado

`pages/Assets.tsx:774` — `<tr onClick=...>` con `cursor: pointer` pero sin
`role` ni `tabIndex`. Con ratón funciona; con teclado no hay forma de abrir la
ficha. El proyecto ya tiene la clase `ta-pulsable` para esto.

---

## Resumen

| # | Hallazgo | Nivel | Tamaño del arreglo |
|---|---|---|---|
| 1 | Historial cruzado por carrera de peticiones | **ALTO** | 6 líneas |
| 2 | La misma carrera en 5 pantallas más | MEDIO | ~30 líneas + 1 verificador |
| 3 | 86 colores a mano | MEDIO | mecánico + 1 verificador |
| 4 | 3 tablas sin estado vacío | BAJO | 15 líneas |
| 5 | El 403 se esconde en silencio | BAJO | decisión de diseño |
| 6 | N+1 acotados | BAJO | declarar la deuda |
| 7 | Fila pulsable sin teclado | BAJO | 2 líneas |

Los hallazgos 1, 2 y 4 caben en un solo bloque (**115**), con su verificador
para que la carrera no pueda volver a entrar.
