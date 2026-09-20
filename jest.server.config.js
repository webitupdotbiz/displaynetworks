export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  injectGlobals: true,
  extensionsToTreatAsEsm: ['.ts'],
  testMatch: ['<rootDir>/server/**/*.spec.ts'],
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/server/tsconfig.json',
        useESM: true,
      },
    ],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  collectCoverageFrom: ['server/**/*.ts', '!server/**/*.spec.ts', '!server/**/*.d.ts'],
  coverageDirectory: 'coverage/server',
  setupFiles: ['<rootDir>/server/test-setup.ts'],
};
