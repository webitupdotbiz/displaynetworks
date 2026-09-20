export default {
  preset: 'jest-preset-angular',
  setupFilesAfterEnv: ['<rootDir>/client/test.ts'],
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/dist/',
    '<rootDir>/e2e/'
  ],
  transform: {
    '^.+\\.(ts|js|html)$': ['jest-preset-angular', {
      tsconfig: '<rootDir>/client/tsconfig.spec.json',
      stringifyContentPathRegex: '\\.(html|svg)$'
    }]
  },
  coverageDirectory: 'coverage',
  snapshotSerializers: [
    'jest-preset-angular/build/serializers/no-ng-attributes',
    'jest-preset-angular/build/serializers/ng-snapshot',
    'jest-preset-angular/build/serializers/html-comment'
  ],
  testMatch: [
    '<rootDir>/client/**/*.spec.ts'
  ],
  moduleNameMapper: {
    '@app/(.*)': '<rootDir>/client/app/$1',
    '@assets/(.*)': '<rootDir>/client/_assets/$1'
  },
  collectCoverageFrom: [
    'client/**/*.ts',
    '!client/**/*.module.ts',
    '!client/main.ts',
    '!client/polyfills.ts',
    '!client/test.ts',
    '!client/environments/**'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  }
};
