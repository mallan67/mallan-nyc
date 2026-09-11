/** @type {import('jest').Config} */
module.exports = {
  rootDir: "../..",
  testEnvironment: "node",
  // roots + a relative testMatch: an absolute <rootDir>/lib/listings/... glob renders with mixed separators
  // on a Windows git-worktree path and matches nothing there (same fix as lib/crm).
  roots: ["<rootDir>/lib/listings/__tests__"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {
      tsconfig: {
        module: "commonjs",
        moduleResolution: "node",
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        target: "es2022",
      },
    }],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
};
