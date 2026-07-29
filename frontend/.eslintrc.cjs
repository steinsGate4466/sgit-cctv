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
