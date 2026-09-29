import { spawnSync } from "node:child_process";
import path from "node:path";

// The PR safety check is exercised through its --stdin mode with in-memory fixtures.
// No git repository, temp directory or file is created, so running this suite leaves
// nothing behind (the retired controller's test created a temp git repo per case).
const SCRIPT = path.resolve(__dirname, "../../scripts/ci/pr-safety-check.mjs");
const MAYA = "mallan67";

type Change = { status: "A" | "M" | "D"; path: string };
type Label = { name: string; addedBy: string };
type Fixture = {
  changes: Change[];
  base?: Record<string, string>;
  head?: Record<string, string>;
  baseDirs?: string[];
  labels?: Label[];
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
const authRules = (r: Result) => rules(r).filter((x) => x.startsWith("authorization:")).sort();
const label = (name: string, addedBy = MAYA): Label => ({ name, addedBy });
const added = (file: string, body: string): Fixture => ({ changes: [{ status: "A", path: file }], head: { [file]: body } });
const merge = (a: Fixture, b: Fixture): Fixture => ({
  changes: [...a.changes, ...b.changes],
  base: { ...(a.base || {}), ...(b.base || {}) },
  head: { ...(a.head || {}), ...(b.head || {}) },
});

// One label per explicit Maya authorization boundary.
const LABEL: Record<string, string> = {
  schema_migration: "authorized:schema-migration",
  production_database: "authorized:production-database",
  preview_neon: "authorized:preview-neon",
  environment: "authorized:environment",
  credential_rotation: "authorized:credential-rotation",
  destructive_data: "authorized:destructive-data",
  manual_cron: "authorized:manual-cron",
  production_deploy: "authorized:production-deploy",
  provider_publishing: "authorized:provider-publishing",
  safety_root: "authorized:safety-root",
};
const CLASSES = Object.keys(LABEL);
const EVERY_LABEL = Object.values(LABEL).map((n) => label(n));

// A representative change for each boundary, recognised by what the code DOES, in a file whose
// name says nothing about it. Each one triggers exactly its own class.
const REPRESENTATIVE: Record<string, Fixture> = {
  schema_migration: added("scripts/db/add-column.ts", 'await prisma.$executeRawUnsafe("ALTER TABLE listings ADD COLUMN floor_plan_url text");\n'),
  production_database: added("scripts/ops/point-at-db.sh", 'export DATABASE_URL="postgresql://app:pw@ep-cold-waterfall-adno3ao2.us-east-1.aws.neon.tech/neondb"\n'),
  preview_neon: added("lib/preview/db.ts", "await integrations.neon.createBranch({ name: pullRequestName });\n"),
  environment: added(".github/workflows/set-env.yml", "on: push\njobs:\n  env:\n    runs-on: ubuntu-latest\n    steps:\n      - run: vercel env add RESEND_API_KEY production\n"),
  credential_rotation: added("scripts/ops/renew-email-key.sh", 'gh secret set RESEND_API_KEY --body "$NEW_KEY"\n'),
  destructive_data: added("lib/media/photos.ts", "await r2.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys } }));\n"),
  manual_cron: added("scripts/ops/run-sync.sh", 'curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://www.mallan.nyc/api/cron/sync-listings\n'),
  production_deploy: added(".github/workflows/ship.yml", 'on: push\njobs:\n  ship:\n    runs-on: ubuntu-latest\n    steps:\n      - run: vercel deploy --prod --token "$VERCEL_TOKEN"\n'),
  provider_publishing: added("lib/listings/outbound.ts", 'await fetch("https://feeds.streeteasy.com/api/upload", { method: "POST", body: xml });\n'),
  safety_root: added("scripts/ops/unprotect.sh", "gh api -X DELETE repos/mallan67/mallan-nyc/rulesets/19435006\n"),
};

describe("PR safety check", () => {
  test("an ordinary change passes", () => {
    const r = check({
      changes: [{ status: "M", path: "lib/listings/format.ts" }],
      base: { "lib/listings/format.ts": "export const a = 1;\n" },
      head: { "lib/listings/format.ts": "export const a = 2;\n" },
    });
    expect(r).toMatchObject({ ok: true, failures: [] });
  });

  describe("every Maya authorization boundary", () => {
    test.each(CLASSES)("%s: an unauthorized change fails, and only its own class is required", (cls) => {
      expect(authRules(check(REPRESENTATIVE[cls]))).toEqual(["authorization:" + cls]);
    });

    test.each(CLASSES)("%s: Maya's label for this class authorizes it", (cls) => {
      expect(authRules(check({ ...REPRESENTATIVE[cls], labels: [label(LABEL[cls])] }))).toEqual([]);
    });

    test.each(CLASSES)("%s: every other label together does not authorize it", (cls) => {
      const others = EVERY_LABEL.filter((l) => l.name !== LABEL[cls]);
      expect(authRules(check({ ...REPRESENTATIVE[cls], labels: others }))).toEqual(["authorization:" + cls]);
    });

    test.each(CLASSES)("%s: its label permits only this class, not a second class in the same pull request", (cls) => {
      const other = CLASSES[(CLASSES.indexOf(cls) + 1) % CLASSES.length];
      const combined = merge(REPRESENTATIVE[cls], REPRESENTATIVE[other]);
      expect(authRules(check({ ...combined, labels: [label(LABEL[cls])] }))).toEqual(["authorization:" + other]);
    });

    test.each(CLASSES)("%s: the label counts only when an authorizer added it", (cls) => {
      const fixture = { ...REPRESENTATIVE[cls], labels: [label(LABEL[cls], "mallan-agent")] };
      expect(authRules(check(fixture))).toEqual(["authorization:" + cls]);
    });
  });

  describe("retired direct-Neon capability stays absolutely prohibited", () => {
    test("a retired direct-Neon path never returns, even with every label", () => {
      const r = check({ ...added(".github/workflows/rotate-db-keys.yml", "name: stub\non: workflow_dispatch\n"), labels: EVERY_LABEL });
      expect(r.ok).toBe(false);
      expect(rules(r)).toContain("retired-neon-path");
    });

    test.each([
      ["a plain URL", "scripts/tools/ops.ts", 'await fetch("https://console.neon.tech/api/v2/projects");\n'],
      ["a concatenated host", "scripts/tools/host.ts", 'const host = "console" + "." + "neon" + ".tech";\n'],
      ["a hex-escaped host", "lib/ops/host.py", 'host = "console\\x2eneon\\x2etech"\n'],
      ["a CLI call", "scripts/verify.sh", "#!/bin/sh\nneonctl branches list\n"],
      ["an admin key in a workflow", ".github/workflows/x.yml", "env:\n  KEY: ${{ secrets.NEON_API_KEY }}\n"],
    ])("Neon control-plane capability is refused under any name, even with every label: %s", (_name, file, body) => {
      expect(rules(check({ ...added(file, body), labels: EVERY_LABEL }))).toContain("neon-capability");
    });

    test("a document that mentions Neon tooling is not a capability", () => {
      expect(rules(check(added("docs/notes.md", "We once used neonctl.\n")))).not.toContain("neon-capability");
    });
  });

  describe("detection follows what the change introduces", () => {
    const R2 = "lib/images/r2-store.ts";
    const existing = 'import { DeleteObjectCommand } from "@aws-sdk/client-s3";\nexport const remove = (k: string) => r2.send(new DeleteObjectCommand({ Bucket, Key: k }));\nexport const version = 1;\n';

    test("editing next to an existing destructive operation needs no label", () => {
      const r = check({ changes: [{ status: "M", path: R2 }], base: { [R2]: existing }, head: { [R2]: existing.replace("version = 1", "version = 2") } });
      expect(authRules(r)).toEqual([]);
    });

    test("moving that operation into another file needs the label there", () => {
      const r = check(added("lib/images/other.ts", "export const drop = (k: string) => r2.send(new DeleteObjectCommand({ Bucket, Key: k }));\n"));
      expect(authRules(r)).toEqual(["authorization:destructive_data"]);
    });

    test("a comment that describes an operation is not the operation", () => {
      expect(authRules(check(added("scripts/notes.ts", "// vercel deploy --prod is run by Maya only\nexport const x = 1;\n")))).toEqual([]);
    });

    test("UI text and CSS that share a word with SQL are not SQL", () => {
      expect(authRules(check(added("app/components/Card.tsx", 'export const C = () => <p className="truncate">Delete from favorites</p>;\n')))).toEqual([]);
    });

    test("a path rule fires on any change, including deleting a migration", () => {
      const file = "prisma/migrations/20260101000000_x/migration.sql";
      const r = check({ changes: [{ status: "D", path: file }], base: { [file]: "ALTER TABLE a ADD COLUMN b int;\n" } });
      expect(authRules(r)).toContain("authorization:schema_migration");
    });

    test("editing the safety root by name needs authorized:safety-root", () => {
      const edit: Fixture = {
        changes: [{ status: "M", path: ".github/workflows/pr-check.yml" }],
        base: { ".github/workflows/pr-check.yml": "name: PR checks\n" },
        head: { ".github/workflows/pr-check.yml": "name: PR checks (weakened)\n" },
      };
      expect(authRules(check(edit))).toEqual(["authorization:safety_root"]);
      expect(authRules(check({ ...edit, labels: [label(LABEL.safety_root)] }))).toEqual([]);
      expect(authRules(check({ changes: [{ status: "D", path: "scripts/ci/pr-safety-check.mjs" }], base: { "scripts/ci/pr-safety-check.mjs": "// check\n" } })))
        .toEqual(["authorization:safety_root"]);
    });
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
    const dbChange = (description: string): Fixture & { baseDirs: string[]; body: string } => ({
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
