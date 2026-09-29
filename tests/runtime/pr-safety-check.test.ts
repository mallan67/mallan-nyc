import { spawnSync } from "node:child_process";
import path from "node:path";

// The PR safety check is exercised through its --stdin mode with in-memory fixtures.
// No git repository, temp directory or file is created, so running this suite leaves
// nothing behind (the retired controller's test created a temp git repo per case).
const SCRIPT = path.resolve(__dirname, "../../scripts/ci/pr-safety-check.mjs");
const MAYA = "mallan67";

type Change = { status: "A" | "M" | "D"; path: string };
type Fixture = {
  changes: Change[];
  base?: Record<string, string>;
  head?: Record<string, string>;
  baseDirs?: string[];
  labels?: { name: string; addedBy: string }[];
  authorizers?: string[];
  body?: string;
};
type Result = { ok: boolean; failures: { rule: string; items: string[] }[]; databaseChanges: string[] };

function check(fixture: Fixture): Result {
  const run = spawnSync(process.execPath, [SCRIPT, "--stdin"], { input: JSON.stringify(fixture), encoding: "utf8" });
  if (run.status !== 0) throw new Error("pr-safety-check crashed: " + run.stderr);
  return JSON.parse(run.stdout) as Result;
}
const rules = (r: Result) => r.failures.map((f) => f.rule);
const label = (name: string, addedBy = MAYA) => ({ name, addedBy });
const EVERY_LABEL = [
  "authorized:schema-migration", "authorized:environment", "authorized:neon-control",
  "authorized:destructive-data", "authorized:production", "authorized:manual-cron", "authorized:safety-root",
].map((n) => label(n));

