// =============================================================================
//  REGLAS DE REACT — configuración plana (ESLint 10, bloque 54)
// =============================================================================
//  POR QUÉ EXISTE ESTE ARCHIVO
//
//  Un error de «reglas de hooks» dejó la pantalla de Activos EN BLANCO en
//  producción: se llamaba a un hook DESPUÉS de un `if (loading) return ...`.
//  React exige que en cada dibujado se llamen los mismos hooks en el mismo
//  orden; si una salida temprana los saltea, React aborta el componente.
//
//  TypeScript NO detecta eso —el tipado es correcto— y el navegador sólo
//  muestra una pantalla blanca, sin un error que ayude. La única herramienta
//  que lo caza antes de publicar es esta regla. Por eso está en `error` y no
//  en aviso.
//
// -----------------------------------------------------------------------------
//  POR QUÉ CAMBIÓ DE FORMA
//
//  Antes esto era `.eslintrc.cjs`. ESLint 8 llegó a su FIN DE VIDA el
//  05/10/2024 y el proyecto siguió sobre él 22 meses sin recibir un solo
//  parche de seguridad. Nadie lo supo porque no había nada que lo dijera —el
//  mismo caso que Node 22—.
//
//  ESLint 9 retiró el formato antiguo y ESLint 10 ya ni lo lee. La
//  configuración plana no es un capricho: es un array de bloques que se
//  aplican en orden, sin la herencia implícita de `extends` que hacía que
//  nadie supiera de dónde salía una regla.
//
// -----------------------------------------------------------------------------
//  POR QUÉ `.mjs` Y NO `.js`
//
//  La configuración plana se escribe con `import`. El `package.json` del
//  frontend no declara `"type": "module"`, así que un `eslint.config.js` se
//  leería como CommonJS y fallaría con «Cannot use import statement outside a
//  module». La extensión `.mjs` lo deja explícito y no depende de un campo que
//  está en otro archivo.
// =============================================================================
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    // Lo que ESLint no debe mirar. En el formato antiguo esto era
    // `ignorePatterns`; ahora es un bloque propio, y tiene que ir el PRIMERO
    // para que se aplique a todo lo que viene detrás.
    ignores: [
      'dist/**',
      'node_modules/**',
      'vite.config.ts',
      // Los verificadores propios son scripts de Node sueltos, no código de
      // la aplicación: no siguen las reglas de React ni tienen por qué.
      'scripts/**',
    ],
  },

  {
    files: ['src/**/*.{ts,tsx}'],

    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2021,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      // `globals` sustituye al viejo `env: { browser: true }`, que ESLint 9
      // retiró. Sin esto, cada `window`, `document` o `fetch` sale como
      // variable no definida.
      globals: globals.browser,
    },

    plugins: {
      // En el formato antiguo se escribía `plugins: ['react-hooks']` y ESLint
      // adivinaba el paquete por el nombre. Ahora se importa y se nombra
      // explícitamente: se ve de dónde sale cada regla.
      'react-hooks': reactHooks,
    },

    rules: {
      // Hook después de una salida temprana o dentro de un `if` => la pantalla
      // queda en blanco. Es un fallo, no un detalle de estilo.
      'react-hooks/rules-of-hooks': 'error',

      // Dependencias incompletas en `useEffect`: datos que no se refrescan.
      // Queda como aviso para no frenar el avance con casos discutibles, pero
      // el script de lint tiene un tope: si se disparan, la CI falla igual.
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
