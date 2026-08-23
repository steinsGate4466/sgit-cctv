/**
 * Configuración de pruebas — SGIT-CCTV backend.
 * Las pruebas viven en /test y cubren los caminos críticos del negocio.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  // El cliente de Prisma 7 se genera dentro de `src/`. Es codigo que no
  // escribimos nosotros: medir su cobertura hundiria el porcentaje del
  // proyecto y escondería lo que sí nos toca cubrir.
  collectCoverageFrom: ['src/**/*.(t|j)s', '!src/generated/**'],
  coverageDirectory: './coverage',
  // El esquema de Prisma y los DTO usan decoradores; ts-jest los respeta vía tsconfig.
  // isolatedModules vive en tsconfig.json (la opcion aqui quedo deprecada en ts-jest).
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
