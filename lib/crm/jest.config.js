/** @type {import('jest').Config} */
module.exports = {
  rootDir: "../..",
  testEnvironment: "node",
  // roots + a relative testMatch: an absolute <rootDir>/lib/crm/... glob renders with mixed separators on a
  // Windows git-worktree path (…mallan-nyc.worktrees/search-clean/lib/crm/…) and matches nothing there.
  roots: ["<rootDir>/lib/crm/__tests__"],
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
