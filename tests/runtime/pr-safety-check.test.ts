import { spawnSync } from "node:child_process";
import path from "node:path";

// The PR safety check is exercised through its --stdin mode with in-memory fixtures. No git
// repository, temp directory or file is created, so running this suite leaves nothing behind.
// A fixture's head tree is its base tree with the listed changes applied, as on GitHub.
const SCRIPT = path.resolve(__dirname, "../../scripts/ci/pr-safety-check.mjs");
const MAYA = "mallan67";

type Change = { status: "A" | "M" | "D" | "R"; path: string; previousPath?: string };
type Label = { name: string; addedBy?: string; addedAt?: string };
type Fixture = {
  changes: Change[];
  base?: Record<string, string>;
  head?: Record<string, string>;
  baseTip?: Record<string, string>;
  headTypes?: Record<string, string>;
  headErrors?: string[];
  executable?: string[];
  repo?: string;
  headRepo?: string | null;
  changedFiles?: number;
  event?: string;
  baseChanged?: boolean;
  headSeenAt?: string | null;
  labels?: Label[];
  authorizers?: string[];
  body?: string;
};
type Result = { ok: boolean; failures: { rule: string; items: string[] }[]; databaseChanges: string[] };

// The base tip always carries a realistic required check, so the safety root is resolved as in CI.
const PR_CHECK = "name: PR checks\non: pull_request\njobs:\n  pr-check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm ci\n      - run: npx jest --ci --forceExit\n      - run: npm run rls:validate\n      - run: node scripts/ci-compliance-check.js\n      - run: npm run audit:display-compliance\n";
const PACKAGE = JSON.stringify({
  scripts: {
    postinstall: "prisma generate",
    "rls:validate": "node scripts/validate-rls-compliance.js",
    "audit:display-compliance": "npm run audit:attribution && npm run audit:pii",
    "audit:attribution": "tsx scripts/audit-public-attribution.ts",
    "audit:pii": "tsx scripts/audit-pii-masking.ts",
    build: "next build",
  },
}, null, 2) + "\n";
const JEST = "module.exports = { projects: ['<rootDir>/tests/runtime/jest.config.js'] };\n";
const RUNTIME_JEST = "module.exports = { rootDir: '../..', roots: ['<rootDir>/tests/runtime'], setupFiles: ['<rootDir>/tests/runtime/setup.ts'] };\n";
const TREE: Record<string, string> = {
  ".github/workflows/pr-check.yml": PR_CHECK,
  "package.json": PACKAGE,
  "jest.config.js": JEST,
  "tests/runtime/jest.config.js": RUNTIME_JEST,
  "tests/runtime/setup.ts": "export {};\n",
  "scripts/validate-rls-compliance.js": "require('./rls/rules');\nconst ALIASES = path.join(ROOT, 'data', 'rls-field-aliases.json');\n",
  "scripts/rls/rules.js": "require('./data');\nmodule.exports = [];\n",
  "scripts/rls/data.js": "import './extra.js';\nconst GEO = path.join(ROOT, 'data', 'rls');\nmodule.exports = {};\n",
  "scripts/rls/extra.js": "export {};\n",
  "scripts/ci-compliance-check.js": "const NEIGHBORHOODS = ['data/manhattan-neighborhoods.json'];\nprocess.exitCode = 0;\n",
  "scripts/audit-public-attribution.ts": "export {};\n",
  "scripts/audit-pii-masking.ts": "export {};\n",
};

// Every new file is named in the description unless a test says otherwise (Master §27.15).
function check(fixture: Fixture): Result {
  const named = fixture.changes.filter((c) => c.status === "A" || c.status === "R").map((c) => c.path).join("\n");
  const input = { ...fixture, base: { ...TREE, ...(fixture.base || {}) }, body: fixture.body ?? "New files:\n" + named };
  const run = spawnSync(process.execPath, [SCRIPT, "--stdin"], { input: JSON.stringify(input), encoding: "utf8", maxBuffer: 1 << 28 });
  if (run.status !== 0) throw new Error("pr-safety-check crashed: " + run.stderr);
  return JSON.parse(run.stdout) as Result;
}
const rules = (r: Result) => r.failures.map((f) => f.rule);
const authRules = (r: Result) => rules(r).filter((x) => x.startsWith("authorization:")).sort();
const label = (name: string, addedBy = MAYA): Label => ({ name, addedBy });
const added = (file: string, body: string): Fixture => ({ changes: [{ status: "A", path: file }], head: { [file]: body } });
const modified = (file: string, base: string, head: string): Fixture => ({ changes: [{ status: "M", path: file }], base: { [file]: base }, head: { [file]: head } });
const merge = (a: Fixture, b: Fixture): Fixture => ({
  changes: [...a.changes, ...b.changes],
  base: { ...(a.base || {}), ...(b.base || {}) },
  head: { ...(a.head || {}), ...(b.head || {}) },
});

// One label per explicit Maya authorization boundary, plus operator programs.
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
  operator: "authorized:operator",
  safety_root: "authorized:safety-root",
};
const CLASSES = Object.keys(LABEL);
const EVERY_LABEL = Object.values(LABEL).map((n) => label(n));

