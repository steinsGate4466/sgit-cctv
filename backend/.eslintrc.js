module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: { sourceType: 'module' },
  extends: ['plugin:@typescript-eslint/recommended'],
  root: true,
  env: { node: true, jest: true },
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
  },
};
