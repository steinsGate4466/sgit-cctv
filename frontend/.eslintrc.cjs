/**
 * Reglas de React para el frontend.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * Un error de "reglas de hooks" dejó la pantalla de Activos en blanco en
 * producción: se llamaba a un hook DESPUÉS de un `if (loading) return ...`.
 * React exige que en cada render se llamen los mismos hooks en el mismo orden;
 * si una salida temprana los saltea, React aborta el componente.
 *
 * TypeScript NO detecta esto —el tipado es correcto— y el navegador solo
 * muestra una pantalla en blanco. La única herramienta que lo caza antes de
 * publicar es esta regla, y por eso está en error, no en advertencia.
 */
/**
 * NOTA SOBRE LA VERSION DEL ANALIZADOR
 * El parser va en 8.x y no en 7.x porque 7.x declara soporte hasta TypeScript
 * 5.6 y el proyecto usa 5.9. Con 7.x salia este aviso en cada lint:
 *   "WARNING: You are currently running a version of TypeScript which is not
 *    officially supported by @typescript-eslint/typescript-estree"
 * Solo aparecia en la terminal del desarrollador, NO en el CI: la libreria lo
 * imprime unicamente si la salida es una terminal interactiva. Por eso llevaba
 * meses sin que nadie lo tomara en serio.
 *
 * Antes de subirlo se comprobo lo unico que importa: que la regla de hooks
 * SIGUE detectando un hook despues de una salida temprana. Subir de version
 * una herramienta de seguridad y no verificar que sigue protegiendo es peor
 * que dejar el aviso.
 */
module.exports = {
  root: true,
  env: { browser: true, es2021: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2021, sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['react-hooks'],
  rules: {
    // Hook después de una salida temprana o dentro de un if => la pantalla
    // queda en blanco. Es un fallo, no un detalle de estilo.
    'react-hooks/rules-of-hooks': 'error',
    // Dependencias incompletas en useEffect: datos que no se refrescan.
    // Queda como advertencia para no frenar el avance con casos discutibles.
    'react-hooks/exhaustive-deps': 'warn',
  },
  ignorePatterns: ['dist', 'node_modules', 'vite.config.ts'],
};