// A representative change for each boundary, in application code whose file name says nothing
// about it (except the operator class, which is decided by where the program lives). Each one
// triggers exactly its own class.
const REPRESENTATIVE: Record<string, Fixture> = {
  schema_migration: added("lib/db-tools/add-column.ts", 'await prisma.$executeRawUnsafe("ALTER TABLE listings ADD COLUMN floor_plan_url text");\n'),
  production_database: added("lib/config/db-host.ts", 'export const HOST = "ep-cold-waterfall-adno3ao2.us-east-1.aws.neon.tech";\n'),
  preview_neon: added("lib/preview/db.ts", "await integrations.neon.createBranch({ name: pullRequestName });\n"),
  environment: added("lib/vercel/env.ts", 'await vercel.projects.createProjectEnv({ key: "RESEND_API_KEY", target: ["production"] });\n'),
  credential_rotation: added("lib/admin/keys.ts", 'await octokit.request("PUT /repos/o/r/actions/secrets/RESEND_API_KEY", { encrypted_value });\n'),
  destructive_data: added("lib/media/photos.ts", "await r2.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys } }));\n"),
  manual_cron: added("lib/admin/rerun.ts", 'await octokit.actions.createWorkflowDispatch({ owner, repo, workflow_id: "sync.yml", ref: "main" });\n'),
  production_deploy: added("lib/admin/ship.ts", 'await fetch(`https://api.vercel.com/v10/projects/${project}/promote/${id}`, { method: "POST" });\n'),
  provider_publishing: added("lib/listings/outbound.ts", 'await fetch("https://feeds.streeteasy.com/api/upload", { method: "POST", body: xml });\n'),
  operator: added("scripts/ops/report.sh", "#!/bin/sh\necho report\n"),
  safety_root: added("lib/admin/protect.ts", 'await octokit.request("DELETE /repos/o/r/rulesets/19435006");\n'),
};

