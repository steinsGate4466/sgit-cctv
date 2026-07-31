# Auditoría de dependencias del frontend

**Fecha:** 30 de julio de 2026 · tras subir el analizador de ESLint a 8.65
**Resultado bruto de `npm audit`:** 13 avisos — 10 altos, 3 moderados

El número asusta y engaña. Lo que sigue es el triaje real: **qué llega al
navegador del usuario y qué se queda en la máquina del desarrollador**.

---

## Lo que SÍ llegaba a producción

### `react-router-dom` · Redirección abierta que lleva a XSS · CVSS 6.9

**Corregido subiendo a 6.30.4** (misma versión mayor, sin migración).

### Y algo que el audit no dice: el fallo era alcanzable en ESTE código

`ProtectedRoute` guarda a dónde iba el usuario antes de mandarlo al login:

```tsx
const destino = location.pathname + location.search;
return <Navigate to="/login" replace state={{ from: destino }} />;
```

Y `Login` navegaba a ese valor sin comprobarlo. Con las versiones afectadas de
react-router, una ruta que empieza por `//` o por `/\` puede interpretarse como
**dirección externa**: un enlace preparado llevaría al usuario a una copia del
login en otro dominio, donde entregaría su contraseña.

**Cerrado en el propio código**, no solo actualizando la librería:

```ts
export function rutaInternaSegura(valor: unknown): string | undefined {
  if (typeof valor !== 'string') return undefined;
  const v = valor.trim();
  if (!/^\/[^/\\]/.test(v)) return undefined;
  return v;
}
```

Lista **blanca**, no negra: enumerar lo prohibido siempre deja un hueco.
Verificado con 18 casos, incluidos `//evil.com`, `/\evil.com`, `///evil.com`,
`javascript:` y valores que no son texto.

Esto queda cerrado **pase lo que pase con la versión de la librería**.

---

## Lo que NO llega a producción

### 9 de los 10 "altos" son la misma raíz, y son de desarrollo

`brace-expansion` (denegación de servicio por expansión sin límite) dentro de
`minimatch`, que arrastran `glob`, `rimraf`, `flat-cache`, `file-entry-cache`,
`@eslint/eslintrc`, `@humanwhocodes/config-array` y `eslint`.

Son el árbol de dependencias de **ESLint**. No se empaquetan, no viajan al
navegador y no se ejecutan en el servidor. El único escenario de explotación
sería alguien capaz de ejecutar el lint con una entrada preparada — y esa
persona ya tiene el repositorio.

**El arreglo que propone npm es ESLint 10**, versión mayor que obliga a migrar
a la configuración plana (`eslint.config.js`) y a reescribir `.eslintrc.cjs`.
Se hace en su propio bloque, con verificación de que la regla de hooks sigue
detectando el fallo. No de madrugada y no a la vez que otra cosa.

### `vite` · el "alto" restante · solo el servidor de desarrollo

- Path traversal en el manejo de `.map` de dependencias optimizadas
- Salto de `server.fs.deny` en rutas alternativas de Windows · CVSS 7.5
- `launch-editor`: filtración de hash NTLMv2 por rutas UNC en Windows

Los tres afectan a `vite dev`, **no al resultado de `vite build`**, que es lo
que se despliega. El arreglo es Vite 8, otra versión mayor.

**Ojo con uno:** si algún día se levanta `npm run dev` en un equipo accesible
desde la red de planta, el salto de `server.fs.deny` sí importa. Mientras el
servidor de desarrollo solo se use en local, no.

### `react-router` · dos avisos que siguen apareciendo en 6.30.4

1. **Inyección de constructor en `deserializeErrors()` de la hidratación SSR.**
   **No aplica**: esta aplicación es una SPA pura, con `createRoot` y sin
   ningún renderizado en servidor. Se comprobó buscando `hydrateRoot`,
   `StaticRouter` y `renderToString`: no existen.

2. **Redirección abierta por barra invertida en `<Link>` y `useNavigate`.**
   Sí aplicaba, y es la que se cerró arriba con `rutaInternaSegura`. El único
   punto donde se navegaba a un valor externo era el destino tras el login.
   El resto de navegaciones son rutas fijas escritas en el código.

Las dos solo se corrigen en la librería a partir de **7.18**, cambio mayor.

---

## Regla de trabajo

**Nunca `npm audit fix --force`.** Ya rompió el backend una vez: instala
versiones mayores a ciegas y deja un árbol de dependencias que nadie puede
reproducir. Cada aviso se mira, se decide si llega al usuario, y se arregla o
se documenta con el motivo.

## Pendiente, cada uno en su bloque

| Tarea | Por qué no ahora |
|---|---|
| ESLint 10 + configuración plana | Cambio mayor; hay que verificar que la regla de hooks sigue protegiendo |
| Vite 8 | Cambio mayor; solo afecta al servidor de desarrollo |
| react-router 7 | Cambio mayor; lo explotable ya está cerrado en el código |
