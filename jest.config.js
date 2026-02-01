/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  testEnvironmentOptions: {
    resources: 'usable',
  },
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/tests/**/*.test.ts'],
  // Exclude Playwright E2E tests (run separately with: npm run test:e2e:all)
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/tests/extension.test.ts',
    '<rootDir>/tests/auth-flow.test.ts',
    '<rootDir>/tests/security-compat.test.ts',
    '<rootDir>/tests/accessibility.test.ts',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
  ],
  coverageThreshold: {
    global: {
      // NOTE: Many core files (content.ts, popup.ts, auth.ts, background*.ts)
      // have side effects when imported and require DOM mocking before import.
      // Current achievable coverage without major refactoring: ~25%
      // Files with good coverage: api.ts (95%), config.ts (79%), errors.ts (83%),
      //                           logger.ts (69%), provider.ts (70%), siwe-utils.ts (79%)
      // Files at 0%: Files with side effects that run on import
      // Goal: Refactor side-effect files to improve testability
      branches: 10,
      functions: 20,
      lines: 20,
      statements: 20,
    },
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
    }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  globals: {
    'process.env.NODE_ENV': 'test',
  },
};
