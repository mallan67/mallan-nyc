/** @type {import('jest').Config} */
const path = require('path');

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: path.resolve(__dirname, '../../tsconfig.json'),
    }],
  },
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    '^@/(.*)$': path.resolve(__dirname, '../../$1'),
  },
};
