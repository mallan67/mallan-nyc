/** @type {import('jest').Config} */
module.exports = {
  displayName: 'runtime',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: require('path').resolve(__dirname, '../..'),
  roots: ['<rootDir>/tests/runtime'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: require('path').resolve(__dirname, '../../tsconfig.json'),
      isolatedModules: true,
    }],
  },
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  // Mock Prisma globally for runtime tests so they don't hit a live DB.
  // Individual tests can override via jest.mock() if needed.
  setupFilesAfterEach: [],
};