describe("PR safety check", () => {
  test("an ordinary product change passes", () => {
    expect(check(modified("lib/listings/format.ts", "export const a = 1;\n", "export const a = 2;\n"))).toMatchObject({ ok: true, failures: [] });
  });

  test("ordinary new product files pass, including a new mapper, engine or Search module", () => {
    const r = check(merge(
      merge(added("app/listings/[id]/page.tsx", "export default function Page() { return null; }\n"), added("components/ListingCard.tsx", "export const Card = () => null;\n")),
      merge(added("lib/search/listing-field-mapper.ts", "export const mapListing = (row: unknown) => row;\n"), added("lib/cma/engine.ts", "export {};\n")),
    ));
    expect(r).toMatchObject({ ok: true, failures: [] });
  });

  test("editing a file that queries through the canonical Prisma client needs no label and no chain", () => {
    const q = 'import { prisma } from "@/lib/prisma";\nexport const find = () => prisma.listing.findMany({ where: { idx_display_yn: true } });\n';
    expect(check(modified("lib/search/core.ts", q, q + "export const pageSize = 24;\n"))).toMatchObject({ ok: true, failures: [] });
  });

  describe("trust boundary: nothing is inspected on a pull request that fails it", () => {
    test("a fork or cross-repository pull request is rejected before any content is read", () => {
      const r = check({ ...added("scripts/x.ts", 'fetch("https://console.neon.tech/api/v2")\n'), headRepo: "someone/mallan-nyc", labels: EVERY_LABEL });
      expect(rules(r)).toEqual(["trust:repository"]);
      expect(rules(check({ ...added("lib/a.ts", "export {};\n"), headRepo: null }))).toEqual(["trust:repository"]);
    });

    test("an incomplete or inconsistent file census fails", () => {
      const one = added("lib/a.ts", "export {};\n");
      expect(rules(check({ ...one, changedFiles: 2 }))).toEqual(["trust:file-census"]);
      expect(rules(check({ ...one, changedFiles: 3000 }))).toEqual(["trust:file-census"]);
      expect(rules(check({ ...one, changes: [...one.changes, ...one.changes], changedFiles: 2 }))).toEqual(["trust:file-census"]);
      expect(rules(check({ ...one, changes: [{ status: "" as never, path: "lib/a.ts" }] }))).toEqual(["trust:file-census"]);
    });

    test.each(["symlink", "submodule", "tree"])("a %s where a changed file should be fails closed", (kind) => {
      const r = check({ ...added("lib/a.ts", "export {};\n"), headTypes: { "lib/a.ts": kind }, labels: EVERY_LABEL });
      expect(rules(r)).toEqual(["trust:unreadable"]);
    });

    test("a changed file that cannot be read, or is missing, is never treated as harmless", () => {
      expect(rules(check({ ...added("lib/a.ts", "export {};\n"), headErrors: ["lib/a.ts"] }))).toEqual(["trust:unreadable"]);
      expect(rules(check({ changes: [{ status: "A", path: "lib/a.ts" }] }))).toEqual(["trust:unreadable"]);
      expect(rules(check({ changes: [{ status: "M", path: "lib/b.ts" }], head: { "lib/b.ts": "x\n" } }))).toEqual(["trust:unreadable"]);
    });

    test("a runnable file that is binary or too large fails closed; a binary image does not", () => {
      expect(rules(check(added("lib/tool.js", "\u0000\u0001ELF")))).toContain("trust:uninspectable");
      expect(rules(check({ ...added("bin/tool", "\u0000ELF"), executable: ["bin/tool"] }))).toContain("trust:uninspectable");
      expect(rules(check(added("lib/huge.js", "x".repeat(5 * 1024 * 1024 + 1))))).toContain("trust:uninspectable");
      expect(rules(check(added("config/huge.json", "\u0000")))).toContain("trust:uninspectable");
      expect(check(added("public/photo.png", "\u0000PNG"))).toMatchObject({ ok: true });
    });
  });

  describe("an authorization belongs to the exact head commit", () => {
    const fx = (over: Partial<Fixture>) => check({ ...REPRESENTATIVE.production_deploy, ...over });
    test("A labeled -> PASS; push B -> the earlier label cannot authorize B -> FAIL; label B -> PASS", () => {
      const pushedA = "2026-09-29T10:00:00Z", labeledA = "2026-09-29T10:05:00Z", pushedB = "2026-09-29T10:10:00Z", labeledB = "2026-09-29T10:15:00Z";
      expect(authRules(fx({ event: "labeled", headSeenAt: pushedA, labels: [{ name: LABEL.production_deploy, addedAt: labeledA }] }))).toEqual([]);
      // The push itself: labels are ignored (and the workflow removes the ones given before it).
      expect(authRules(fx({ event: "synchronize", headSeenAt: pushedB, labels: [{ name: LABEL.production_deploy, addedAt: labeledA }] }))).toEqual(["authorization:production_deploy"]);
      // Any later run for B: the label is older than B.
      expect(authRules(fx({ event: "edited", headSeenAt: pushedB, labels: [{ name: LABEL.production_deploy, addedAt: labeledA }] }))).toEqual(["authorization:production_deploy"]);
      expect(authRules(fx({ event: "labeled", headSeenAt: pushedB, labels: [{ name: LABEL.production_deploy, addedAt: labeledB }] }))).toEqual([]);
    });

    test("changing the base branch voids earlier labels, like a push", () => {
      expect(authRules(fx({ event: "edited", baseChanged: true, labels: [label(LABEL.production_deploy)] }))).toEqual(["authorization:production_deploy"]);
    });

    test("when the head's push time cannot be established, no label counts", () => {
      expect(authRules(fx({ headSeenAt: null, labels: [label(LABEL.production_deploy)] }))).toEqual(["authorization:production_deploy"]);
    });

    test("a label counts only when an authorizer added it", () => {
      expect(authRules(fx({ labels: [label(LABEL.production_deploy, "mallan-agent")] }))).toEqual(["authorization:production_deploy"]);
    });
  });

  describe("every authorization boundary", () => {
    test.each(CLASSES)("%s: an unauthorized change fails, and only its own class is required", (cls) => {
      expect(authRules(check(REPRESENTATIVE[cls]))).toEqual(["authorization:" + cls]);
    });

    test.each(CLASSES)("%s: the label for this class authorizes it", (cls) => {
      expect(authRules(check({ ...REPRESENTATIVE[cls], labels: [label(LABEL[cls])] }))).toEqual([]);
    });

    test.each(CLASSES)("%s: every other label together does not authorize it", (cls) => {
      const others = EVERY_LABEL.filter((l) => l.name !== LABEL[cls]);
      expect(authRules(check({ ...REPRESENTATIVE[cls], labels: others }))).toEqual(["authorization:" + cls]);
    });

    test.each(CLASSES)("%s: its label does not cover a second class in the same pull request", (cls) => {
      const other = CLASSES[(CLASSES.indexOf(cls) + 1) % CLASSES.length];
      const combined = merge(REPRESENTATIVE[cls], REPRESENTATIVE[other]);
      expect(authRules(check({ ...combined, labels: [label(LABEL[cls])] }))).toEqual(["authorization:" + other]);
    });
  });

  describe("where the change is decides first", () => {
    test.each([
      ["prisma/schema.prisma", "schema_migration"],
      ["sql/views/listing_search.sql", "schema_migration"],
      ["prisma.config.ts", "schema_migration"],
      ["lib/ops/db-target.ts", "production_database"],
      ["lib/prisma.ts", "production_database"],
      ["lib/neon/client.ts", "preview_neon"],
      ["lib/retention/diagnostic-sweep.ts", "destructive_data"],
      ["lib/ops/r2-orphan-plan.ts", "destructive_data"],
      ["app/api/cron/sync-listings/route.ts", "manual_cron"],
      ["lib/syndication/streeteasy.ts", "provider_publishing"],
      ["app/api/feeds/zillow/route.ts", "provider_publishing"],
      ["scripts/recover-residual-listing-media.ts", "operator"],
      ["scripts/ops/steps.txt", "operator"],
      ["tools/run_sql.js", "operator"],
      ["run-fetch-and-map.sh", "operator"],
      ["public/crm/scripts/validate-mockups.sh", "operator"],
      ["docker-compose.yml", "operator"],
      ["backend/Dockerfile", "operator"],
      ["infra/main.tf", "operator"],
      [".githooks/pre-commit", "operator"],
    ])("%s -> %s, whatever it contains", (file, cls) => {
      expect(authRules(check(added(file, "export {};\n")))).toContain("authorization:" + cls);
    });

    test("any file marked executable or started with #! is an operator program, whatever its name", () => {
      expect(authRules(check({ ...added("lib/tasks/ship", "vercel deploy --prod\n"), executable: ["lib/tasks/ship"] }))).toContain("authorization:operator");
      expect(authRules(check(added("app/ops/run", "#!/usr/bin/env bash\necho hi\n")))).toContain("authorization:operator");
    });

    test("deleting an operator program needs no label; deleting schema does", () => {
      expect(authRules(check({ changes: [{ status: "D", path: "scripts/old-sync.js" }], base: { "scripts/old-sync.js": "x\n" } }))).toEqual([]);
      const file = "prisma/migrations/20260101000000_x/migration.sql";
      expect(authRules(check({ changes: [{ status: "D", path: file }], base: { [file]: "ALTER TABLE a ADD COLUMN b int;\n" } }))).toContain("authorization:schema_migration");
    });

    test("vercel.json is environment, Production deployment and safety root at once", () => {
      expect(authRules(check(modified("vercel.json", "{}\n", '{"crons":[]}\n')))).toEqual(["authorization:environment", "authorization:production_deploy", "authorization:safety_root"]);
    });

    test("renaming a file out of prisma/ is a schema change; renaming dangerous code unchanged is not new", () => {
      const moved: Fixture = { changes: [{ status: "R", path: "lib/old-schema.prisma.txt", previousPath: "prisma/schema.prisma" }], base: { "prisma/schema.prisma": "model A { id Int @id }\n" }, head: { "lib/old-schema.prisma.txt": "model A { id Int @id }\n" } };
      expect(authRules(check(moved))).toContain("authorization:schema_migration");
      const body = "await r2.send(new DeleteObjectCommand({ Bucket, Key: k }));\n";
      const rename: Fixture = { changes: [{ status: "R", path: "lib/media/store.ts", previousPath: "lib/media/r2.ts" }], base: { "lib/media/r2.ts": body }, head: { "lib/media/store.ts": body } };
      expect(authRules(check(rename))).toEqual([]);
      expect(authRules(check({ ...rename, head: { "lib/media/store.ts": body + body } }))).toEqual(["authorization:destructive_data"]);
    });
  });

  describe("the safety root, including everything the required pr-check runs", () => {
    test.each([
      ["MALLAN-PLATFORM-MASTER-PLAN.md", "the Master"],
      ["AGENTS.md", "agent instructions"],
      ["CLAUDE.md", "agent instructions"],
      ["claude.md", "a case variant of the agent instructions"],
      ["lib/search/CLAUDE.md", "nested agent instructions"],
      [".claude/settings.json", "agent tool configuration"],
      [".mcp.json", "agent tool configuration"],
      ["package.json", "npm scripts (could make a required step a no-op)"],
      ["package-lock.json", "the installed dependency set"],
      [".npmrc", "npm configuration (script-shell could make every npm run a no-op)"],
      ["tsconfig.json", "type-check configuration"],
      ["lib/search/babel.config.json", "a nested Babel configuration"],
      ["jest.config.js", "test discovery"],
      ["tests/runtime/jest.config.js", "test discovery"],
      ["tests/runtime/setup.ts", "a Jest setup file"],
      ["scripts/validate-rls-compliance.js", "a script pr-check runs"],
      ["scripts/rls/rules.js", "a module that script loads"],
      ["scripts/rls/data.js", "a module loaded two levels down"],
      ["scripts/rls/extra.js", "a module loaded by a bare import"],
      ["scripts/audit-pii-masking.ts", "a script pr-check runs through a nested npm script"],
      ["compliance/rules/ucba-audit-checklist.json", "a validator's rules"],
      ["data/rls-field-aliases.json", "data a validator names through path.join"],
      ["data/manhattan-neighborhoods.json", "data a required check names by path"],
      ["data/rls/geo/neighborhoods.v1.geojson", "data under a directory a validator names"],
      [".github/workflows/nightly.yml", "any workflow"],
      [".github/actions/setup/action.yml", "any action"],
      [".github/pull_request_template.md", "GitHub configuration"],
      ["scripts/ci/pr-safety-check.mjs", "this check"],
      ["tests/runtime/reserved-check-names.test.ts", "the reserved-name test"],
    ])("changing %s (%s) needs authorized:safety-root and no operator label", (file) => {
      const change = modified(file, TREE[file] || "x\n", (TREE[file] || "x\n") + "\n");
      const needed = authRules(check(change));
      expect(needed).toContain("authorization:safety_root");
      expect(needed).not.toContain("authorization:operator");
      expect(authRules(check({ ...change, labels: [label(LABEL.safety_root), label(LABEL.environment), label(LABEL.production_deploy)] }))).toEqual([]);
    });

    test("data no required check names is ordinary content", () => {
      expect(check(modified("data/pages/terms.json", '{"title":"Terms"}\n', '{"title":"Terms of use"}\n'))).toMatchObject({ ok: true, failures: [] });
      expect(check(modified("data/rls-crm-overlays.json", "{}\n", '{"a":1}\n'))).toMatchObject({ ok: true });
    });

    test("package.json turning required scripts into no-ops needs authorized:safety-root", () => {
      const noop = PACKAGE.replace("node scripts/validate-rls-compliance.js", "true");
      expect(authRules(check(modified("package.json", PACKAGE, noop)))).toEqual(["authorization:safety_root"]);
    });

    test("a Jest config change that stops tests being discovered needs authorized:safety-root", () => {
      expect(authRules(check(modified("tests/runtime/jest.config.js", RUNTIME_JEST, RUNTIME_JEST.replace("'<rootDir>/tests/runtime'", "'<rootDir>/tests/none'"))))).toEqual(["authorization:safety_root"]);
      expect(authRules(check(added("lib/search/jest.config.ts", "export default { testMatch: [] };\n")))).toEqual(["authorization:safety_root"]);
    });

    test("deleting a safety-root file needs authorized:safety-root", () => {
      expect(authRules(check({ changes: [{ status: "D", path: "scripts/ci-compliance-check.js" }] }))).toEqual(["authorization:safety_root"]);
    });

    test("the root is resolved from the BASE, so the pull request cannot shrink it", () => {
      const pkg = modified("package.json", PACKAGE, PACKAGE.replace("node scripts/validate-rls-compliance.js", "true"));
      const script = modified("scripts/validate-rls-compliance.js", TREE["scripts/validate-rls-compliance.js"], "// disabled\n");
      expect(check(merge(pkg, script)).failures.find((f) => f.rule === "authorization:safety_root")!.items).toEqual(
        expect.arrayContaining([expect.stringContaining("scripts/validate-rls-compliance.js  (run or read by the required pr-check)")]));
    });

    test("an unreadable required-check definition on the base fails closed", () => {
      expect(rules(check({ ...added("lib/a.ts", "export {};\n"), baseTip: {} }))).toContain("trust:required-check-root");
    });
  });

  describe("reserved required-check names", () => {
    test.each(["pr-check", "pr-safety"])("a second workflow emitting %s is refused, even with every label", (name) => {
      const wf = "on: pull_request\njobs:\n  " + name + ":\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n";
      expect(rules(check({ ...added(".github/workflows/fast.yml", wf), labels: EVERY_LABEL }))).toContain("reserved-check-name");
      const named = "on: pull_request\njobs:\n  quick:\n    name: " + name + "\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n";
      expect(rules(check({ ...added(".github/workflows/fast.yml", named), labels: EVERY_LABEL }))).toContain("reserved-check-name");
    });

    test("a status or check-run call carrying a reserved name is refused", () => {
      const js = 'await octokit.request("POST /repos/{owner}/{repo}/statuses/{sha}", { state: "success", context: "pr-check" });\n';
      expect(rules(check({ ...added("lib/ops/mark.js", js), labels: EVERY_LABEL }))).toContain("reserved-check-name");
    });

    test("the canonical workflows may use their own names", () => {
      const own = "name: PR checks\non: pull_request\njobs:\n  pr-check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm ci\n";
      const r = check({ ...modified(".github/workflows/pr-check.yml", PR_CHECK, own), labels: [label(LABEL.safety_root)] });
      expect(rules(r)).not.toContain("reserved-check-name");
    });
  });

  describe("content tripwires: an operation counts when the pull request adds an occurrence of it", () => {
    // Each operation spread over several lines. No single line matches on its own (proved below).
    // Shell and PowerShell files are operator programs by location, so they also need that label.
    // (The manual-cron and safety-root tripwires are single tokens, such as createWorkflowDispatch
    // or /rulesets, so they have no multi-line form.)
    const MULTILINE: Record<string, [string, string]> = {
      schema_migration: ["lib/db-tools/change.ts", "await prisma.$executeRawUnsafe(`\n  ALTER\n    TABLE listings\n  ADD COLUMN floor_plan_url text\n`);\n"],
      production_database: ["ops/pull-env.sh", "#!/bin/sh\nvercel env pull \\\n  --environment=production \\\n  .env.local\n"],
      preview_neon: ["lib/preview/db.ts", "await integrations.neon\n  .createBranch({ name: pullRequestName });\n"],
      environment: ["ops/set-env.sh", "#!/bin/sh\nvercel env \\\n  add RESEND_API_KEY production\n"],
      credential_rotation: ["ops/renew.sh", '#!/bin/sh\ngh secret \\\n  set RESEND_API_KEY --body "$NEW_KEY"\n'],
      destructive_data: ["ops/clear-media.sh", '#!/bin/sh\nnpx wrangler r2 object \\\n  delete "mallan-media/$KEY"\n'],
      production_deploy: ["ops/ship.ps1", "vercel deploy `\n  --prod `\n  --token $env:VERCEL_TOKEN\n"],
      provider_publishing: ["lib/listings/outbound.ts", 'const feedUrl =\n  "https://www.streeteasy.com" +\n  "/api/upload";\nawait fetch(feedUrl, { method: "POST", body: xml });\n'],
    };
    const MULTI = Object.keys(MULTILINE);
    const withoutOperator = (r: Result) => authRules(r).filter((x) => x !== "authorization:operator");
    const fixture = (cls: string, labels: Label[] = []): Fixture => ({ ...added(MULTILINE[cls][0], MULTILINE[cls][1]), labels });

    test.each(MULTI)("%s over several lines: FAILS without its label", (cls) => {
      expect(withoutOperator(check(fixture(cls)))).toEqual(["authorization:" + cls]);
    });

    test.each(MULTI)("%s over several lines: PASSES with its label (and the operator label for an operator program)", (cls) => {
      expect(authRules(check(fixture(cls, [label(LABEL[cls]), label(LABEL.operator)])))).toEqual([]);
    });

    test.each(MULTI)("%s: no single line of the operation matches on its own", (cls) => {
      const [file, body] = MULTILINE[cls];
      const dot = file.lastIndexOf(".");
      const pieces: Fixture = { changes: [], head: {} };
      body.split("\n").filter((l) => l.trim()).forEach((line, i) => {
        const piece = file.slice(0, dot) + "-line" + i + file.slice(dot);
        pieces.changes.push({ status: "A", path: piece });
        pieces.head![piece] = line.replace(/\s*[\\`]$/, "") + "\n";
      });
      expect(withoutOperator(check(pieces))).toEqual([]);
    });

    test("a line continuation inside a word joins it, as the shell does", () => {
      expect(authRules(check(added("ops/x.sh", "#!/bin/sh\nvercel deploy --pr\\\nod\n")))).toContain("authorization:production_deploy");
    });

    test("a YAML block scalar and a SQL statement over lines are one operation", () => {
      expect(authRules(check(added("ops/compose/migrate.yml", "services:\n  migrate:\n    command: >\n      npx prisma\n      migrate deploy\n")))).toEqual(["authorization:production_database", "authorization:schema_migration"]);
      expect(authRules(check(added("lib/db-tools/clean.sql", "DELETE\n  FROM listing_media\n  WHERE stale;\n")))).toEqual(["authorization:destructive_data"]);
    });

    test("an operation split across formatting (concatenation, argument lists, nearby variables) is found", () => {
      expect(authRules(check(added("lib/admin/a.ts", 'execFileSync("vercel", [\n  "deploy",\n  "--prebuilt",\n  "--prod",\n]);\n')))).toEqual(["authorization:production_deploy"]);
      expect(authRules(check(added("lib/admin/b.ts", 'const sub = "deploy";\nexecFileSync("vercel", [sub, "--prod"]);\n')))).toEqual(["authorization:production_deploy"]);
      expect(authRules(check(added("lib/admin/c.py", 'cmd = ["npx", "pri" "sma", "migrate", "deploy"]\n')))).toEqual(["authorization:production_database", "authorization:schema_migration"]);
    });

    test("KNOWN LIMIT: in application code, an operation built from values far apart is not seen", () => {
      const far = 'const flag = "--prod";\n' + "// padding padding padding\n".repeat(40) + 'execFileSync("vercel", ["deploy", flag]);\n';
      expect(authRules(check(added("lib/tools/x.ts", far)))).toEqual([]);
      // ...where the same code is an operator program, its location decides.
      expect(authRules(check(added("scripts/deploys.ts", far)))).toEqual(["authorization:operator"]);
    });

    test("reformatting existing dangerous code needs no label", () => {
      const base = 'execFileSync("vercel", ["deploy", "--prod"]);\nexport const v = 1;\n';
      const head = '    execFileSync(\n      "vercel",\n      ["deploy", "--prod"],\n    );\n\nexport const v = 1;\n';
      expect(authRules(check(modified("lib/admin/ship.ts", base, head)))).toEqual([]);
    });

    test("editing next to an existing operation needs no label; adding a second one does", () => {
      const base = "await r2.send(\n  new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys } }),\n);\nexport const version = 1;\n";
      expect(authRules(check(modified("lib/media/r2-clean.ts", base, base.replace("version = 1", "version = 2"))))).toEqual([]);
      expect(authRules(check(modified("lib/media/r2-clean.ts", base, base + "await r2.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: more } }));\n")))).toEqual(["authorization:destructive_data"]);
    });

    test("adding --prod to an existing multi-line vercel deploy needs authorized:production-deploy", () => {
      const base = "#!/bin/sh\nvercel deploy \\\n  --yes\n";
      expect(authRules(check(modified("ops/deploy.sh", base, base.replace("--yes", "--prod \\\n  --yes"))))).toEqual(["authorization:operator", "authorization:production_deploy"]);
    });
  });

  describe("comments, strings, URLs and prose", () => {
    test("a URL does not hide a later operation on the same line", () => {
      expect(authRules(check(added("lib/admin/x.ts", 'run("curl https://example.com/a && vercel deploy --prod");\n')))).toEqual(["authorization:production_deploy"]);
    });

    test("a comment naming an operation in runnable code counts (fail closed); prose documents do not", () => {
      expect(authRules(check(added("lib/notes.ts", "// vercel deploy --prod is run by Maya only\nexport const x = 1;\n")))).toEqual(["authorization:production_deploy"]);
      expect(authRules(check(added("docs/runbook.md", "Run `vercel deploy --prod` and `prisma migrate deploy`.\n")))).toEqual([]);
    });

    test("UI text and CSS that share a word with SQL are not operations", () => {
      expect(authRules(check(added("app/components/Card.tsx", 'export const C = () => <p className="truncate table-cell">Delete from favorites</p>;\n')))).toEqual([]);
    });

    test("tests may name operations; they are not run against real systems", () => {
      expect(authRules(check(added("tests/runtime/deploy.test.ts", "test('x', () => expect('vercel deploy --prod').toBeTruthy());\n")))).toEqual([]);
    });
  });

  describe("new files are stated in the pull request's scope", () => {
    test("a new runnable file not named in the description fails; naming it passes", () => {
      const fx = added("lib/search/facets.ts", "export {};\n");
      expect(rules(check({ ...fx, body: "Adds search facets." }))).toEqual(["scope:new-files"]);
      expect(check({ ...fx, body: "Adds lib/search/facets.ts (extends lib/search/core.ts)." })).toMatchObject({ ok: true });
    });

    test("tests, images and documents need no declaration", () => {
      const fx = merge(added("tests/runtime/facets.test.ts", "test('x', () => {});\n"), merge(added("public/a.png", "\u0000PNG"), added("docs/facets.md", "# Facets\n")));
      expect(check({ ...fx, body: "" })).toMatchObject({ ok: true });
    });
  });

  describe("performance on large and minified files", () => {
    test("a 20,000-line file and a 2 MB minified bundle are judged in seconds", () => {
      const long = Array.from({ length: 20000 }, (_, i) => `export const value${i} = compute("${i}", { key: ${i} });`).join("\n") + "\n";
      const minified = "var a=function(b){return b.map(function(c){return c+1})};".repeat(36000) + "\n";
      const started = Date.now();
      const r = check(merge(added("lib/big/generated.ts", long), added("public/vendor/bundle.min.js", minified)));
      expect(Date.now() - started).toBeLessThan(15000);
      expect(r.ok).toBe(true);
    });
  });

  describe("retired direct-Neon capability stays absolutely prohibited", () => {
    test("a retired direct-Neon path never returns, even with every label", () => {
      const r = check({ ...added(".github/workflows/rotate-db-keys.yml", "name: stub\non: workflow_dispatch\n"), labels: EVERY_LABEL });
      expect(rules(r)).toContain("retired-neon-path");
    });

    test.each([
      ["a plain URL", "lib/tools/ops.ts", 'await fetch("https://console.neon.tech/api/v2/projects");\n'],
      ["a concatenated host", "lib/tools/host.ts", 'const host = "console" + "." + "neon" + ".tech";\n'],
      ["a hex-escaped host", "lib/ops/host.py", 'host = "console\\x2eneon\\x2etech"\n'],
      ["a percent-encoded host", "lib/tools/pct.ts", 'await fetch("https://console%2Eneon%2Etech/api/v2/projects");\n'],
      ["a full-width host", "lib/tools/wide.ts", 'await fetch("https://ｃonsole.neon.tech/api/v2/projects");\n'],
      ["a CLI call", "ops/verify.sh", "#!/bin/sh\nneonctl branches list\n"],
      ["an admin key in a workflow", ".github/workflows/x.yml", "env:\n  KEY: ${{ secrets.NEON_API_KEY }}\n"],
      ["a text file another program runs", "ops/steps.txt", 'curl -H "Authorization: Bearer $NEON_API_KEY" https://console.neon.tech/api/v2/projects\n'],
      ["a JSON configuration value", "config/endpoints.json", '{ "neon": "https://console.neon.tech/api/v2" }\n'],
    ])("Neon control-plane capability is refused under any name, even with every label: %s", (_name, file, body) => {
      expect(rules(check({ ...added(file, body), labels: EVERY_LABEL }))).toContain("neon-capability");
    });

    test("a document that mentions Neon tooling is not a capability", () => {
      expect(rules(check(added("docs/notes.md", "We once used neonctl.\n")))).not.toContain("neon-capability");
    });

    test("KNOWN LIMIT: a host decoded at runtime (base64) is not seen by the token scan", () => {
      expect(rules(check(added("lib/tools/b64.ts", 'fetch(atob("Y29uc29sZS5uZW9uLnRlY2g="));\n')))).not.toContain("neon-capability");
    });
  });

  describe("database chain: database infrastructure and connections, proven on the proposed head", () => {
    const STORE = "lib/listings/store.ts";
    const BASE: Record<string, string> = {
      "vercel.json": '{"$schema":"https://openapi.vercel.sh/vercel.json","crons":[{"path":"/api/cron/sync","schedule":"0 5 * * *"}]}\n',
      [STORE]: 'import { Pool } from "pg";\nexport const pool = new Pool({ connectionString: process.env.DATABASE_URL });\n',
      "prisma/schema.prisma": 'datasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}\nmodel Listing {\n  id Int @id\n}\n',
      "scripts/release-safety/deploy-proof.js": "// proof\nexport const environments = ['preview', 'production'];\n",
      "tests/runtime/db.test.ts": 'import { pool } from "../../lib/listings/store";\ntest("database pool", () => { expect(pool).toBeDefined(); });\n',
      "docs/db.md": "# Database notes\n",
    };
    const FULL_CHAIN: Record<string, string[]> = {
      vercel_integration: ["vercel.json"],
      env_resolution: [STORE],
      db_target: [STORE],
      prisma_pg: ["prisma/schema.prisma"],
      migrations: ["prisma/schema.prisma"],
      workflows_crons: ["vercel.json"],
      preview: ["scripts/release-safety/deploy-proof.js"],
      production: ["scripts/release-safety/deploy-proof.js"],
      downstream_readers_writers: [STORE],
      tests: ["tests/runtime/db.test.ts"],
    };
    // Switching the connection variable is a change to the database target.
    const switched = BASE[STORE].replace("DATABASE_URL", "DATABASE_URL_UNPOOLED");
    const body = (chain: Record<string, unknown>) => "Change.\n\n```database-chain\n" + JSON.stringify(chain, null, 2) + "\n```\n";
    const dbChange = (description: string, extra: Partial<Fixture> = {}): Fixture => ({
      changes: [{ status: "M", path: STORE }],
      base: BASE,
      head: { [STORE]: switched },
      body: description,
      ...extra,
    });

    test("a change to a database connection without a chain fails", () => {
      const r = check(dbChange("No chain here."));
      expect(r.databaseChanges).toEqual([STORE]);
      expect(rules(r)).toContain("database-chain");
    });

    test("an unrelated edit to a file that connects to the database needs no chain", () => {
      expect(check(dbChange("", { head: { [STORE]: BASE[STORE] + "export const max = 5;\n" } }))).toMatchObject({ ok: true, databaseChanges: [] });
    });

    test("importing Prisma types, or a test that names DATABASE_URL, is not a database change", () => {
      const types = added("lib/search/criteria.ts", 'import type { Prisma } from "@prisma/client";\nexport type W = Prisma.ListingWhereInput;\n');
      const t = added("tests/runtime/env.test.ts", "test('x', () => expect(process.env.DATABASE_URL).toBeDefined());\n");
      expect(check(merge(types, t))).toMatchObject({ ok: true, databaseChanges: [] });
    });

    test("a new file that opens its own connection is a database change", () => {
      expect(check(added("lib/reports/pool.ts", 'import { Pool } from "pg";\nexport const pool = new Pool({ connectionString: process.env.REPORTS_DATABASE_URL });\n')).databaseChanges).toEqual(["lib/reports/pool.ts"]);
    });

    test("a complete, grounded chain that names the changed file passes", () => {
      expect(check(dbChange(body(FULL_CHAIN)))).toMatchObject({ ok: true, failures: [] });
    });

    test.each([
      ["a missing station", { ...FULL_CHAIN, tests: [] }],
      ["an UNVERIFIED station", { ...FULL_CHAIN, preview: ["UNVERIFIED - no preview proof yet"] }],
      ["free text", { ...FULL_CHAIN, db_target: ["checked"] }],
      ["a document instead of code", { ...FULL_CHAIN, db_target: ["docs/db.md"] }],
      ["a path that does not exist", { ...FULL_CHAIN, prisma_pg: ["lib/prisma-client.ts"] }],
      ["a real file of the wrong kind", { ...FULL_CHAIN, tests: [STORE] }],
      ["stations that never name the changed file", { ...FULL_CHAIN, env_resolution: ["prisma/schema.prisma"], db_target: ["prisma/schema.prisma"], downstream_readers_writers: ["tests/runtime/db.test.ts"] }],
    ])("%s fails the chain", (_name, chain) => {
      expect(rules(check(dbChange(body(chain))))).toContain("database-chain");
    });

    test("a station this pull request deletes fails the chain", () => {
      const r = check(dbChange(body(FULL_CHAIN), { changes: [{ status: "M", path: STORE }, { status: "D", path: "tests/runtime/db.test.ts" }] }));
      expect(r.failures.find((f) => f.rule === "database-chain" && f.items.some((i) => i.includes("tests/runtime/db.test.ts")))).toBeDefined();
    });

    test("a station this pull request guts fails the chain", () => {
      const r = check(dbChange(body(FULL_CHAIN), {
        changes: [{ status: "M", path: STORE }, { status: "M", path: "scripts/release-safety/deploy-proof.js" }],
        head: { [STORE]: switched, "scripts/release-safety/deploy-proof.js": "export {};\n" },
        labels: [label(LABEL.operator)],
      }));
      expect(r.failures.find((f) => f.rule === "database-chain" && f.items.some((i) => i.startsWith("preview:")))).toBeDefined();
    });

    test("a valid station this pull request adds or replaces counts", () => {
      const replacement = "tests/runtime/db-pool.test.ts";
      const r = check(dbChange(body({ ...FULL_CHAIN, tests: [replacement] }), {
        changes: [{ status: "M", path: STORE }, { status: "A", path: replacement }],
        head: { [STORE]: switched, [replacement]: BASE["tests/runtime/db.test.ts"] },
      }));
      expect(r).toMatchObject({ ok: true, failures: [] });
    });

    test("deleting a file that connects to the database is a database change", () => {
      const r = check({ changes: [{ status: "D", path: STORE }], base: BASE });
      expect(r.databaseChanges).toEqual([STORE]);
      expect(rules(r)).toContain("database-chain");
    });
  });
});