describe("PR safety check", () => {
  test("an ordinary change passes", () => {
    const r = check({
      changes: [{ status: "M", path: "lib/listings/format.ts" }],
      base: { "lib/listings/format.ts": "export const a = 1;\n" },
      head: { "lib/listings/format.ts": "export const a = 2;\n" },
    });
    expect(r).toMatchObject({ ok: true, failures: [] });
  });

  test("retired direct-Neon paths never return, even with every label", () => {
    const r = check({
      changes: [{ status: "A", path: ".github/workflows/rotate-db-keys.yml" }],
      head: { ".github/workflows/rotate-db-keys.yml": "name: stub\non: workflow_dispatch\n" },
      labels: EVERY_LABEL,
    });
    expect(r.ok).toBe(false);
    expect(rules(r)).toContain("retired-neon-path");
  });

  test.each([
    ["a plain URL", "scripts/neon-control.ts", 'await fetch("https://console.neon.tech/api/v2/projects");\n'],
    ["a concatenated host", "scripts/tools/rotate.ts", 'const host = "console" + "." + "neon" + ".tech";\n'],
    ["a hex-escaped host", "lib/ops/host.py", 'host = "console\\x2eneon\\x2etech"\n'],
    ["a CLI call", "scripts/verify.sh", "#!/bin/sh\nneonctl branches list\n"],
    ["an admin key in a workflow", ".github/workflows/x.yml", "env:\n  KEY: ${{ secrets.NEON_API_KEY }}\n"],
  ])("Neon control-plane capability is refused under any name: %s", (_name, file, body) => {
    const r = check({ changes: [{ status: "A", path: file }], head: { [file]: body }, labels: EVERY_LABEL });
    expect(rules(r)).toContain("neon-capability");
  });

  test("a document that mentions Neon tooling is not a capability", () => {
    const r = check({ changes: [{ status: "A", path: "docs/notes.md" }], head: { "docs/notes.md": "We once used neonctl.\n" } });
    expect(rules(r)).not.toContain("neon-capability");
  });

  test("schema changes need Maya's label, and a label added by another account does not count", () => {
    const fixture: Fixture = {
      changes: [{ status: "M", path: "prisma/schema.prisma" }],
      base: { "prisma/schema.prisma": "model A {\n  id Int @id\n}\n" },
      head: { "prisma/schema.prisma": "model A {\n  id Int @id\n  name String?\n}\n" },
    };
    expect(rules(check(fixture))).toContain("authorization:schema_migration");
    expect(rules(check({ ...fixture, labels: [label("authorized:schema-migration", "mallan-agent")] }))).toContain("authorization:schema_migration");
    expect(rules(check({ ...fixture, labels: [label("authorized:schema-migration")] }))).not.toContain("authorization:schema_migration");
  });

  test("environment changes (vercel.json) need Maya's label", () => {
    const fixture: Fixture = {
      changes: [{ status: "M", path: "vercel.json" }],
      base: { "vercel.json": '{"crons":[]}\n' },
      head: { "vercel.json": '{"crons":[{"path":"/api/cron/x","schedule":"0 1 * * *"}]}\n' },
    };
    expect(rules(check(fixture))).toContain("authorization:environment");
    expect(rules(check({ ...fixture, labels: [label("authorized:environment")] }))).not.toContain("authorization:environment");
  });

  test("the safety root cannot be changed or deleted without Maya's label", () => {
    const edit: Fixture = {
      changes: [{ status: "M", path: ".github/workflows/pr-check.yml" }],
      base: { ".github/workflows/pr-check.yml": "name: PR checks\n" },
      head: { ".github/workflows/pr-check.yml": "name: PR checks (weakened)\n" },
    };
    const removal: Fixture = { changes: [{ status: "D", path: "scripts/ci/pr-safety-check.mjs" }], base: { "scripts/ci/pr-safety-check.mjs": "// check\n" } };
    expect(rules(check(edit))).toContain("authorization:safety_root");
    expect(rules(check(removal))).toContain("authorization:safety_root");
    expect(rules(check({ ...edit, labels: [label("authorized:safety-root")] }))).not.toContain("authorization:safety_root");
  });

  describe("database chain", () => {
    const BASE: Record<string, string> = {
      "vercel.json": '{"$schema":"https://openapi.vercel.sh/vercel.json","crons":[{"path":"/api/cron/sync","schedule":"0 5 * * *"}]}\n',
      "lib/db.ts": 'import { Pool } from "pg";\nexport const pool = new Pool({ connectionString: process.env.DATABASE_URL });\n',
      "prisma/schema.prisma": 'datasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}\nmodel Listing {\n  id Int @id\n}\n',
      ".github/workflows/deploy-proof.yml": "name: preview and production proof\non: push\n",
      "tests/runtime/db.test.ts": 'import { pool } from "../../lib/db";\ntest("database pool", () => { expect(pool).toBeDefined(); });\n',
      "docs/db.md": "# Database notes\n",
    };
    const FULL_CHAIN: Record<string, string[]> = {
      vercel_integration: ["vercel.json"],
      env_resolution: ["lib/db.ts"],
      db_target: ["lib/db.ts"],
      prisma_pg: ["prisma/schema.prisma"],
      migrations: ["prisma/schema.prisma"],
      workflows_crons: ["vercel.json"],
      preview: [".github/workflows/deploy-proof.yml"],
      production: [".github/workflows/deploy-proof.yml"],
      downstream_readers_writers: ["lib/db.ts"],
      tests: ["tests/runtime/db.test.ts"],
    };
    const body = (chain: Record<string, unknown>) => "Change.\n\n```database-chain\n" + JSON.stringify(chain, null, 2) + "\n```\n";
    const dbChange = (description: string): Fixture => ({
      changes: [{ status: "M", path: "lib/db.ts" }],
      base: BASE,
      head: { ...BASE, "lib/db.ts": BASE["lib/db.ts"] + "export const max = 5;\n" },
      baseDirs: ["prisma/migrations"],
      body: description,
    });

    test("a database-shaped change without a chain fails", () => {
      const r = check(dbChange("No chain here."));
      expect(r.databaseChanges).toContain("lib/db.ts");
      expect(rules(r)).toContain("database-chain");
    });

    test("a complete, grounded chain passes", () => {
      expect(check(dbChange(body(FULL_CHAIN)))).toMatchObject({ ok: true, failures: [] });
    });

    test.each([
      ["a missing station", { ...FULL_CHAIN, tests: [] }],
      ["an UNVERIFIED station", { ...FULL_CHAIN, preview: ["UNVERIFIED - no preview proof yet"] }],
      ["free text", { ...FULL_CHAIN, db_target: ["checked"] }],
      ["a document instead of code", { ...FULL_CHAIN, db_target: ["docs/db.md"] }],
      ["a path that does not exist", { ...FULL_CHAIN, prisma_pg: ["lib/prisma-client.ts"] }],
      ["a directory", { ...FULL_CHAIN, migrations: ["prisma/migrations"] }],
      ["a real file of the wrong kind", { ...FULL_CHAIN, tests: ["lib/db.ts"] }],
    ])("%s fails the chain", (_name, chain) => {
      expect(rules(check(dbChange(body(chain))))).toContain("database-chain");
    });

    test("deleting a database reader is a database change", () => {
      const r = check({ changes: [{ status: "D", path: "lib/db.ts" }], base: BASE, head: {} });
      expect(r.databaseChanges).toContain("lib/db.ts");
      expect(rules(r)).toContain("database-chain");
    });
  });
});
