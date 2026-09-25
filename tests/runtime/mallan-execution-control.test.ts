import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const GATE = path.resolve(__dirname, "../../scripts/ci/mallan-execution-control.mjs");
const STATE = "docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md";
const MASTER = "MALLAN-PLATFORM-MASTER-PLAN.md";

// Every environment input the gate reads, and the one file it writes. A fixture's gate inputs
// must be exactly what the test passes, in BOTH directions:
//   in   pr-check exports MALLAN_AUTHORITY_ROOT_REQUIRED for every later step, so once
//        authority-root became required each fixture silently inherited true;
//   out  the probe appends to GITHUB_ENV, so a fixture probe run inside the Jest step wrote
//        its invented answer into the real job for every step after Jest.
// Named individually on purpose: MALLAN_* also carries business configuration such as
// MALLAN_OFFICE_MLS_IDS, which is not the gate's and must not be stripped by prefix.
const GATE_ENVIRONMENT = [
  "MALLAN_AUTHORITY_ROOT_REQUIRED",
  "MALLAN_BASE_BRANCH",
  "MALLAN_BASE_REF",
  "MALLAN_CONTROL_PHASE",
  "MALLAN_EXECUTION_PROOFS",
  "MALLAN_HEAD_BRANCH",
  "MALLAN_PR_NUMBER",
  "MALLAN_PROVIDER_PROOFS",
  "MALLAN_RULESET_FIXTURE_JSON",
  "CREATED_BRANCH",
  "GITHUB_BASE_REF",
  "GITHUB_ENV",
  "GITHUB_HEAD_REF",
  "GITHUB_PR_NUMBER",
  "GITHUB_REPOSITORY",
];

function run(cmd: string, args: string[], cwd: string, env: Record<string, string> = {}) {
  const inherited: NodeJS.ProcessEnv = { ...process.env };
  for (const key of GATE_ENVIRONMENT) delete inherited[key];
  return spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    env: { ...inherited, ...env },
  });
}

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function write(cwd: string, rel: string, content: string) {
  const full = path.join(cwd, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function controlMarkdown(control: Record<string, unknown>) {
  return [
    "# MALLAN CONTINUOUS EXECUTION STATE",
    "",
    "<!-- MALLAN_EXECUTION_CONTROL_V1_START -->",
    "```json",
    JSON.stringify(control, null, 2),
    "```",
    "<!-- MALLAN_EXECUTION_CONTROL_V1_END -->",
    "",
  ].join("\n");
}

function baseControl(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    mode: "implementation",
    packet_id: "TEST-PACKET",
    objective: "Exercise the Mallan execution-control gate.",
    authorized_branch: "work/active",
    base_branch: "main",
    authorized_paths: ["lib/allowed.ts", "lib/feature/"],
    allowed_new_files: ["lib/allowed.ts"],
    impact_domains: ["test"],
    provider_proof_required: [],
    impact_graph: {
      root_owner_paths: ["MALLAN-PLATFORM-MASTER-PLAN.md"],
      writer_paths: ["lib/allowed.ts"],
      reader_paths: ["lib/feature/reader.ts"],
      publisher_paths: ["lib/feature/publisher.ts"],
      downstream_surfaces: ["test downstream"],
      test_paths: ["tests/runtime/mallan-execution-control.test.ts"],
      compliance_surfaces: ["none for fixture"]
    },
    production_mutation_authorized: false,
    schema_migration_authorized: false,
    environment_mutation_authorized: false,
    neon_mutation_authorized: false,
    destructive_data_authorized: false,
    manual_cron_authorized: false,
    new_canonical_system_authorized: false,
    requirements: {
      impact_graph_required: true,
      all_readers_writers_required: true,
      negative_tests_required: false,
      integration_proof_required: false,
      downstream_proof_required: false,
      compliance_proof_required_when_applicable: false,
      no_parallel_path_proof_required: true,
    },
    ...overrides,
  };
}

function initRepo(control = baseControl()) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "mallan-control-"));
  git(cwd, "init", "-b", "main");
  git(cwd, "config", "user.email", "test@example.com");
  git(cwd, "config", "user.name", "Mallan Test");
  write(cwd, MASTER, "# MASTER\n");
  write(cwd, STATE, controlMarkdown(control));
  write(cwd, "lib/feature/reader.ts", "export const reader = true;\n");
  // A real downstream writer, so the downstream station has something true to point at.
  write(
    cwd,
    "lib/feature/publisher.ts",
    [
      "import { PrismaClient } from " + JSON.stringify("@prisma/client") + ";",
      "export const publisher = new PrismaClient();",
      "",
    ].join(String.fromCharCode(10))
  );
  write(
    cwd,
    "prisma/schema.prisma",
    [
      "generator client { provider = " + JSON.stringify("prisma-client-js") + " }",
      "datasource db { provider = " + JSON.stringify("postgresql") + " url = env(" + JSON.stringify("DATABASE_URL") + ") }",
      "",
    ].join(String.fromCharCode(10))
  );
  write(
    cwd,
    "vercel.json",
    JSON.stringify({ $schema: "https://openapi.vercel.sh/vercel.json", crons: [] }) +
      String.fromCharCode(10)
  );
  write(
    cwd,
    "tests/runtime/mallan-execution-control.test.ts",
    "fixture covering the database impact chain" + String.fromCharCode(10)
  );
  write(cwd, ".github/workflows/pr-check.yml", "name: fixture\n");
  write(cwd, ".github/workflows/geocode.yml", "name: geocode" + String.fromCharCode(10));
  // The deploy workflow genuinely spans env resolution, preview and production, which is
  // why one file may legitimately stand for several stations here and package.json may not.
  write(
    cwd,
    ".github/workflows/db-deploy.yml",
    [
      "name: db-deploy",
      "on: { push: { branches: [main] } }",
      "jobs:",
      "  deploy:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      // The preview and production evidence must be REAL YAML, not a comment. Station
      // content is judged with comments stripped, so a workflow that only mentions the
      // environments in a remark evidences nothing — which is the whole point of the rule.
      "      - name: deploy preview",
      "        run: npx vercel deploy --prebuilt",
      "      - name: deploy production",
      "        run: npx vercel deploy --prebuilt --prod",
      "      - run: npx prisma migrate deploy",
      "        env: { DATABASE_URL: ${{ secrets.DATABASE_URL }} }",
      "",
    ].join(String.fromCharCode(10))
  );
  write(cwd, "lib/ops/db-target.ts", "export const target = process.env.DATABASE_URL;" + String.fromCharCode(10));
  write(cwd, "package.json", JSON.stringify({ name: "fixture" }) + String.fromCharCode(10));
  write(
    cwd,
    "prisma/migrations/0001_init/migration.sql",
    "CREATE TABLE listings (id TEXT PRIMARY KEY);" + String.fromCharCode(10)
  );
  git(
    cwd,
    "add",
    MASTER,
    STATE,
    "lib/feature/reader.ts",
    "lib/feature/publisher.ts",
    "prisma/schema.prisma",
    "tests/runtime/mallan-execution-control.test.ts",
    ".github/workflows/pr-check.yml",
    "vercel.json",
    ".github/workflows/geocode.yml",
    ".github/workflows/db-deploy.yml",
    "lib/ops/db-target.ts",
    "package.json",
    "prisma/migrations/0001_init/migration.sql"
  );
  git(cwd, "commit", "-m", "base authority");
  git(cwd, "branch", "origin-main");
  git(cwd, "checkout", "-b", "work/active");
  return cwd;
}

function gate(cwd: string, overrides: Record<string, string> = {}) {
  return run("node", [GATE], cwd, {
    MALLAN_BASE_REF: "origin-main",
    MALLAN_BASE_BRANCH: "main",
    MALLAN_HEAD_BRANCH: "work/active",
    MALLAN_PR_NUMBER: "999",
    ...overrides,
  });
}

describe("Mallan execution-control gate", () => {
  test("passes an implementation inside the base-state envelope", () => {
    const cwd = initRepo();
    write(cwd, "lib/allowed.ts", "export const ok = true;\n");
    git(cwd, "add", "lib/allowed.ts");
    git(cwd, "commit", "-m", "allowed implementation");

    const result = gate(cwd);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS");
  });

  test("rejects the wrong branch even when files are otherwise allowed", () => {
    const cwd = initRepo();
    write(cwd, "lib/allowed.ts", "export const ok = true;\n");
    git(cwd, "add", "lib/allowed.ts");
    git(cwd, "commit", "-m", "allowed file wrong branch");

    const result = gate(cwd, { MALLAN_HEAD_BRANCH: "fix/wild-west" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("only authorized branch work/active");
  });

  test("rejects a changed path outside the base-state envelope", () => {
    const cwd = initRepo();
    write(cwd, "app/rogue.ts", "export const rogue = true;\n");
    git(cwd, "add", "app/rogue.ts");
    git(cwd, "commit", "-m", "rogue path");

    const result = gate(cwd);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("outside the base-state authorization envelope");
    expect(result.stderr).toContain("app/rogue.ts");
  });

  test("rejects an unapproved new file even inside an allowed directory", () => {
    const cwd = initRepo();
    write(cwd, "lib/feature/new-helper.ts", "export const helper = true;\n");
    git(cwd, "add", "lib/feature/new-helper.ts");
    git(cwd, "commit", "-m", "unapproved helper");

    const result = gate(cwd);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("New files were created without explicit base-state authorization");
  });

  test("branch-local self-authorization cannot widen base-state scope", () => {
    const cwd = initRepo();

    write(
      cwd,
      STATE,
      controlMarkdown(
        baseControl({
          authorized_paths: ["app/", "lib/"],
          allowed_new_files: ["app/rogue.ts"],
          new_canonical_system_authorized: true,
        })
      )
    );
    write(cwd, "app/rogue.ts", "export const rogue = true;\n");
    git(cwd, "add", STATE, "app/rogue.ts");
    git(cwd, "commit", "-m", "attempt self authorization");

    const result = gate(cwd);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("may not modify authority file");
    expect(result.stderr).toContain(STATE);
  });

  test("control-update mode permits only the canonical execution-state file", () => {
    const cwd = initRepo(
      baseControl({
        mode: "control-update",
        authorized_paths: [STATE],
        allowed_new_files: [],
        impact_domains: ["governance"],
      })
    );

    write(cwd, STATE, controlMarkdown(baseControl({ mode: "implementation" })));
    git(cwd, "add", STATE);
    git(cwd, "commit", "-m", "authorized control update");

    const result = gate(cwd);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Control-update PR");
  });

  test("control-update mode rejects implementation smuggled into same PR", () => {
    const cwd = initRepo(
      baseControl({
        mode: "control-update",
        authorized_paths: [STATE],
        allowed_new_files: [],
        impact_domains: ["governance"],
      })
    );

    write(cwd, STATE, controlMarkdown(baseControl({ mode: "implementation" })));
    write(cwd, "lib/allowed.ts", "export const smuggled = true;\n");
    git(cwd, "add", STATE, "lib/allowed.ts");
    git(cwd, "commit", "-m", "smuggled implementation");

    const result = gate(cwd);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Only " + STATE + " may change");
  });

  // The half that matters AFTER this PR merges. The existing test proves no other PR can
  // bootstrap; this one proves that PR 632's own number stops granting anything the
  // moment base carries the authority files. Without it, the bootstrap exception's
  // self-closing property is a claim in a comment rather than a tested fact, and it is the
  // single widest exception in this gate.
  test("PR 632 gets no exception once base carries the authority files", () => {
    const cwd = initRepo(baseControl());
    write(cwd, "lib/outside/scope.ts", "export const x = 1;" + String.fromCharCode(10));
    git(cwd, "add", "lib/outside/scope.ts");
    git(cwd, "commit", "-m", "a path outside the packet scope");
    const res = gate(cwd, { MALLAN_PR_NUMBER: "632" });
    expect(res.status).not.toBe(0);
    // Refused as an ordinary out-of-scope packet, NOT waved through as a bootstrap.
    expect(res.stdout).not.toContain("Bootstrap PR #632");
    expect(res.stderr).not.toContain("Bootstrap PR #632");
  });

  // And the chain still applies to it, which is the other thing the bootstrap branch
  // suspends. A database change claiming PR 632 must declare every station like any other.
  test("PR 632 is chain-gated once base carries the authority files", () => {
    const control = baseControl({
      authorized_paths: ["prisma/schema.prisma"],
      impact_domains: ["schema"],
      schema_migration_authorized: true,
    });
    const cwd = initRepo(control);
    touchSchema(cwd, "db change claiming the bootstrap PR number");
    const res = gate(cwd, { MALLAN_PR_NUMBER: "632" });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("database_impact_chain");
    expect(res.stdout).not.toContain("Bootstrap PR #632");
  });
  test("only PR 632 can bootstrap when base lacks the authority files", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "mallan-bootstrap-"));
    git(cwd, "init", "-b", "main");
    git(cwd, "config", "user.email", "test@example.com");
    git(cwd, "config", "user.name", "Mallan Test");
    write(cwd, "README.md", "base\n");
    git(cwd, "add", "README.md");
    git(cwd, "commit", "-m", "base");
    git(cwd, "branch", "origin-main");
    git(cwd, "checkout", "-b", "fix/agent-authority-live-sources-2026-09-18");

    write(cwd, MASTER, "# MASTER\n");
    write(
      cwd,
      STATE,
      controlMarkdown(
        baseControl({
          mode: "control-update",
          authorized_branch: "work/active",
          authorized_paths: [STATE],
          allowed_new_files: [],
          impact_domains: ["governance"],
        })
      )
    );
    git(cwd, "add", MASTER, STATE);
    git(cwd, "commit", "-m", "bootstrap authority");

    const denied = gate(cwd, {
      MALLAN_HEAD_BRANCH: "fix/agent-authority-live-sources-2026-09-18",
      MALLAN_PR_NUMBER: "999",
    });
    expect(denied.status).toBe(1);
    expect(denied.stderr).toContain("Only bootstrap PR #632");

    const allowed = gate(cwd, {
      MALLAN_HEAD_BRANCH: "fix/agent-authority-live-sources-2026-09-18",
      MALLAN_PR_NUMBER: "632",
    });
    expect(allowed.status).toBe(0);
    expect(allowed.stdout).toContain("Bootstrap PR #632");
  });
  test("branch authority allows only main and the base-state authorized work branch", () => {
    const cwd = initRepo();

    const allowed = run("node", [GATE, "--branch-created", "work/active"], cwd);
    expect(allowed.status).toBe(0);
    expect(allowed.stdout).toContain("Created branch is authorized");

    const denied = run("node", [GATE, "--branch-created", "fix/another-detour"], cwd);
    expect(denied.status).toBe(1);
    expect(denied.stderr).toContain("Unauthorized branch creation");
    expect(denied.stderr).toContain("work/active");
  });

  test("rejects implementation when the whole impact graph is incomplete", () => {
    const cwd = initRepo(
      baseControl({
        impact_graph: {
          root_owner_paths: ["MALLAN-PLATFORM-MASTER-PLAN.md"],
          writer_paths: ["lib/allowed.ts"],
          reader_paths: [],
          publisher_paths: ["lib/feature/publisher.ts"],
          downstream_surfaces: ["test downstream"],
          test_paths: ["tests/runtime/mallan-execution-control.test.ts"],
          compliance_surfaces: ["none for fixture"],
        },
      })
    );

    write(cwd, "lib/allowed.ts", "export const ok = true;\n");
    git(cwd, "add", "lib/allowed.ts");
    git(cwd, "commit", "-m", "incomplete impact graph");

    const result = gate(cwd);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("impact_graph.reader_paths");
  });

  test("rejects an impact graph that names nonexistent repo paths", () => {
    const cwd = initRepo(
      baseControl({
        impact_graph: {
          root_owner_paths: ["MALLAN-PLATFORM-MASTER-PLAN.md"],
          writer_paths: ["lib/allowed.ts"],
          reader_paths: ["lib/does-not-exist.ts"],
          publisher_paths: ["lib/feature/publisher.ts"],
          downstream_surfaces: ["test downstream"],
          test_paths: ["tests/runtime/mallan-execution-control.test.ts"],
          compliance_surfaces: ["none for fixture"],
        },
      })
    );

    write(cwd, "lib/allowed.ts", "export const ok = true;\n");
    git(cwd, "add", "lib/allowed.ts");
    git(cwd, "commit", "-m", "fabricated impact graph");

    const result = gate(cwd);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Implementation proof is not grounded in the base authority");
    expect(result.stderr).toContain("lib/does-not-exist.ts");
  });

  test("rejects control-root modification even when branch scope tries to allow it", () => {
    const cwd = initRepo(
      baseControl({
        authorized_paths: [".github/workflows/pr-check.yml"],
        allowed_new_files: [],
        impact_graph: {
          root_owner_paths: ["MALLAN-PLATFORM-MASTER-PLAN.md"],
          writer_paths: [".github/workflows/pr-check.yml"],
          reader_paths: ["lib/feature/reader.ts"],
          publisher_paths: [".github/workflows/pr-check.yml"],
          downstream_surfaces: ["required GitHub check"],
          test_paths: ["tests/runtime/mallan-execution-control.test.ts"],
          compliance_surfaces: ["governance only"],
        },
      })
    );

    write(cwd, ".github/workflows/pr-check.yml", "name: weakened gate\n");
    git(cwd, "add", ".github/workflows/pr-check.yml");
    git(cwd, "commit", "-m", "attempt to modify control root");

    const result = gate(cwd);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("protected execution/proof root");
    expect(result.stderr).toContain(".github/workflows/pr-check.yml");
  });

  test("control-update rejects a malformed proposed execution contract", () => {
    const cwd = initRepo(
      baseControl({
        mode: "control-update",
        authorized_paths: [STATE],
        allowed_new_files: [],
        impact_domains: ["governance"],
      })
    );

    write(cwd, STATE, "# MALLAN CONTINUOUS EXECUTION STATE\n\nmalformed control\n");
    git(cwd, "add", STATE);
    git(cwd, "commit", "-m", "malformed control update");

    const result = gate(cwd);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Proposed execution contract is invalid");
    expect(result.stderr).toContain("execution-control markers");
  });

  test("rejects rename bypasses even when the destination would otherwise be in scope", () => {
    const cwd = initRepo(
      baseControl({
        authorized_paths: ["lib/feature/"],
        allowed_new_files: [],
      })
    );

    fs.renameSync(
      path.join(cwd, MASTER),
      path.join(cwd, "lib/feature/moved-master.md")
    );
    git(cwd, "add", "-A");
    git(cwd, "commit", "-m", "attempt protected-file rename bypass");

    const result = gate(cwd);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Renames/copies are not permitted");
    expect(result.stderr).toContain(MASTER);
    expect(result.stderr).toContain("lib/feature/moved-master.md");
  });

  test("rejects a control contract that omits requirements", () => {
    const broken: any = baseControl();
    delete broken.requirements;
    const cwd = initRepo(broken);
    write(cwd, "lib/allowed.ts", "export const ok = true;\n");
    git(cwd, "add", "lib/allowed.ts");
    git(cwd, "commit", "-m", "missing requirements");
    const result = gate(cwd);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("control.requirements must be an object");
  });

  test("required provider proof fails closed until supplied by base workflow", () => {
    const cwd = initRepo(baseControl({ provider_proof_required: ["vercel:preview"] }));
    write(cwd, "lib/allowed.ts", "export const ok = true;\n");
    git(cwd, "add", "lib/allowed.ts");
    git(cwd, "commit", "-m", "provider proof");
    expect(gate(cwd).stderr).toContain("required provider proof is absent");
    expect(gate(cwd, { MALLAN_PROVIDER_PROOFS: "vercel:preview" }).status).toBe(0);
  });

  test("schema-shaped changes require schema authorization", () => {
    const cwd = initRepo(baseControl({
      authorized_paths: ["prisma/schema.prisma"], allowed_new_files: [], impact_domains: ["schema"],
      impact_graph: {
        root_owner_paths:[MASTER], writer_paths:["prisma/schema.prisma"], reader_paths:["lib/feature/reader.ts"],
        publisher_paths:["lib/feature/publisher.ts"], downstream_surfaces:["schema consumers"],
        test_paths:["tests/runtime/mallan-execution-control.test.ts"], compliance_surfaces:["governance only"]
      }
    }));
    write(cwd, "prisma/schema.prisma", "generator client { provider = \"prisma-client-js\" }\nmodel X { id Int @id }\n");
    git(cwd, "add", "prisma/schema.prisma"); git(cwd, "commit", "-m", "schema without auth");
    expect(gate(cwd).stderr).toContain("schema_migration_authorized=true");
  });

  // Every station grounded in a path that exists on the base. No UNVERIFIED, no free text:
  // a station that cannot be proven must block the packet, so it cannot appear in a fixture
  // whose purpose is to pass.
  const FULL_DB_CHAIN = {
    vercel_integration: ["vercel.json"],
    env_resolution: ["lib/ops/db-target.ts"],
    db_target: ["lib/ops/db-target.ts"],
    prisma_pg: ["prisma/schema.prisma"],
    migrations: ["prisma/schema.prisma"],
    workflows_crons: [".github/workflows/db-deploy.yml"],
    preview: [".github/workflows/db-deploy.yml"],
    production: [".github/workflows/db-deploy.yml"],
    downstream_readers_writers: ["lib/feature/publisher.ts"],
    tests: ["tests/runtime/mallan-execution-control.test.ts"],
  };

  function dbControl(chain: unknown) {
    return baseControl({
      authorized_paths: ["prisma/schema.prisma"],
      allowed_new_files: [],
      impact_domains: ["schema"],
      schema_migration_authorized: true,
      impact_graph: {
        root_owner_paths: [MASTER],
        writer_paths: ["prisma/schema.prisma"],
        reader_paths: ["lib/feature/reader.ts"],
        publisher_paths: ["lib/feature/publisher.ts"],
        downstream_surfaces: ["schema consumers"],
        test_paths: ["tests/runtime/mallan-execution-control.test.ts"],
        compliance_surfaces: ["governance only"],
        ...(chain === undefined ? {} : { database_impact_chain: chain }),
      },
    });
  }

  function touchSchema(cwd: string, msg: string) {
    const schema = [
      "generator client { provider = " + JSON.stringify("prisma-client-js") + " }",
      "model X { id Int @id }",
      "",
    ].join(String.fromCharCode(10));
    write(cwd, "prisma/schema.prisma", schema);
    git(cwd, "add", "prisma/schema.prisma");
    git(cwd, "commit", "-m", msg);
  }

  // Capability, not filename. Each fixture uses a NEW name that the deleted-path set does
  // not contain, and each must still be refused for what the file does.
  const RENAMED_DIRECT_NEON = [
    ["scripts/neon-control.ts", "script"],
    [".github/workflows/neon-rotation-v2.yml", "workflow"],
    ["app/api/cron/branch-janitor/route.ts", "route"],
    ["lib/provider/branch-admin.ts", "library"],
  ] as const;

  test("an existing but unrelated file does not satisfy a station", () => {
    // package.json exists, is not free text and is not prose, so path existence alone
    // used to satisfy the entire chain.
    const chain = { ...FULL_DB_CHAIN };
    for (const station of Object.keys(chain)) {
      (chain as Record<string, string[]>)[station] = ["package.json"];
    }
    const cwd = initRepo(dbControl(chain));
    touchSchema(cwd, "db change, every station package.json");
    const res = gate(cwd);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("not evidence FOR THAT STATION");
  });

  test("removing a database reader is still a database change", () => {
    const rel = "lib/allowed.ts";
    const control = dbControl(undefined);
    control.authorized_paths = [rel];
    control.allowed_new_files = [];
    const cwd = initRepo(control);
    // Base HAS the reader; HEAD removes it. Reading only HEAD erased the signal.
    write(cwd, rel, "import { Pool } from " + JSON.stringify("pg") + ";" + String.fromCharCode(10) + "export const p = new Pool({ connectionString: process.env.DATABASE_URL });" + String.fromCharCode(10));
    git(cwd, "add", rel);
    git(cwd, "commit", "-m", "base has a reader");
    git(cwd, "branch", "-f", "origin-main", "HEAD");
    write(cwd, rel, "export const p = 1;" + String.fromCharCode(10));
    git(cwd, "add", rel);
    git(cwd, "commit", "-m", "remove the reader");
    const res = gate(cwd);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("database_impact_chain");
  });

  test("an aliased client constructor triggers the chain", () => {
    const rel = "lib/allowed.ts";
    const control = dbControl(undefined);
    control.authorized_paths = [rel];
    control.allowed_new_files = [rel];
    const cwd = initRepo(control);
    write(cwd, rel, [
      "import { Pool as PgPool } from " + JSON.stringify("pg") + ";",
      "export const p = new PgPool({ connectionString: " + JSON.stringify("postgresql://db.example/mallan") + " });",
    ].join(String.fromCharCode(10)));
    git(cwd, "add", rel);
    git(cwd, "commit", "-m", "aliased pool constructor");
    const res = gate(cwd);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("database_impact_chain");
  });

  // A workflow that exists but has nothing to do with a station is the same defect as
  // package.json standing for all ten: the path resolves, the evidence is still absent.
  test("a real file of the wrong kind does not satisfy a station", () => {
    const chain = { ...FULL_DB_CHAIN };
    (chain as Record<string, string[]>).production = [".github/workflows/geocode.yml"];
    const cwd = initRepo(dbControl(chain));
    touchSchema(cwd, "db change, production station points at a geocoder");
    const res = gate(cwd);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("production");
  });

  // A directory resolves through git cat-file, so path existence alone would accept it.
  test("a directory does not satisfy a station", () => {
    const chain = { ...FULL_DB_CHAIN };
    (chain as Record<string, string[]>).downstream_readers_writers = ["lib/feature/"];
    const cwd = initRepo(dbControl(chain));
    touchSchema(cwd, "db change, downstream station points at a directory");
    const res = gate(cwd);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("downstream_readers_writers");
  });

  // Same consumer, different spelling. A destructured require with a rename binds the pg
  // pool to a name the literal-name scan would never see.
  // The migration station is the one station whose rule is a path shape, because a
  // migration file carries no keyword worth demanding. That made it the last place a
  // directory could still stand in for evidence.
  test("a migrations directory does not satisfy the migrations station", () => {
    const chain = { ...FULL_DB_CHAIN };
    (chain as Record<string, string[]>).migrations = ["prisma/migrations/"];
    const cwd = initRepo(dbControl(chain));
    touchSchema(cwd, "db change, migrations station points at the folder");
    const res = gate(cwd);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("migrations");
  });

  // Positive control for the case above: the file inside that folder IS evidence, so the
  // refusal above is about the tree and not about the station being unsatisfiable.
  test("a migration file satisfies the migrations station", () => {
    const chain = { ...FULL_DB_CHAIN };
    (chain as Record<string, string[]>).migrations = ["prisma/migrations/0001_init/migration.sql"];
    const cwd = initRepo(dbControl(chain));
    touchSchema(cwd, "db change, migrations station names the migration file");
    expect(gate(cwd).status).toBe(0);
  });

  test("a destructured require alias triggers the chain", () => {
    const control = baseControl({
      authorized_paths: ["lib/feature/reader.ts"],
      impact_domains: ["reader"],
    });
    const cwd = initRepo(control);
    write(
      cwd,
      "lib/feature/reader.ts",
      [
        "const { Pool: PgPool } = require(" + JSON.stringify("pg") + ");",
        "export const reader = new PgPool({});",
        "",
      ].join(String.fromCharCode(10))
    );
    git(cwd, "add", "lib/feature/reader.ts");
    git(cwd, "commit", "-m", "reader opens a pool under a renamed binding");
    const res = gate(cwd);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("database_impact_chain");
  });

  // Naming runnable files one at a time is the same losing game as naming alias
  // spellings was. Configuration that DECLARES a command or a script launches something,
  // and that is what makes it a program.
  test("a capability reach in runnable JSON configuration is refused", () => {
    const rel = ".mcp.json";
    const cwd = initRepo(baseControl({
      authorized_paths: [rel],
      allowed_new_files: [rel, "lib/allowed.ts"],
    }));
    write(cwd, rel, JSON.stringify({
      mcpServers: { provider: { type: "stdio", command: "neonctl", args: ["branches", "list"] } },
    }) + String.fromCharCode(10));
    git(cwd, "add", rel);
    git(cwd, "commit", "-m", "mcp server launches the retired CLI");
    const err = gate(cwd).stderr;
    expect(err).toContain("Direct Neon control-plane capability is prohibited");
    expect(err).toContain(rel);
  });

  // The boundary that keeps the rule narrow: data JSON declares no command and no
  // script, and must not be scanned as a program. Otherwise every fixture and catalog in
  // the repository becomes a suspect.
  test("data JSON is not treated as runnable configuration", () => {
    const rel = "data/provider-notes.json";
    const cwd = initRepo(baseControl({
      authorized_paths: [rel],
      allowed_new_files: [rel, "lib/allowed.ts"],
    }));
    write(cwd, rel, JSON.stringify({
      notes: ["the retired CLI was called neonctl and must never return"],
    }) + String.fromCharCode(10));
    git(cwd, "add", rel);
    git(cwd, "commit", "-m", "a data file that names the retired CLI");
    expect(gate(cwd).stderr).not.toContain("Direct Neon control-plane capability is prohibited");
  });
  // A file is executable because of what it IS. package.json runs npm scripts and
  // .githooks/pre-commit runs on every commit; neither has a name the old list could
  // have matched, and an extensionless hook cannot be enumerated at all.
  test("a capability reach through an npm script is refused", () => {
    const cwd = initRepo(baseControl({ authorized_paths: ["package.json"] }));
    write(cwd, "package.json", JSON.stringify({
      name: "fixture",
      scripts: { "db:rotate": "neonctl branches list" },
    }) + String.fromCharCode(10));
    git(cwd, "add", "package.json");
    git(cwd, "commit", "-m", "npm script reaches the retired CLI");
    const err = gate(cwd).stderr;
    expect(err).toContain("Direct Neon control-plane capability is prohibited");
    expect(err).toContain("package.json");
  });

  test("a capability reach in an extensionless hook is refused", () => {
    const rel = ".githooks/pre-push";
    const cwd = initRepo(baseControl({
      authorized_paths: [rel],
      allowed_new_files: [rel, "lib/allowed.ts"],
    }));
    write(cwd, rel, [
      "#!/bin/sh",
      "curl -s " + JSON.stringify("https://console.neon.tech/api/v2/projects"),
      "",
    ].join(String.fromCharCode(10)));
    git(cwd, "add", rel);
    git(cwd, "commit", "-m", "git hook reaches the control plane");
    const err = gate(cwd).stderr;
    expect(err).toContain("Direct Neon control-plane capability is prohibited");
    expect(err).toContain(rel);
  });

  // A file with no extension and no shebang is data, and a scan that refuses data would
  // be refusing honest work. Only a shebang makes an unnamed file a program.
  test("an extensionless file without a shebang is not treated as a program", () => {
    const rel = "config/notes";
    const cwd = initRepo(baseControl({
      authorized_paths: [rel],
      allowed_new_files: [rel, "lib/allowed.ts"],
    }));
    write(cwd, rel, [
      "the retired CLI was called neonctl and must never return",
      "",
    ].join(String.fromCharCode(10)));
    git(cwd, "add", rel);
    git(cwd, "commit", "-m", "a note that names the retired CLI in prose");
    expect(gate(cwd).stderr).not.toContain("Direct Neon control-plane capability is prohibited");
  });
  // The scan never opened these formats, and this repository tracks five shell scripts, a
  // PowerShell script, a Python module and a Dockerfile. A guard that does not open the
  // file cannot refuse what is in it.
  const UNSCANNED_FORMATS = [
    ["scripts/ops/rotate.sh", "shell"],
    ["scripts/ops/rotate.ps1", "powershell"],
    ["backend/app/control.py", "python"],
    ["backend/Dockerfile", "docker"],
  ] as const;

  test("a direct-Neon reach is refused in every executable format, not just JavaScript", () => {
    for (const [rel, kind] of UNSCANNED_FORMATS) {
      const cwd = initRepo(baseControl({
        authorized_paths: [rel],
        allowed_new_files: [rel],
      }));
      write(cwd, rel, [
        "# " + kind + " reaching the Neon control plane",
        "curl -s " + JSON.stringify("https://console.neon.tech/api/v2/projects"),
        "",
      ].join(String.fromCharCode(10)));
      git(cwd, "add", rel);
      git(cwd, "commit", "-m", "direct-neon reach from " + kind);
      const err = gate(cwd).stderr;
      expect(err).toContain("Direct Neon control-plane capability is prohibited");
      expect(err).toContain(rel);
    }
  }, 120000);

  // os.environ["DATABASE_URL"] is the same participation in the database story as
  // process.env.DATABASE_URL. The JS-shaped literals could not see it.
  test("a Python reader of the connection variable triggers the chain", () => {
    const rel = "backend/app/reader.py";
    const cwd = initRepo(baseControl({
      authorized_paths: [rel],
      // lib/allowed.ts stays declared: it is the fixture control's default writer, and
      // dropping it would make the packet fail grounding before the chain is ever reached.
      allowed_new_files: [rel, "lib/allowed.ts"],
      impact_domains: ["reader"],
    }));
    write(cwd, rel, [
      "import os",
      "url = os.environ[" + JSON.stringify("DATABASE_URL") + "]",
      "",
    ].join(String.fromCharCode(10)));
    git(cwd, "add", rel);
    git(cwd, "commit", "-m", "python reader of the connection variable");
    const res = gate(cwd);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("database_impact_chain");
  });

  // Both readings blinded at once: the raw reading keeps the block comment, and a regex
  // comment strip mistook the marker's slashes for a comment and deleted the rest of the
  // line. Only a scanner that knows what a string is can tell those apart.
  test("a string containing slashes does not blind the comment-stripped reading", () => {
    const control = baseControl({
      authorized_paths: ["lib/feature/reader.ts"],
      impact_domains: ["reader"],
    });
    const cwd = initRepo(control);
    write(cwd, "lib/feature/reader.ts", [
      "const marker = " + JSON.stringify("x//") + ";",
      "const endpoint = " + JSON.stringify("https://console.") + " /* seam */ + " + JSON.stringify("neon.tech/api/v2/projects") + ";",
      "export const reader = { marker, endpoint };",
      "",
    ].join(String.fromCharCode(10)));
    git(cwd, "add", "lib/feature/reader.ts");
    git(cwd, "commit", "-m", "reader hides the host behind a slash-bearing string");
    expect(gate(cwd).stderr).toContain("Direct Neon control-plane capability is prohibited");
  });

  // A regex character class may hold unescaped slashes, so /[///]/ is ONE regex. Reading
  // the first of them as the terminator left the remaining two to be taken for a comment.
  test("a regex character class does not blind every reading", () => {
    const control = baseControl({
      authorized_paths: ["lib/feature/reader.ts"],
      impact_domains: ["reader"],
    });
    const cwd = initRepo(control);
    // Same three conditions as the other scanner cases: the construct, the seam and the
    // endpoint share ONE line, and the seam is a LINE comment so the block-only reading
    // cannot rescue it.
    write(cwd, "lib/feature/reader.ts", [
      "export const re = /[///]/; export const endpoint = " + JSON.stringify("https://console.") + " // seam",
      "  + " + JSON.stringify("neon.tech/api/v2/projects") + ";",
      "",
    ].join(String.fromCharCode(10)));
    git(cwd, "add", "lib/feature/reader.ts");
    git(cwd, "commit", "-m", "reader hides the host behind a regex character class");
    // Assert the REASON, not just a non-zero exit. A packet can be refused for a dozen
    // unrelated reasons, and a status-only assertion passes on every one of them, which
    // is how a scanner test ends up proving nothing about the scanner.
    expect(gate(cwd).stderr).toContain("Direct Neon control-plane capability is prohibited");
  });

  // Python does not require whitespace before a # comment, so `("a"# seam` is a comment
  // there. JavaScript opens a private field name with the same character. One character,
  // two languages, opposite answers, so the two hash readings take opposite views and a
  // signature has to be invisible in both.
  test("a hash comment with no leading space is still a comment in Python", () => {
    const rel = "backend/app/control.py";
    const cwd = initRepo(baseControl({
      authorized_paths: [rel],
      allowed_new_files: [rel, "lib/allowed.ts"],
    }));
    write(cwd, rel, [
      "URL = (" + JSON.stringify("https://console.") + String.fromCharCode(35) + " seam",
      "    " + JSON.stringify("neon.tech/api/v2/projects") + ")",
      "",
    ].join(String.fromCharCode(10)));
    git(cwd, "add", rel);
    git(cwd, "commit", "-m", "python builds the host across a tight hash comment");
    expect(gate(cwd).stderr).toContain("Direct Neon control-plane capability is prohibited");
  });

  // The boundary for both: an ordinary character class and an ordinary private field are
  // not capability signatures, and the aggressive hash reading must not make them one.
  test("ordinary character classes and private fields are not capability signatures", () => {
    const control = baseControl({
      authorized_paths: ["lib/feature/reader.ts"],
      impact_domains: ["reader"],
      impact_graph: {
        root_owner_paths: ["MALLAN-PLATFORM-MASTER-PLAN.md"],
        writer_paths: ["lib/feature/reader.ts"],
        reader_paths: ["lib/feature/reader.ts"],
        publisher_paths: ["lib/feature/publisher.ts"],
        downstream_surfaces: ["test downstream"],
        test_paths: ["tests/runtime/mallan-execution-control.test.ts"],
        compliance_surfaces: ["none for fixture"],
      },
    });
    const cwd = initRepo(control);
    const hash = String.fromCharCode(35);
    write(cwd, "lib/feature/reader.ts", [
      "export class Reader {",
      "  " + hash + "slug = /[a-z/]+/;",
      "  match(v: string) { return this." + hash + "slug.test(v); }",
      "}",
      "",
    ].join(String.fromCharCode(10)));
    git(cwd, "add", "lib/feature/reader.ts");
    git(cwd, "commit", "-m", "reader uses a character class in a private field");
    expect(gate(cwd).stderr).not.toContain("Direct Neon control-plane capability is prohibited");
  });
  // The ) that closes an `if (...)` condition legitimately precedes a regex literal, and
  // ) also commonly precedes division, so a slash there is genuinely ambiguous. The
  // ambiguity is resolved on the side that COPIES text rather than the side that DELETES
  // it: reading division as a regex preserves everything, while reading a regex as a
  // comment erases to end of line and blinded all four readings at once.
  test("a regex after a closing paren does not blind every reading", () => {
    const control = baseControl({
      authorized_paths: ["lib/feature/reader.ts"],
      impact_domains: ["reader"],
    });
    const cwd = initRepo(control);
    const slash = String.fromCharCode(92);
    // Same three conditions as the keyword case: ambiguous slash, same line, LINE seam.
    write(cwd, "lib/feature/reader.ts", [
      "export const endpoint = (() => { if (globalThis) /a" + slash + "/" + slash + "//.test(" + JSON.stringify("x") + "); return " + JSON.stringify("https://console.") + " // seam",
      "    + " + JSON.stringify("neon.tech/api/v2/projects") + "; })();",
      "",
    ].join(String.fromCharCode(10)));
    git(cwd, "add", "lib/feature/reader.ts");
    git(cwd, "commit", "-m", "reader hides the host behind an ambiguous slash");
    expect(gate(cwd).stderr).toContain("Direct Neon control-plane capability is prohibited");
  });

  // The cost of resolving that ambiguity toward regex is that ordinary division after a
  // closing paren or bracket must still not be mistaken for a capability signature.
  test("ordinary division after a paren or bracket is not a capability signature", () => {
    const control = baseControl({
      authorized_paths: ["lib/feature/reader.ts"],
      impact_domains: ["reader"],
      impact_graph: {
        root_owner_paths: ["MALLAN-PLATFORM-MASTER-PLAN.md"],
        writer_paths: ["lib/feature/reader.ts"],
        reader_paths: ["lib/feature/reader.ts"],
        publisher_paths: ["lib/feature/publisher.ts"],
        downstream_surfaces: ["test downstream"],
        test_paths: ["tests/runtime/mallan-execution-control.test.ts"],
        compliance_surfaces: ["none for fixture"],
      },
    });
    const cwd = initRepo(control);
    write(cwd, "lib/feature/reader.ts", [
      "export const mean = (xs: number[]) => (xs[0] + xs[1]) / xs.length; // ratio",
      "",
    ].join(String.fromCharCode(10)));
    git(cwd, "add", "lib/feature/reader.ts");
    git(cwd, "commit", "-m", "reader divides after a paren and a bracket");
    expect(gate(cwd).stderr).not.toContain("Direct Neon control-plane capability is prohibited");
  });
  // A keyword may precede a regex literal, and the last character of `return` is an
  // ordinary identifier character, so a one-character test called it division. The
  // regex's own slashes were then read as a comment and ate the rest of the line.
  test("a regex literal after a keyword does not blind the stripped reading", () => {
    const control = baseControl({
      authorized_paths: ["lib/feature/reader.ts"],
      impact_domains: ["reader"],
    });
    const cwd = initRepo(control);
    const slash = String.fromCharCode(92);
    // Keyword, regex and seam on ONE line: that is what makes the mis-read swallow the
    // endpoint. Split across lines the bypass does not exist.
    // Three things have to line up for this to exercise the keyword fix at all.
    //   the regex must follow a KEYWORD, or the slash was already recognised after `=`
    //   the regex and the seam must share a LINE, or the mis-read eats only its own line
    //   the seam must be a LINE comment, because the block-only reading removes a block
    //     seam regardless of how the regex was read, and the test would pass either way
    write(cwd, "lib/feature/reader.ts", [
      "export function f() { return /x" + slash + "/" + slash + "//; } export const endpoint = " + JSON.stringify("https://console.") + " // seam",
      "  + " + JSON.stringify("neon.tech/api/v2/projects") + ";",
      "",
    ].join(String.fromCharCode(10)));
    git(cwd, "add", "lib/feature/reader.ts");
    git(cwd, "commit", "-m", "reader hides the host behind a keyword-led regex");
    expect(gate(cwd).stderr).toContain("Direct Neon control-plane capability is prohibited");
  });

  // Boundary: division after an identifier is still division, and a regex after a
  // keyword is still a regex. Neither is a capability signature on its own.
  test("ordinary division and keyword-led regexes are not capability signatures", () => {
    const control = baseControl({
      authorized_paths: ["lib/feature/reader.ts"],
      impact_domains: ["reader"],
      impact_graph: {
        root_owner_paths: ["MALLAN-PLATFORM-MASTER-PLAN.md"],
        writer_paths: ["lib/feature/reader.ts"],
        reader_paths: ["lib/feature/reader.ts"],
        publisher_paths: ["lib/feature/publisher.ts"],
        downstream_surfaces: ["test downstream"],
        test_paths: ["tests/runtime/mallan-execution-control.test.ts"],
        compliance_surfaces: ["none for fixture"],
      },
    });
    const cwd = initRepo(control);
    const slash = String.fromCharCode(92);
    write(cwd, "lib/feature/reader.ts", [
      "export const ratio = (a: number, b: number) => a / b;",
      "export function pick(x: string) { return /^a" + slash + "/b$/.test(x); }",
      "",
    ].join(String.fromCharCode(10)));
    git(cwd, "add", "lib/feature/reader.ts");
    git(cwd, "commit", "-m", "reader divides and matches normally");
    expect(gate(cwd).stderr).not.toContain("Direct Neon control-plane capability is prohibited");
  });

  // A JSON key may be escaped, and "\\u0063ommand" IS the command key by the time
  // anything runs it. A spelling test can be written around; a parse cannot.
  test("an escaped key still marks JSON configuration runnable", () => {
    const rel = ".mcp.json";
    const cwd = initRepo(baseControl({
      authorized_paths: [rel],
      allowed_new_files: [rel, "lib/allowed.ts"],
    }));
    // The key must reach the FILE as a single-backslash JSON escape. JSON.stringify
    // would double the backslash and produce a literal key that parses as something
    // else entirely, which is the bug this test would then fail to exercise.
    const escapedKey = String.fromCharCode(34) + String.fromCharCode(92) + "u0063ommand" + String.fromCharCode(34);
    write(cwd, rel, [
      "{",
      "  " + JSON.stringify("servers") + ": {",
      "    " + JSON.stringify("provider") + ": { " + escapedKey + ": " + JSON.stringify("neonctl") + " }",
      "  }",
      "}",
      "",
    ].join(String.fromCharCode(10)));
    git(cwd, "add", rel);
    git(cwd, "commit", "-m", "mcp config spells the command key with an escape");
    expect(gate(cwd).stderr).toContain("Direct Neon control-plane capability is prohibited");
  });
  // In JavaScript # opens a private field name, not a comment. Reading it as a shell
  // comment deleted the rest of the line, and a line-comment seam on that same line was
  // then invisible to every reading that strips comments. Fourth distinct blind spot,
  // fourth distinct LANGUAGE question, which is why the comment families are now
  // separated rather than guessed at.
  test("a private field name does not blind the comment-stripped reading", () => {
    const control = baseControl({
      authorized_paths: ["lib/feature/reader.ts"],
      impact_domains: ["reader"],
    });
    const cwd = initRepo(control);
    const hash = String.fromCharCode(35);
    // The private field and the seam must share a LINE. That is what makes the hash
    // strip swallow the endpoint; on separate lines it swallows only its own line and
    // the bypass does not exist.
    write(cwd, "lib/feature/reader.ts", [
      "export class Reader {",
      "  " + hash + "count = 0; static endpoint = " + JSON.stringify("https://console.") + " // seam",
      "    + " + JSON.stringify("neon.tech/api/v2/projects") + ";",
      "}",
      "",
    ].join(String.fromCharCode(10)));
    git(cwd, "add", "lib/feature/reader.ts");
    git(cwd, "commit", "-m", "reader hides the host behind a private field name");
    expect(gate(cwd).stderr).toContain("Direct Neon control-plane capability is prohibited");
  });

  // The hash family still has to work where it IS a comment. Python concatenates adjacent
  // string literals inside parentheses, and a # comment may sit between them.
  test("a hash-comment seam in Python is still refused", () => {
    const rel = "backend/app/control.py";
    const cwd = initRepo(baseControl({
      authorized_paths: [rel],
      allowed_new_files: [rel, "lib/allowed.ts"],
    }));
    write(cwd, rel, [
      "URL = (",
      "    " + JSON.stringify("https://console.") + "  " + String.fromCharCode(35) + " seam",
      "    " + JSON.stringify("neon.tech/api/v2/projects"),
      ")",
      "",
    ].join(String.fromCharCode(10)));
    git(cwd, "add", rel);
    git(cwd, "commit", "-m", "python builds the host across a hash comment");
    expect(gate(cwd).stderr).toContain("Direct Neon control-plane capability is prohibited");
  });

  // Boundary for both: an ordinary private field and an ordinary shell comment are not
  // capability signatures.
  test("ordinary private fields and hash comments are not capability signatures", () => {
    const control = baseControl({
      authorized_paths: ["lib/feature/reader.ts"],
      impact_domains: ["reader"],
      impact_graph: {
        root_owner_paths: ["MALLAN-PLATFORM-MASTER-PLAN.md"],
        writer_paths: ["lib/feature/reader.ts"],
        reader_paths: ["lib/feature/reader.ts"],
        publisher_paths: ["lib/feature/publisher.ts"],
        downstream_surfaces: ["test downstream"],
        test_paths: ["tests/runtime/mallan-execution-control.test.ts"],
        compliance_surfaces: ["none for fixture"],
      },
    });
    const cwd = initRepo(control);
    const hash = String.fromCharCode(35);
    write(cwd, "lib/feature/reader.ts", [
      "export class Reader {",
      "  " + hash + "count = 0;",
      "  bump() { this." + hash + "count += 1; }",
      "}",
      "",
    ].join(String.fromCharCode(10)));
    git(cwd, "add", "lib/feature/reader.ts");
    git(cwd, "commit", "-m", "reader uses an ordinary private field");
    expect(gate(cwd).stderr).not.toContain("Direct Neon control-plane capability is prohibited");
  });
  // A template EXPRESSION is code, not string text. Treating the whole backtick literal
  // as opaque meant a line comment inside ${ } never reached the comment scanner, and a
  // line comment cannot be removed by the block-only reading either, so all three
  // readings went blind on a literal that really does evaluate to the prohibited host.
  test("a comment inside a template expression is still removed", () => {
    const control = baseControl({
      authorized_paths: ["lib/feature/reader.ts"],
      impact_domains: ["reader"],
    });
    const cwd = initRepo(control);
    const tick = String.fromCharCode(96);
    const dollar = String.fromCharCode(36);
    write(cwd, "lib/feature/reader.ts", [
      "export const endpoint = " + tick + "https://console." + dollar + "{",
      "  " + JSON.stringify("") + " // seam",
      "}neon.tech/api/v2/projects" + tick + ";",
      "",
    ].join(String.fromCharCode(10)));
    git(cwd, "add", "lib/feature/reader.ts");
    git(cwd, "commit", "-m", "reader assembles the host across a template expression");
    expect(gate(cwd).stderr).toContain("Direct Neon control-plane capability is prohibited");
  });

  // The boundary for template parsing: an ordinary template that interpolates the
  // connection variable is normal application code and must not be refused.
  test("an ordinary template interpolation is not a capability signature", () => {
    const control = baseControl({
      authorized_paths: ["lib/feature/reader.ts"],
      impact_domains: ["reader"],
      impact_graph: {
        root_owner_paths: ["MALLAN-PLATFORM-MASTER-PLAN.md"],
        writer_paths: ["lib/feature/reader.ts"],
        reader_paths: ["lib/feature/reader.ts"],
        publisher_paths: ["lib/feature/publisher.ts"],
        downstream_surfaces: ["test downstream"],
        test_paths: ["tests/runtime/mallan-execution-control.test.ts"],
        compliance_surfaces: ["none for fixture"],
      },
    });
    const cwd = initRepo(control);
    const tick = String.fromCharCode(96);
    const dollar = String.fromCharCode(36);
    write(cwd, "lib/feature/reader.ts", [
      "export const label = " + tick + "target=" + dollar + "{process.env.DATABASE_URL}" + tick + "; // ordinary",
      "",
    ].join(String.fromCharCode(10)));
    git(cwd, "add", "lib/feature/reader.ts");
    git(cwd, "commit", "-m", "reader interpolates the connection variable normally");
    expect(gate(cwd).stderr).not.toContain("Direct Neon control-plane capability is prohibited");
  });
  // Second time one line blinded a reading: a regex literal may contain a slash pair, and
  // treating it as a comment ate the rest of the line. The scanner now only reads a slash
  // as a regex where a value may begin, and a third reading removes block comments alone,
  // so no line-comment judgement of any kind can hide a block-seamed signature.
  test("a regex literal does not blind the comment-stripped reading", () => {
    const control = baseControl({
      authorized_paths: ["lib/feature/reader.ts"],
      impact_domains: ["reader"],
    });
    const cwd = initRepo(control);
    const slash = String.fromCharCode(92);
    write(cwd, "lib/feature/reader.ts", [
      "const re = /" + slash + "/" + slash + "//;",
      "const endpoint = " + JSON.stringify("https://console.") + " /* seam */ + " + JSON.stringify("neon.tech/api/v2/projects") + ";",
      "export const reader = { re, endpoint };",
      "",
    ].join(String.fromCharCode(10)));
    git(cwd, "add", "lib/feature/reader.ts");
    git(cwd, "commit", "-m", "reader hides the host behind a regex literal");
    expect(gate(cwd).stderr).toContain("Direct Neon control-plane capability is prohibited");
  });

  // The boundary: ordinary division and an ordinary regex must not be mistaken for a
  // capability signature, or the scan starts refusing honest code.
  test("ordinary division and regex literals are not capability signatures", () => {
    const control = baseControl({
      authorized_paths: ["lib/feature/reader.ts"],
      impact_domains: ["reader"],
      impact_graph: {
        root_owner_paths: ["MALLAN-PLATFORM-MASTER-PLAN.md"],
        writer_paths: ["lib/feature/reader.ts"],
        reader_paths: ["lib/feature/reader.ts"],
        publisher_paths: ["lib/feature/publisher.ts"],
        downstream_surfaces: ["test downstream"],
        test_paths: ["tests/runtime/mallan-execution-control.test.ts"],
        compliance_surfaces: ["none for fixture"],
      },
    });
    const cwd = initRepo(control);
    const slash = String.fromCharCode(92);
    write(cwd, "lib/feature/reader.ts", [
      "export const ratio = (a: number, b: number) => a / b;",
      "export const re = /^a" + slash + "/b$/;",
      "",
    ].join(String.fromCharCode(10)));
    git(cwd, "add", "lib/feature/reader.ts");
    git(cwd, "commit", "-m", "reader does ordinary arithmetic and matching");
    const res = gate(cwd);
    expect(res.stderr).not.toContain("Direct Neon control-plane capability is prohibited");
  });
  // Being ALLOWED to add a file is not the same as having added it.
  test("a station citing a declared-but-absent new file is refused", () => {
    const missing = "prisma/migrations/0002_never_written/migration.sql";
    const chain = { ...FULL_DB_CHAIN };
    (chain as Record<string, string[]>).migrations = [missing];
    const control = dbControl(chain);
    control.allowed_new_files = [missing];
    const cwd = initRepo(control);
    touchSchema(cwd, "db change citing a migration the packet never wrote");
    const res = gate(cwd);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain(missing);
  });
  // THE DISPLAY GATE. lib/compliance/public-listing-filter.ts holds the shared Prisma
  // where-fragment that enforces the REBNY display rules at the database layer. Changing
  // one predicate there changes what EVERY public query returns. The classifier could not
  // see it, because the file names no driver, no connection variable and no lib/prisma
  // specifier — and that is the exact surface of the 2026-04-30 incident that put 7,594
  // rows into an unlawful display state.
  test("a change to a database-layer display gate triggers the chain", () => {
    const control = baseControl({
      authorized_paths: ["lib/feature/reader.ts"],
      impact_domains: ["reader"],
    });
    const cwd = initRepo(control);
    write(cwd, "lib/feature/reader.ts", [
      "export const PUBLIC_LISTING_GATE = {",
      "  idx_display_yn: true,",
      "  owner_opt_out: false,",
      "};",
      "",
    ].join(String.fromCharCode(10)));
    git(cwd, "add", "lib/feature/reader.ts");
    git(cwd, "commit", "-m", "reader defines a display gate where-fragment");
    const res = gate(cwd);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("database_impact_chain");
  });

  // A client that arrives as a PARAMETER is still a client, and dependency injection is
  // the idiomatic way to write a testable database module — so the type-only-import
  // exclusion was hiding the normal case, not an exotic one.
  test("an injected client that writes rows triggers the chain", () => {
    const control = baseControl({
      authorized_paths: ["lib/feature/reader.ts"],
      impact_domains: ["reader"],
    });
    const cwd = initRepo(control);
    write(cwd, "lib/feature/reader.ts", [
      "import type { PrismaClient } from " + JSON.stringify("@prisma/client") + ";",
      "export async function save(prisma: PrismaClient, id: string) {",
      "  return prisma.listingMedia.upsert({ where: { id }, create: {}, update: {} });",
      "}",
      "",
    ].join(String.fromCharCode(10)));
    git(cwd, "add", "lib/feature/reader.ts");
    git(cwd, "commit", "-m", "reader writes rows through an injected client");
    const res = gate(cwd);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("database_impact_chain");
  });

  // A dotenv file exists to set the connection variable, and it was the one format the
  // classifier never opened, because the content test sat behind the executable test.
  test("a dotenv file that sets the connection variable triggers the chain", () => {
    const rel = "config/production.env";
    const cwd = initRepo(baseControl({
      authorized_paths: [rel],
      allowed_new_files: [rel, "lib/allowed.ts"],
    }));
    write(cwd, rel, [
      "DATABASE_URL=postgresql://user:pass@example.neon.tech/db",
      "",
    ].join(String.fromCharCode(10)));
    git(cwd, "add", rel);
    git(cwd, "commit", "-m", "a dotenv file that sets the target");
    const res = gate(cwd);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("database_impact_chain");
  });

  // A migrate command is a schema change wherever it is written down, and package.json is
  // where these live. Swapping a migration for a force-push was invisible.
  test("changing a migrate command in package.json triggers the chain", () => {
    const cwd = initRepo(baseControl({
      authorized_paths: ["package.json"],
    }));
    write(cwd, "package.json", JSON.stringify({
      name: "fixture",
      scripts: { "db:migrate": "prisma db push --accept-data-loss" },
    }) + String.fromCharCode(10));
    git(cwd, "add", "package.json");
    git(cwd, "commit", "-m", "swap migrate deploy for a forced push");
    const res = gate(cwd);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("database_impact_chain");
  });

  // The noise side. A rule that forces a ten-station declaration for a one-line edit to a
  // prose document gets worked around rather than obeyed, and eight documents were in that
  // position purely because their filename contained the word neon.
  test("a prose document named after the provider is not a database change", () => {
    const rel = "docs/operations/neon-write-amplification-2026-07-25.md";
    const cwd = initRepo(baseControl({
      authorized_paths: [rel],
      allowed_new_files: [rel, "lib/allowed.ts"],
    }));
    write(cwd, rel, [
      "# Write amplification notes",
      "",
      "Measured on 2026-07-25. Nothing in this document executes.",
      "",
    ].join(String.fromCharCode(10)));
    git(cwd, "add", rel);
    git(cwd, "commit", "-m", "a prose note whose filename names the provider");
    expect(gate(cwd).stderr).not.toContain("database_impact_chain");
  });

  // A packet could issue its own ten-station chain out of files it wrote in the same
  // commit, because every station test was a keyword search over raw text and a COMMENT
  // contains keywords. Station content is now judged with comments stripped.
  test("a station is not satisfied by a comment that merely names it", () => {
    const rel = "lib/feature/note.ts";
    const chain = { ...FULL_DB_CHAIN };
    (chain as Record<string, string[]>).downstream_readers_writers = [rel];
    const control = dbControl(chain);
    control.allowed_new_files = [rel];
    const cwd = initRepo(control);
    write(cwd, rel, [
      "// DATABASE_URL — this module is part of the database chain.",
      "export const label = (s: string) => s.trim();",
      "",
    ].join(String.fromCharCode(10)));
    git(cwd, "add", rel);
    touchSchema(cwd, "db change whose downstream station is a comment");
    const res = gate(cwd);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("downstream_readers_writers");
  });

  // The migrations station had no content test at all, so any file under two directories
  // satisfied it — including one containing only a comment.
  test("an empty file under sql/ does not satisfy the migrations station", () => {
    const rel = "sql/notes.sql";
    const chain = { ...FULL_DB_CHAIN };
    (chain as Record<string, string[]>).migrations = [rel];
    const control = dbControl(chain);
    control.allowed_new_files = [rel];
    const cwd = initRepo(control);
    write(cwd, rel, "-- nothing to see here" + String.fromCharCode(10));
    git(cwd, "add", rel);
    touchSchema(cwd, "db change whose migration station is an empty sql file");
    const res = gate(cwd);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("migrations");
  });

  // preview and production both accepted the bare word deploy, so they could never be
  // distinguished and one deploy workflow stood for both.
  test("a workflow that names only deployment does not satisfy the preview station", () => {
    const rel = ".github/workflows/ship.yml";
    const chain = { ...FULL_DB_CHAIN };
    (chain as Record<string, string[]>).preview = [rel];
    const control = dbControl(chain);
    control.allowed_new_files = [rel];
    const cwd = initRepo(control);
    write(cwd, rel, [
      "name: ship",
      "jobs:",
      "  go:",
      "    steps:",
      "      - run: npx vercel deploy --prebuilt",
      "",
    ].join(String.fromCharCode(10)));
    git(cwd, "add", rel);
    touchSchema(cwd, "db change whose preview station only says deploy");
    const res = gate(cwd);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("preview");
  });

  // The greedy unbraced \u escape was a CORRECTNESS bug: JavaScript's unbraced form is
  // exactly four hex digits, and matching one to six swallowed the following character
  // whenever it was also a hex digit. N is followed by E, so the credential name vanished
  // from all four readings at once.
  test("a four-digit unicode escape followed by a hex letter is still refused", () => {
    const control = baseControl({
      authorized_paths: ["lib/feature/reader.ts"],
      impact_domains: ["reader"],
    });
    const cwd = initRepo(control);
    const slash = String.fromCharCode(92);
    write(cwd, "lib/feature/reader.ts", [
      "export const key = process.env[" + JSON.stringify(slash + "u004eEON_API_KEY") + "];",
      "",
    ].join(String.fromCharCode(10)));
    git(cwd, "add", "lib/feature/reader.ts");
    git(cwd, "commit", "-m", "reader spells the credential with a unicode escape");
    expect(gate(cwd).stderr).toContain("Direct Neon control-plane capability is prohibited");
  });
  // Four spellings of the same consumer got past the alias scan in successive rounds, so
  // the rule stopped being about names: loading the driver as a value IS the dependency.
  // These two are spellings nobody had written yet when that rule was added.
  function readerPacket(lines: string[], message: string) {
    const control = baseControl({
      authorized_paths: ["lib/feature/reader.ts"],
      impact_domains: ["reader"],
    });
    const cwd = initRepo(control);
    write(cwd, "lib/feature/reader.ts", lines.concat("").join(String.fromCharCode(10)));
    git(cwd, "add", "lib/feature/reader.ts");
    git(cwd, "commit", "-m", message);
    return gate(cwd);
  }

  test("a dynamically imported driver triggers the chain", () => {
    const res = readerPacket(
      [
        "const { Pool: P } = await import(" + JSON.stringify("pg") + ");",
        "export const reader = new P({});",
      ],
      "reader loads the driver dynamically"
    );
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("database_impact_chain");
  });

  test("a driver reached through a property assignment triggers the chain", () => {
    const res = readerPacket(
      [
        "const mod = require(" + JSON.stringify("pg") + ");",
        "const P = mod.Pool;",
        "export const reader = new P({});",
      ],
      "reader names the constructor through a property"
    );
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("database_impact_chain");
  });

  // The boundary of that broader rule. A type has no runtime connection, and an earlier
  // census found type-only imports common and inert, so they must stay out or the chain
  // becomes noise and stops meaning anything.
  test("a type-only driver import does not trigger the chain", () => {
    const res = readerPacket(
      [
        "import type { Pool } from " + JSON.stringify("pg") + ";",
        "export type ReaderPool = Pool;",
      ],
      "reader names the driver only as a type"
    );
    expect(res.status).toBe(0);
  });

  test("a capability signature assembled by template interpolation is still refused", () => {
    const interpolated =
      String.fromCharCode(96) + "https://console." + String.fromCharCode(36) + "{" +
      JSON.stringify("neon") + "}.tech/api/v2/projects" + String.fromCharCode(96);
    const res = readerPacket(
      ["export const endpoint = " + interpolated + ";"],
      "reader interpolates the control-plane host"
    );
    expect(res.status).not.toBe(0);
  });
  // A comment can sit between the fragments of a concatenated signature. Removing
  // comments is the obvious answer and is unsafe alone, because a line-comment strip cuts
  // "https://console.neon.tech" at its own "//". Both readings are scanned, so a signature
  // would have to survive with comments AND without them, which it cannot.
  test("a capability signature split by a block comment is still refused", () => {
    const control = baseControl({
      authorized_paths: ["lib/feature/reader.ts"],
      impact_domains: ["reader"],
    });
    const cwd = initRepo(control);
    write(
      cwd,
      "lib/feature/reader.ts",
      [
        "export const endpoint =",
        "  " + JSON.stringify("https://console.") + " /* seam */ + " + JSON.stringify("neon.tech/api/v2/projects") + ";",
        "",
      ].join(String.fromCharCode(10))
    );
    git(cwd, "add", "lib/feature/reader.ts");
    git(cwd, "commit", "-m", "reader assembles the control-plane host around a comment");
    expect(gate(cwd).stderr).toContain("Direct Neon control-plane capability is prohibited");
  });

  test("a credential name split by a block comment is still refused", () => {
    const control = baseControl({
      authorized_paths: ["lib/feature/reader.ts"],
      impact_domains: ["reader"],
    });
    const cwd = initRepo(control);
    write(
      cwd,
      "lib/feature/reader.ts",
      [
        "export const key = process.env[" + JSON.stringify("NEON_") + " /* seam */ + " + JSON.stringify("API_KEY") + "];",
        "",
      ].join(String.fromCharCode(10))
    );
    git(cwd, "add", "lib/feature/reader.ts");
    git(cwd, "commit", "-m", "reader assembles the credential name around a comment");
    expect(gate(cwd).stderr).toContain("Direct Neon control-plane capability is prohibited");
  });

  // The control for the pair above: stripping comments must not blind the scan to a host
  // written plainly, whose own "//" a line-comment strip would cut.
  test("a plainly written control-plane host is still refused", () => {
    const control = baseControl({
      authorized_paths: ["lib/feature/reader.ts"],
      impact_domains: ["reader"],
    });
    const cwd = initRepo(control);
    write(
      cwd,
      "lib/feature/reader.ts",
      [
        "export const endpoint = " + JSON.stringify("https://console.neon.tech/api/v2/projects") + ";",
        "",
      ].join(String.fromCharCode(10))
    );
    git(cwd, "add", "lib/feature/reader.ts");
    git(cwd, "commit", "-m", "reader names the control-plane host outright");
    expect(gate(cwd).stderr).toContain("Direct Neon control-plane capability is prohibited");
  });

  // A default value belongs to the destructuring pattern, not to the name. Keeping it made
  // the whole fragment fail the identifier test, so the binding vanished.
  test("a destructured alias with a default value triggers the chain", () => {
    const control = baseControl({
      authorized_paths: ["lib/feature/reader.ts"],
      impact_domains: ["reader"],
    });
    const cwd = initRepo(control);
    write(
      cwd,
      "lib/feature/reader.ts",
      [
        "const { Pool: PgPool = FallbackPool } = require(" + JSON.stringify("pg") + ");",
        "export const reader = new PgPool({});",
        "",
      ].join(String.fromCharCode(10))
    );
    git(cwd, "add", "lib/feature/reader.ts");
    git(cwd, "commit", "-m", "reader opens a pool under a defaulted renamed binding");
    const res = gate(cwd);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("database_impact_chain");
  });
  // String escapes evaluate at runtime, so an escaped host IS the prohibited host. A scan
  // that only matches the literal spelling is a scan an author can spell around.
  test("an escaped direct-Neon capability signature is still refused", () => {
    const control = baseControl({
      authorized_paths: ["lib/feature/reader.ts"],
      impact_domains: ["reader"],
    });
    const cwd = initRepo(control);
    const escapedHost =
      "console" + String.fromCharCode(92) + "x2eneon" + String.fromCharCode(92) + "x2etech";
    write(
      cwd,
      "lib/feature/reader.ts",
      [
        "export const endpoint = " + JSON.stringify(escapedHost) + ";",
        "",
      ].join(String.fromCharCode(10))
    );
    git(cwd, "add", "lib/feature/reader.ts");
    git(cwd, "commit", "-m", "reader reaches the control plane through an escaped host");
    const res = gate(cwd);
    expect(res.status).not.toBe(0);
  });
  // I went looking for a crash here and did not find one: the control contract already
  // validates every station entry when the document is parsed, well before the chain is
  // evaluated. These two tests exist because that behaviour had no coverage in this suite,
  // so nothing would have noticed if the contract validation were later relaxed. The
  // distinction they lock in is the one that matters for a governance gate: a malformed
  // chain produces a REFUSAL naming the station, not a stack trace.
  test("a station entry that is not a path is refused, not crashed on", () => {
    const chain = { ...FULL_DB_CHAIN };
    (chain as Record<string, unknown[]>).env_resolution = [42];
    const cwd = initRepo(dbControl(chain));
    touchSchema(cwd, "db change with a numeric station entry");
    const res = gate(cwd);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("entries must be non-empty strings");
    expect(res.stderr).toContain("env_resolution");
    // A refusal, not a crash: no stack trace reached the operator.
    expect(res.stderr).not.toContain("TypeError");
  });

  test("an empty-string station entry is refused", () => {
    const chain = { ...FULL_DB_CHAIN };
    (chain as Record<string, unknown[]>).db_target = ["   "];
    const cwd = initRepo(dbControl(chain));
    touchSchema(cwd, "db change with a blank station entry");
    const res = gate(cwd);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("entries must be non-empty strings");
  });
  test("an UNVERIFIED station does not satisfy the mandatory chain", () => {
    const chain = { ...FULL_DB_CHAIN };
    for (const station of Object.keys(chain)) {
      (chain as Record<string, string[]>)[station] = ["UNVERIFIED - not established"];
    }
    const cwd = initRepo(dbControl(chain));
    touchSchema(cwd, "db change, every station UNVERIFIED");
    const res = gate(cwd);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("UNVERIFIED");
  });

  test("free text does not satisfy a mandatory station", () => {
    const chain = { ...FULL_DB_CHAIN };
    (chain as Record<string, string[]>).env_resolution = ["checked"];
    const cwd = initRepo(dbControl(chain));
    touchSchema(cwd, "db change, free-text station");
    const res = gate(cwd);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("env_resolution");
  });

  test("control-root-maintenance cannot pass a database-shaped path without the chain", () => {
    // vercel.json is a protected control path AND database-shaped. Root maintenance is the
    // only mode allowed to touch it, so it is the mode that must still demand the chain.
    const control = baseControl({
      mode: "control-root-maintenance",
      authorized_paths: ["vercel.json"],
      allowed_new_files: [],
      impact_domains: ["governance", "environment"],
      environment_mutation_authorized: true,
      impact_graph: {
        root_owner_paths: [MASTER],
        writer_paths: ["vercel.json"],
        reader_paths: ["lib/feature/reader.ts"],
        publisher_paths: ["vercel.json"],
        downstream_surfaces: ["Vercel schedules"],
        test_paths: ["tests/runtime/mallan-execution-control.test.ts"],
        compliance_surfaces: ["governance only"],
      },
    });
    const cwd = initRepo(control);
    write(cwd, "vercel.json", JSON.stringify({ crons: [] }));
    git(cwd, "add", "vercel.json");
    git(cwd, "commit", "-m", "root maintenance touching a database-shaped path");
    // Clear the authority-root precondition so the refusal can only come from the chain.
    const res = gate(cwd, { MALLAN_AUTHORITY_ROOT_REQUIRED: "true" });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("database_impact_chain");
  });

  test("a workflow that selects the database target triggers the chain", () => {
    const rel = ".github/workflows/geocode.yml";
    const control = dbControl(undefined);
    control.authorized_paths = [rel];
    control.allowed_new_files = [];
    const cwd = initRepo(control);
    write(cwd, rel, [
      "name: fixture",
      "env:",
      "  DATABASE_URL: postgresql://example/db",
      "  DATABASE_URL_UNPOOLED: postgresql://example/db",
    ].join(String.fromCharCode(10)));
    git(cwd, "add", rel);
    git(cwd, "commit", "-m", "workflow repoints the database target");
    const res = gate(cwd);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("database_impact_chain");
  });

  test("a fragmented direct-Neon writer is refused despite assembling the host at runtime", () => {
    const rel = "lib/allowed.ts";
    const cwd = initRepo(baseControl());
    write(cwd, rel, [
      "const host = [" + JSON.stringify("console") + ", " + JSON.stringify("ne") + " + " + JSON.stringify("on") + ", " + JSON.stringify("tech") + "].join(" + JSON.stringify(".") + ");",
      "const key = process.env[" + JSON.stringify("NE") + " + " + JSON.stringify("ON_API") + " + " + JSON.stringify("_KEY") + "];",
      "export const admin = () => fetch(" + JSON.stringify("https://") + " + host + " + JSON.stringify("/api/v2/projects") + ", { headers: { Authorization: key } });",
    ].join(String.fromCharCode(10)));
    git(cwd, "add", rel);
    git(cwd, "commit", "-m", "fragmented direct-neon capability");
    const res = gate(cwd);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("Direct Neon control-plane capability is prohibited");
  });

  test("the deleted verifier path cannot return", () => {
    const rel = "scripts/neon-verify.ts";
    const cwd = initRepo(baseControl({ authorized_paths: [rel], allowed_new_files: [rel] }));
    write(cwd, rel, "export const verify = () => 1;" + String.fromCharCode(10));
    git(cwd, "add", rel);
    git(cwd, "commit", "-m", "restore the deleted verifier");
    const res = gate(cwd);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("may not return");
  });

  test("a renamed direct-Neon writer is refused for its capability, not its filename", () => {
    for (const [rel, kind] of RENAMED_DIRECT_NEON) {
      const cwd = initRepo(baseControl({
        authorized_paths: [rel],
        allowed_new_files: [rel],
      }));
      const body = [
        "// " + kind + " that reaches the Neon control plane under a new name",
        "const api = " + JSON.stringify("https://" + " ".replace(" ", "") + "console.neon.tech" + "/api/v2") + ";",
        "const key = process.env." + "NEON_API_KEY" + ";",
      ].join(String.fromCharCode(10));
      write(cwd, rel, body);
      git(cwd, "add", rel);
      git(cwd, "commit", "-m", "renamed direct-neon " + kind);
      const err = gate(cwd).stderr;
      expect(err).toContain("Direct Neon control-plane capability is prohibited");
      expect(err).toContain(rel);
      // Refused for the capability, NOT because the deleted-path set names it.
      expect(err).not.toContain("Deleted direct-Neon control paths may not return");
    }
  }, 120000);

  test("the retired CLI is refused even in a file whose name says nothing about the provider", () => {
    const rel = "lib/allowed.ts";
    const cwd = initRepo(baseControl());
    write(cwd, rel, [
      "import { execSync } from " + JSON.stringify("node:child_process") + ";",
      "export const branches = () => execSync(" + JSON.stringify("neonctl" + " branches list") + ");",
    ].join(String.fromCharCode(10)));
    git(cwd, "add", rel);
    git(cwd, "commit", "-m", "retired CLI under a neutral filename");
    const err = gate(cwd).stderr;
    expect(err).toContain("Direct Neon control-plane capability is prohibited");
    expect(err).toContain(rel);
  });

  test("lib/db.ts triggers the mandatory database chain on content, not on its path", () => {
    const rel = "lib/db.ts";
    const cwd = initRepo(dbControl(undefined));
    // Authorize the path so the refusal can only come from the missing chain.
    const control = dbControl(undefined);
    control.authorized_paths = [rel];
    control.allowed_new_files = [rel];
    const cwd2 = initRepo(control);
    void cwd;
    write(cwd2, rel, [
      "import { Pool } from " + JSON.stringify("pg") + ";",
      "export const pool = new Pool({ connectionString: process.env.DATABASE_URL });",
    ].join(String.fromCharCode(10)));
    git(cwd2, "add", rel);
    git(cwd2, "commit", "-m", "canonical pool module");
    const err = gate(cwd2).stderr;
    expect(err).toContain("database_impact_chain");
    expect(err).toContain(rel);
  });

  test("a database-shaped change without the mandatory chain is refused", () => {
    const cwd = initRepo(dbControl(undefined));
    touchSchema(cwd, "db change, no chain");
    const err = gate(cwd).stderr;
    expect(err).toContain("database_impact_chain");
    expect(err).toContain("prisma/schema.prisma");
  });

  test("the chain is refused when any single station is missing", () => {
    for (const station of Object.keys(FULL_DB_CHAIN)) {
      const partial: Record<string, unknown> = { ...FULL_DB_CHAIN };
      delete partial[station];
      const cwd = initRepo(dbControl(partial));
      touchSchema(cwd, "db change, missing " + station);
      const err = gate(cwd).stderr;
      expect(err).toContain(station);
    }
  }, 120000);

  test("a station satisfied only by a document citation is refused", () => {
    const cwd = initRepo(dbControl({ ...FULL_DB_CHAIN, env_resolution: ["NEON.md", "CLAUDE.md"] }));
    touchSchema(cwd, "db change, prose station");
    const err = gate(cwd).stderr;
    expect(err).toContain("documentation-only: env_resolution");
  });

  test("a station naming a repo path that does not exist on the base is refused", () => {
    const cwd = initRepo(dbControl({ ...FULL_DB_CHAIN, db_target: ["lib/invented/target.ts"] }));
    touchSchema(cwd, "db change, fabricated station");
    const err = gate(cwd).stderr;
    expect(err).toContain("db_target: lib/invented/target.ts");
  });

  test("a complete, grounded chain lets a database change through", () => {
    const cwd = initRepo(dbControl(FULL_DB_CHAIN));
    touchSchema(cwd, "db change with a full chain");
    const res = gate(cwd);
    expect(res.status).toBe(0);
  });

  test("final phase enforces required proof tokens", () => {
    const cwd = initRepo(baseControl({ requirements: {
      impact_graph_required:true, all_readers_writers_required:true, negative_tests_required:false,
      integration_proof_required:true, downstream_proof_required:true,
      compliance_proof_required_when_applicable:true, no_parallel_path_proof_required:true
    }}));
    write(cwd, "lib/allowed.ts", "export const ok = true;\n");
    git(cwd, "add", "lib/allowed.ts"); git(cwd, "commit", "-m", "proof gated");
    expect(gate(cwd,{MALLAN_CONTROL_PHASE:"final"}).stderr).toContain("final execution proof is incomplete");
    expect(gate(cwd,{MALLAN_CONTROL_PHASE:"final",MALLAN_EXECUTION_PROOFS:"integration,downstream,compliance,no-parallel-path"}).status).toBe(0);
  });

  test("negative-tests requirement requires a changed declared test", () => {
    const cwd = initRepo(baseControl({ requirements: {
      impact_graph_required:true, all_readers_writers_required:true, negative_tests_required:true,
      integration_proof_required:false, downstream_proof_required:false,
      compliance_proof_required_when_applicable:false, no_parallel_path_proof_required:true
    }}));
    write(cwd, "lib/allowed.ts", "export const ok = true;\n");
    git(cwd, "add", "lib/allowed.ts"); git(cwd, "commit", "-m", "missing negative test");
    expect(gate(cwd).stderr).toContain("negative_tests_required=true");
  });

  test("control-root maintenance requires authority-root to be required", () => {
    const cwd = initRepo(baseControl({
      mode:"control-root-maintenance",
      authorized_paths:[".github/workflows/pr-check.yml","tests/runtime/mallan-execution-control.test.ts"],
      allowed_new_files:[], impact_domains:["governance"],
      impact_graph:{
        root_owner_paths:[MASTER], writer_paths:[".github/workflows/pr-check.yml"], reader_paths:["lib/feature/reader.ts"],
        publisher_paths:[".github/workflows/pr-check.yml"], downstream_surfaces:["GitHub merge gate"],
        test_paths:["tests/runtime/mallan-execution-control.test.ts"], compliance_surfaces:["governance only"]
      }
    }));
    write(cwd,".github/workflows/pr-check.yml","name: maintained gate\n");
    write(cwd,"tests/runtime/mallan-execution-control.test.ts","root proof\n");
    git(cwd,"add",".github/workflows/pr-check.yml","tests/runtime/mallan-execution-control.test.ts");
    git(cwd,"commit","-m","root maintenance");
    expect(gate(cwd).stderr).toContain("authority-root is a required main-branch status check");
    expect(gate(cwd,{MALLAN_AUTHORITY_ROOT_REQUIRED:"true"}).status).toBe(0);
  });

  test("control-root maintenance exits through state-only control update", () => {
    const cwd=initRepo(baseControl({mode:"control-root-maintenance",authorized_paths:[".github/workflows/pr-check.yml"],allowed_new_files:[],impact_domains:["governance"]}));
    write(cwd,STATE,controlMarkdown(baseControl({
      mode:"control-update",
      authorized_paths:[STATE],
      allowed_new_files:[],
      impact_domains:["governance"],
      impact_graph:{
        root_owner_paths:[MASTER],
        writer_paths:[STATE],
        reader_paths:["lib/feature/reader.ts"],
        publisher_paths:["lib/feature/publisher.ts"],
        downstream_surfaces:["GitHub merge gate"],
        test_paths:["tests/runtime/mallan-execution-control.test.ts"],
        compliance_surfaces:["governance only"]
      }
    })));
    git(cwd,"add",STATE); git(cwd,"commit","-m","exit root maintenance");
    expect(gate(cwd).stdout).toContain("state-only control update");
  });

  // The implementation-mode exit. Implementation mode was a one-way door: it refused every change to the
  // Execution State, so the first merged implementation contract could never be replaced.
  // These prove the exit exists AND that it is exactly as narrow as the maintenance exit.
  const exitContract = (overrides: Record<string, unknown> = {}) => baseControl({
    mode: "control-update",
    authorized_paths: [STATE],
    allowed_new_files: [],
    impact_domains: ["governance"],
    impact_graph: {
      root_owner_paths: [MASTER],
      writer_paths: [STATE],
      reader_paths: ["lib/feature/reader.ts"],
      publisher_paths: ["lib/feature/publisher.ts"],
      downstream_surfaces: ["GitHub merge gate"],
      test_paths: ["tests/runtime/mallan-execution-control.test.ts"],
      compliance_surfaces: ["governance only"],
    },
    ...overrides,
  });

  test("implementation mode exits through a state-only control update", () => {
    const cwd = initRepo(baseControl());
    write(cwd, STATE, controlMarkdown(exitContract()));
    git(cwd, "add", STATE);
    git(cwd, "commit", "-m", "exit implementation");

    const result = gate(cwd);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Implementation exited through a state-only control update");
  });

  test("the implementation exit cannot re-scope implementation", () => {
    const cwd = initRepo(baseControl());
    write(cwd, STATE, controlMarkdown(baseControl({ authorized_paths: ["app/", "lib/"] })));
    git(cwd, "add", STATE);
    git(cwd, "commit", "-m", "widen implementation in place");

    const result = gate(cwd);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("only to exit to control-update mode");
    expect(result.stderr).toContain("proposed mode is implementation");
  });

  test("the implementation exit cannot jump straight to control-root-maintenance", () => {
    const cwd = initRepo(baseControl());
    write(cwd, STATE, controlMarkdown(exitContract({
      mode: "control-root-maintenance",
      authorized_paths: ["scripts/ci/mallan-execution-control.mjs"],
    })));
    git(cwd, "add", STATE);
    git(cwd, "commit", "-m", "jump to root maintenance");

    const result = gate(cwd);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("proposed mode is control-root-maintenance");
  });

  test("the implementation exit cannot carry code with it", () => {
    const cwd = initRepo(baseControl());
    write(cwd, STATE, controlMarkdown(exitContract()));
    // In-envelope on purpose: the refusal must come from the exit rule, not from scope.
    write(cwd, "lib/allowed.ts", "export const carried = true;\n");
    git(cwd, "add", STATE, "lib/allowed.ts");
    git(cwd, "commit", "-m", "exit plus code");

    const result = gate(cwd);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("may not modify authority file");
  });

  test("a malformed implementation exit contract is refused", () => {
    const cwd = initRepo(baseControl());
    const { requirements, ...withoutRequirements } = exitContract();
    void requirements;
    write(cwd, STATE, controlMarkdown(withoutRequirements));
    git(cwd, "add", STATE);
    git(cwd, "commit", "-m", "malformed exit");

    const result = gate(cwd);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Implementation exit contract is invalid");
  });

  test("the implementation exit must stay anchored to the PR base", () => {
    const cwd = initRepo(baseControl());
    write(cwd, STATE, controlMarkdown(exitContract({ base_branch: "develop" })));
    git(cwd, "add", STATE);
    git(cwd, "commit", "-m", "re-anchor exit");

    const result = gate(cwd);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("must remain anchored to main");
  });

  // The whole door, both directions, each step evaluated against the base the previous
  // step merged. This is the demonstration the one-way-door record showed failing, run to completion.
  test("control-update to implementation and back again round-trips", () => {
    const cwd = initRepo(exitContract());

    write(cwd, STATE, controlMarkdown(baseControl()));
    git(cwd, "add", STATE);
    git(cwd, "commit", "-m", "enter implementation");
    expect(gate(cwd).status).toBe(0);
    git(cwd, "branch", "-f", "origin-main");

    write(cwd, STATE, controlMarkdown(exitContract({ packet_id: "EXIT" })));
    git(cwd, "add", STATE);
    git(cwd, "commit", "-m", "leave implementation");
    const exit = gate(cwd);
    expect(exit.status).toBe(0);
    expect(exit.stdout).toContain("Implementation exited through a state-only control update");
    git(cwd, "branch", "-f", "origin-main");

    write(cwd, STATE, controlMarkdown(exitContract({ packet_id: "NEXT" })));
    git(cwd, "add", STATE);
    git(cwd, "commit", "-m", "ordinary control update");
    expect(gate(cwd).stdout).toContain("Control-update PR");
  });

  test("glob authorization preserves the directory boundary", () => {
    const cwd = initRepo(baseControl({
      authorized_paths: ["lib/feature/**"],
      allowed_new_files: [],
      impact_graph: {
        root_owner_paths: [MASTER],
        writer_paths: ["lib/feature/reader.ts"],
        reader_paths: ["lib/feature/reader.ts"],
        publisher_paths: ["lib/feature/publisher.ts"],
        downstream_surfaces: ["test downstream"],
        test_paths: ["tests/runtime/mallan-execution-control.test.ts"],
        compliance_surfaces: ["none for fixture"],
      },
    }));
    write(cwd, "lib/feature-escape.ts", "export const escape = false;\n");
    git(cwd, "add", "lib/feature-escape.ts");
    git(cwd, "commit", "-m", "base sibling");
    git(cwd, "branch", "-f", "origin-main");
    write(cwd, "lib/feature-escape.ts", "export const escape = true;\n");
    git(cwd, "add", "lib/feature-escape.ts");
    git(cwd, "commit", "-m", "attempt sibling prefix escape");

    const result = gate(cwd);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("outside the base-state authorization envelope");
    expect(result.stderr).toContain("lib/feature-escape.ts");
  });

  test("authority-root ruleset probe only accepts an active rule that applies to main", () => {
    const cwd = initRepo();
    const authorityRule = {
      type: "required_status_checks",
      parameters: { required_status_checks: [{ context: "authority-root" }] },
    };
    const releaseOnly = [{
      id: 1,
      enforcement: "active",
      target: "branch",
      conditions: { ref_name: { include: ["refs/heads/release/*"], exclude: [] } },
      rules: [authorityRule],
    }];
    const mainRule = [{
      id: 2,
      enforcement: "active",
      target: "branch",
      conditions: { ref_name: { include: ["refs/heads/main"], exclude: [] } },
      rules: [authorityRule],
    }];
    const excludedMain = [{
      id: 3,
      enforcement: "active",
      target: "branch",
      conditions: { ref_name: { include: ["~ALL"], exclude: ["refs/heads/main"] } },
      rules: [authorityRule],
    }];

    const probe = (fixture: unknown) => run("node", [GATE, "--authority-root-required-main"], cwd, {
      NODE_ENV: "test",
      MALLAN_RULESET_FIXTURE_JSON: JSON.stringify(fixture),
    });

    expect(probe(releaseOnly).stdout).toContain("false");
    expect(probe(excludedMain).stdout).toContain("false");
    expect(probe(mainRule).stdout).toContain("true");
  });

  // The OUT direction: a fixture probe inside the Jest step once wrote its invented answer into
  // the real job's GITHUB_ENV, so every later pr-check step, including the final
  // execution-control proof, read true while the live probe had answered false.
  test("a fixture probe cannot write the job's GITHUB_ENV", () => {
    const cwd = initRepo();
    const jobEnv = path.join(cwd, "job-github-env");
    fs.writeFileSync(jobEnv, "");
    const mainRule = [{
      id: 2,
      enforcement: "active",
      target: "branch",
      conditions: { ref_name: { include: ["refs/heads/main"], exclude: [] } },
      rules: [{ type: "required_status_checks", parameters: { required_status_checks: [{ context: "authority-root" }] } }],
    }];
    const previous = process.env.GITHUB_ENV;
    process.env.GITHUB_ENV = jobEnv;
    try {
      const fixture = run("node", [GATE, "--authority-root-required-main"], cwd, {
        NODE_ENV: "test",
        MALLAN_RULESET_FIXTURE_JSON: JSON.stringify(mainRule),
      });
      expect(fixture.stdout).toContain("true");
      expect(fs.readFileSync(jobEnv, "utf8")).toBe("");
    } finally {
      if (previous === undefined) delete process.env.GITHUB_ENV;
      else process.env.GITHUB_ENV = previous;
    }
  });

  // The IN direction: exactly the CI failure on PR #637, where pr-check had exported true.
  test("a job-level authority-root flag does not reach a fixture", () => {
    const previous = process.env.MALLAN_AUTHORITY_ROOT_REQUIRED;
    process.env.MALLAN_AUTHORITY_ROOT_REQUIRED = "true";
    try {
      const cwd = initRepo(baseControl({
        mode: "control-root-maintenance",
        authorized_paths: [".github/workflows/pr-check.yml", "tests/runtime/mallan-execution-control.test.ts"],
        allowed_new_files: [], impact_domains: ["governance"],
        impact_graph: {
          root_owner_paths: [MASTER], writer_paths: [".github/workflows/pr-check.yml"], reader_paths: ["lib/feature/reader.ts"],
          publisher_paths: [".github/workflows/pr-check.yml"], downstream_surfaces: ["GitHub merge gate"],
          test_paths: ["tests/runtime/mallan-execution-control.test.ts"], compliance_surfaces: ["governance only"],
        },
      }));
      write(cwd, ".github/workflows/pr-check.yml", "name: maintained gate\n");
      write(cwd, "tests/runtime/mallan-execution-control.test.ts", "root proof\n");
      git(cwd, "add", ".github/workflows/pr-check.yml", "tests/runtime/mallan-execution-control.test.ts");
      git(cwd, "commit", "-m", "root maintenance");

      const result = gate(cwd);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("authority-root is a required main-branch status check");
    } finally {
      if (previous === undefined) delete process.env.MALLAN_AUTHORITY_ROOT_REQUIRED;
      else process.env.MALLAN_AUTHORITY_ROOT_REQUIRED = previous;
    }
  });


  test("ordinary implementation cannot change vercel.json even with environment mutation authority", () => {
    const cwd = initRepo(baseControl({
      authorized_paths: ["vercel.json"],
      allowed_new_files: [],
      impact_domains: ["environment"],
      environment_mutation_authorized: true,
      impact_graph: {
        root_owner_paths: [MASTER],
        writer_paths: ["vercel.json"],
        reader_paths: ["lib/feature/reader.ts"],
        publisher_paths: ["lib/feature/publisher.ts"],
        downstream_surfaces: ["Vercel schedule configuration"],
        test_paths: ["tests/runtime/mallan-execution-control.test.ts"],
        compliance_surfaces: ["governance only"],
      },
    }));
  write(cwd, "vercel.json", JSON.stringify({ crons: [{ path: "/api/cron/example", schedule: "0 5 * * *" }] }) + String.fromCharCode(10));
    git(cwd, "add", "vercel.json");
    git(cwd, "commit", "-m", "base vercel config");
    git(cwd, "branch", "-f", "origin-main");

    write(cwd, "vercel.json", '{"crons":[{"path":"/api/cron/example","schedule":"0 4 * * *"}]}\n');
    git(cwd, "add", "vercel.json");
    git(cwd, "commit", "-m", "attempt schedule mutation");

    const result = gate(cwd);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("protected execution/proof root");
    expect(result.stderr).toContain("vercel.json");
  });

  test("control-update rejects non-string entries in control arrays", () => {
    const cwd = initRepo(baseControl({ mode: "control-update", authorized_paths: [STATE] }));
    const poisoned: any = baseControl({
      mode: "implementation",
      authorized_paths: [null],
      allowed_new_files: [],
      impact_domains: ["governance"],
    });
    write(cwd, STATE, controlMarkdown(poisoned));
    git(cwd, "add", STATE);
    git(cwd, "commit", "-m", "poison authorized paths");

    const result = gate(cwd);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("control.authorized_paths entries must be non-empty strings");
  });

  test("control-update rejects non-string entries in impact graph arrays", () => {
    const cwd = initRepo(baseControl({ mode: "control-update", authorized_paths: [STATE] }));
    const poisoned: any = baseControl({
      mode: "implementation",
      authorized_paths: ["lib/allowed.ts"],
      impact_domains: ["test"],
      impact_graph: {
        root_owner_paths: [MASTER],
        writer_paths: [null],
        reader_paths: ["lib/feature/reader.ts"],
        publisher_paths: ["lib/feature/publisher.ts"],
        downstream_surfaces: ["test downstream"],
        test_paths: ["tests/runtime/mallan-execution-control.test.ts"],
        compliance_surfaces: ["none"],
      },
    });
    write(cwd, STATE, controlMarkdown(poisoned));
    git(cwd, "add", STATE);
    git(cwd, "commit", "-m", "poison impact graph");

    const result = gate(cwd);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("control.impact_graph.writer_paths entries must be non-empty strings");
  });


  test("control-root maintenance cannot delete essential authority files", () => {
    const essentials = [
      "scripts/ci/mallan-execution-control.mjs",
      ".github/workflows/authority-root.yml",
      ".github/workflows/pr-check.yml",
      ".github/workflows/branch-authority.yml",
    ];

    for (const essential of essentials) {
      const cwd = initRepo(baseControl({
        mode: "control-root-maintenance",
        authorized_paths: [essential],
        allowed_new_files: [],
        impact_domains: ["governance"],
        impact_graph: {
          root_owner_paths: [MASTER],
          writer_paths: [essential],
          reader_paths: ["lib/feature/reader.ts"],
          publisher_paths: [essential],
          downstream_surfaces: ["GitHub authority root"],
          test_paths: ["tests/runtime/mallan-execution-control.test.ts"],
          compliance_surfaces: ["governance only"],
        },
      }));

      if (!fs.existsSync(path.join(cwd, essential))) {
        write(cwd, essential, "fixture authority root\n");
        git(cwd, "add", essential);
        git(cwd, "commit", "-m", "establish essential authority file");
        git(cwd, "branch", "-f", "origin-main");
      }

      git(cwd, "rm", essential);
      git(cwd, "commit", "-m", "attempt essential authority deletion");
      const result = gate(cwd, { MALLAN_AUTHORITY_ROOT_REQUIRED: "true" });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("may not delete");
      expect(result.stderr).toContain(essential);
    }
  });

  test("deleting a declared negative test cannot satisfy negative-test proof", () => {
    const negativeTest = "tests/runtime/feature-negative.test.ts";
    const cwd = initRepo(baseControl({
      authorized_paths: ["lib/allowed.ts", negativeTest],
      allowed_new_files: ["lib/allowed.ts"],
      impact_graph: {
        root_owner_paths: [MASTER],
        writer_paths: ["lib/allowed.ts"],
        reader_paths: ["lib/feature/reader.ts"],
        publisher_paths: ["lib/feature/publisher.ts"],
        downstream_surfaces: ["test downstream"],
        test_paths: [negativeTest],
        compliance_surfaces: ["none for fixture"],
      },
      requirements: {
        impact_graph_required: true,
        all_readers_writers_required: true,
        negative_tests_required: true,
        integration_proof_required: false,
        downstream_proof_required: false,
        compliance_proof_required_when_applicable: false,
        no_parallel_path_proof_required: true,
      },
    }));

    write(cwd, negativeTest, "test('negative fixture', () => expect(true).toBe(true));\n");
    git(cwd, "add", negativeTest);
    git(cwd, "commit", "-m", "establish declared negative test");
    git(cwd, "branch", "-f", "origin-main");

    git(cwd, "rm", negativeTest);
    write(cwd, "lib/allowed.ts", "export const ok = true;\n");
    git(cwd, "add", "lib/allowed.ts");
    git(cwd, "commit", "-m", "delete declared negative test");

    const result = gate(cwd);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("declared test paths were deleted");
    expect(result.stderr).toContain(negativeTest);
  });

  test("a changed declared negative test must remain present at HEAD", () => {
    const negativeTest = "tests/runtime/feature-negative.test.ts";
    const cwd = initRepo(baseControl({
      authorized_paths: ["lib/allowed.ts", negativeTest],
      allowed_new_files: ["lib/allowed.ts"],
      impact_graph: {
        root_owner_paths: [MASTER],
        writer_paths: ["lib/allowed.ts"],
        reader_paths: ["lib/feature/reader.ts"],
        publisher_paths: ["lib/feature/publisher.ts"],
        downstream_surfaces: ["test downstream"],
        test_paths: [negativeTest],
        compliance_surfaces: ["none for fixture"],
      },
      requirements: {
        impact_graph_required: true,
        all_readers_writers_required: true,
        negative_tests_required: true,
        integration_proof_required: false,
        downstream_proof_required: false,
        compliance_proof_required_when_applicable: false,
        no_parallel_path_proof_required: true,
      },
    }));

    write(cwd, negativeTest, "test('negative fixture', () => expect(true).toBe(true));\n");
    git(cwd, "add", negativeTest);
    git(cwd, "commit", "-m", "establish declared negative test");
    git(cwd, "branch", "-f", "origin-main");

    write(cwd, negativeTest, "test('negative fixture', () => expect(false).toBe(false));\n");
    write(cwd, "lib/allowed.ts", "export const ok = true;\n");
    git(cwd, "add", negativeTest, "lib/allowed.ts");
    git(cwd, "commit", "-m", "update declared negative test");

    expect(gate(cwd).status).toBe(0);
  });


  // ---------------------------------------------------------------------------------------------
  // MASTER AMENDMENT MODE (ledger row 19, packet GOVERNANCE-MASTER-AMENDMENT-PATH-2026-09-24).
  // Every property of the merged contract is proven here, and each test fails against the
  // controller that preceded this packet, which had no master-amendment mode at all.
  // Section bytes are computed below by plain string search on an ASCII fixture, independently of
  // the controller's own byte scanner.
  // ---------------------------------------------------------------------------------------------
  const AM_START = "## 0.12 Live Vercel resource discovery";
  const AM_END = "## 0.13 Next section";
  const AM_BASE = [
    "# MALLAN PLATFORM MASTER PLAN",
    "",
    "## 0.1 Scope",
    "Scope text.",
    "",
    AM_START,
    "Old discovery rule.",
    "",
    "### 0.12.1 Detail",
    "Detail text.",
    "",
    AM_END,
    "Next text.",
    "",
    "## 0.14 Tail",
    "Tail text.",
    "",
  ].join("\n");
  const AM_HEAD = AM_BASE.replace("Old discovery rule.", "New discovery rule.");

  const sha256Hex = (bytes: Buffer) => crypto.createHash("sha256").update(bytes).digest("hex");
  const gitBlobSha = (bytes: Buffer) =>
    crypto.createHash("sha1").update(Buffer.concat([Buffer.from("blob " + bytes.length + "\0"), bytes])).digest("hex");
  const sectionOf = (text: string, start: string = AM_START, end: string | null = AM_END) => {
    const a = text.indexOf(start + "\n");
    const z = end === null ? text.length : text.indexOf("\n" + end + "\n", a) + 1;
    return Buffer.from(text.slice(a, z), "utf8");
  };
  const amEnvelope = (base: string = AM_BASE, head: string = AM_HEAD, overrides: Record<string, unknown> = {}) => ({
    base_master_blob: gitBlobSha(Buffer.from(base, "utf8")),
    section_start_heading: AM_START,
    section_end_heading: AM_END as unknown,
    section_before_sha256: sha256Hex(sectionOf(base)),
    section_after_sha256: sha256Hex(sectionOf(head)),
    ...overrides,
  });
  const amendmentControl = (envelope: Record<string, unknown> | undefined, overrides: Record<string, unknown> = {}) => {
    const control: Record<string, unknown> = baseControl({
      mode: "master-amendment",
      authorized_paths: [MASTER],
      allowed_new_files: [],
      impact_domains: ["governance"],
      impact_graph: {
        root_owner_paths: [MASTER],
        writer_paths: [MASTER],
        reader_paths: ["lib/feature/reader.ts"],
        publisher_paths: ["lib/feature/publisher.ts"],
        downstream_surfaces: ["the governed Master"],
        test_paths: ["tests/runtime/mallan-execution-control.test.ts"],
        compliance_surfaces: ["governance only"],
      },
      ...overrides,
    });
    if (envelope !== undefined) control.master_amendment = envelope;
    return control;
  };
  // BASE = the given contract and base Master; the caller then commits the HEAD edits.
  function amendmentRepo(control: Record<string, unknown>, baseMaster: string = AM_BASE) {
    const cwd = initRepo();
    write(cwd, MASTER, baseMaster);
    write(cwd, STATE, controlMarkdown(control));
    git(cwd, "add", MASTER, STATE);
    git(cwd, "commit", "-m", "base master-amendment contract");
    git(cwd, "branch", "-f", "origin-main");
    return cwd;
  }
  const amendGate = (cwd: string, overrides: Record<string, string> = {}) =>
    gate(cwd, { MALLAN_AUTHORITY_ROOT_REQUIRED: "true", ...overrides });
  function commitMaster(cwd: string, text: string, message = "amend master") {
    write(cwd, MASTER, text);
    git(cwd, "add", MASTER);
    git(cwd, "commit", "-m", message);
  }
  function expectRefused(result: ReturnType<typeof gate>, message: string) {
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
  }

  test("t1 master amendment: correct base Master, section and exactly the expected replacement passes", () => {
    const cwd = amendmentRepo(amendmentControl(amEnvelope()));
    commitMaster(cwd, AM_HEAD);
    const result = amendGate(cwd);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Master amendment is base-authorized, Master-only and content-pinned");
  });

  test("t1 master amendment: an explicitly recorded end-of-file boundary passes", () => {
    const start = "## 0.14 Tail";
    const head = AM_BASE.replace("Tail text.", "Tail text, amended.");
    const cwd = amendmentRepo(amendmentControl(amEnvelope(AM_BASE, head, {
      section_start_heading: start,
      section_end_heading: { end_of_file: true },
      section_before_sha256: sha256Hex(sectionOf(AM_BASE, start, null)),
      section_after_sha256: sha256Hex(sectionOf(head, start, null)),
    })));
    commitMaster(cwd, head);
    expect(amendGate(cwd).status).toBe(0);
  });

  test("t2 master amendment: a wrong or stale base Master blob fails", () => {
    const cwd = amendmentRepo(amendmentControl(amEnvelope(AM_BASE, AM_HEAD, {
      base_master_blob: gitBlobSha(Buffer.from("# stale master\n", "utf8")),
    })));
    commitMaster(cwd, AM_HEAD);
    expectRefused(amendGate(cwd), "the base Master blob is");
  });

  test("t3 master amendment: a wrong section-before digest fails", () => {
    const cwd = amendmentRepo(amendmentControl(amEnvelope(AM_BASE, AM_HEAD, {
      section_before_sha256: sha256Hex(Buffer.from("not the section", "utf8")),
    })));
    commitMaster(cwd, AM_HEAD);
    expectRefused(amendGate(cwd), "the section-before SHA-256 does not match");
  });

  test("t4 master amendment: a wrong section-after digest fails", () => {
    const cwd = amendmentRepo(amendmentControl(amEnvelope(AM_BASE, AM_HEAD, {
      section_after_sha256: sha256Hex(Buffer.from("some other amendment", "utf8")),
    })));
    commitMaster(cwd, AM_HEAD);
    expectRefused(amendGate(cwd), "the section-after SHA-256 does not match");
  });

  test("t5 master amendment: an extra unintended edit inside the authorized section fails", () => {
    const cwd = amendmentRepo(amendmentControl(amEnvelope()));
    commitMaster(cwd, AM_HEAD.replace("Detail text.", "Detail text, also changed."));
    expectRefused(amendGate(cwd), "the section-after SHA-256 does not match");
  });

  test("t6 master amendment: an edit outside the authorized section fails", () => {
    const before = amendmentRepo(amendmentControl(amEnvelope()));
    commitMaster(before, AM_HEAD.replace("Scope text.", "Scope text, changed."));
    expectRefused(amendGate(before), "bytes before the authorized section changed");

    const only = amendmentRepo(amendmentControl(amEnvelope()));
    commitMaster(only, AM_BASE.replace("Tail text.", "Tail text, changed."));
    expectRefused(amendGate(only), "the section-after SHA-256 does not match");
  });

  test("t7 master amendment: the authorized edit plus an edit to another Master section fails", () => {
    const cwd = amendmentRepo(amendmentControl(amEnvelope()));
    commitMaster(cwd, AM_HEAD.replace("Next text.", "Next text, changed."));
    expectRefused(amendGate(cwd), "bytes after the authorized section changed");
  });

  test("t8 master amendment: heading or boundary manipulation fails", () => {
    const variants: Array<[string, string, string]> = [
      ["renamed start heading", AM_HEAD.replace(AM_START, "## 0.12 Renamed discovery"), "the start heading occurs 0 times"],
      ["demoted start heading", AM_HEAD.replace(AM_START, "#" + AM_START), "the start heading occurs 0 times"],
      ["removed start heading", AM_HEAD.replace(AM_START + "\n", ""), "the start heading occurs 0 times"],
      ["added second start heading", AM_HEAD.replace("Tail text.", "Tail text.\n\n" + AM_START), "the start heading occurs 2 times"],
      ["renamed closing heading", AM_HEAD.replace(AM_END, "## 0.13 Renamed next"), "the closing heading occurs 0 times"],
      ["removed closing heading", AM_HEAD.replace(AM_END + "\n", ""), "the closing heading occurs 0 times"],
      ["closing heading moved by an inserted heading", AM_HEAD.replace("### 0.12.1 Detail", "## 0.12.9 Inserted heading"),
        "the recorded closing heading is not the first heading at the same or a higher level"],
      ["start heading moved below the closing heading",
        AM_HEAD.replace(AM_START + "\n", "").replace(AM_END + "\n", AM_END + "\n" + AM_START + "\n"),
        "the closing heading appears before the start heading"],
    ];
    for (const [name, text, message] of variants) {
      const cwd = amendmentRepo(amendmentControl(amEnvelope()));
      commitMaster(cwd, text, name);
      expectRefused(amendGate(cwd), message);
    }
  });

  test("t9 master amendment: HEAD cannot change its own authorization", () => {
    const other = AM_BASE.replace("Old discovery rule.", "Some other rule.");

    const withMaster = amendmentRepo(amendmentControl(amEnvelope()));
    write(withMaster, STATE, controlMarkdown(amendmentControl(amEnvelope(AM_BASE, other))));
    write(withMaster, MASTER, other);
    git(withMaster, "add", STATE, MASTER);
    git(withMaster, "commit", "-m", "self-authorize a different amendment");
    expectRefused(amendGate(withMaster), "Master amendment may change " + MASTER + " only");

    const stateOnly = amendmentRepo(amendmentControl(amEnvelope()));
    write(stateOnly, STATE, controlMarkdown(amendmentControl(amEnvelope(AM_BASE, other))));
    git(stateOnly, "add", STATE);
    git(stateOnly, "commit", "-m", "re-scope the envelope in place");
    expectRefused(amendGate(stateOnly), "may exit only to control-update mode");

    const fromUpdate = initRepo(baseControl({ mode: "control-update", authorized_paths: [STATE], allowed_new_files: [], impact_domains: ["governance"] }));
    write(fromUpdate, STATE, controlMarkdown(amendmentControl(amEnvelope("# MASTER\n", "# MASTER\nchanged\n"))));
    write(fromUpdate, MASTER, "# MASTER\nchanged\n");
    git(fromUpdate, "add", STATE, MASTER);
    git(fromUpdate, "commit", "-m", "grant and use a Master amendment in one PR");
    expectRefused(amendGate(fromUpdate), "Execution contract is in control-update mode. Only");
  });

  test("t10 master amendment: the Master plus the Execution State in the same PR fails", () => {
    const cwd = amendmentRepo(amendmentControl(amEnvelope()));
    write(cwd, STATE, controlMarkdown(amendmentControl(amEnvelope())) + "\nState note added in the amendment PR.\n");
    write(cwd, MASTER, AM_HEAD);
    git(cwd, "add", STATE, MASTER);
    git(cwd, "commit", "-m", "master and state together");
    const result = amendGate(cwd);
    expectRefused(result, "Master amendment may change " + MASTER + " only");
    expect(result.stderr).toContain(STATE);
  });

  test("t11 master amendment: the Master plus any second repository path fails", () => {
    const second = [
      "lib/allowed.ts",
      "tests/runtime/mallan-execution-control.test.ts",
      ".github/workflows/pr-check.yml",
      "vercel.json",
      "prisma/schema.prisma",
      "lib/ops/db-target.ts",
      "scripts/ci/mallan-execution-control.mjs",
      "docs/notes.md",
    ];
    for (const extra of second) {
      const cwd = amendmentRepo(amendmentControl(amEnvelope()));
      write(cwd, MASTER, AM_HEAD);
      write(cwd, extra, "changed alongside the Master\n");
      git(cwd, "add", MASTER, extra);
      git(cwd, "commit", "-m", "master plus " + extra);
      const result = amendGate(cwd);
      expectRefused(result, "Master amendment may change " + MASTER + " only");
      expect(result.stderr).toContain(extra);
    }
  });

  test("t12 master amendment: equal-length substitutions and line-ending or whitespace-only changes fail", () => {
    const variants: Array<[string, string, string]> = [
      ["equal-length byte substitution", AM_HEAD.replace("New discovery rule.", "New discovery rulf."), "the section-after SHA-256 does not match"],
      ["CRLF line ending inside the section", AM_HEAD.replace("New discovery rule.\n", "New discovery rule.\r\n"), "the section-after SHA-256 does not match"],
      ["trailing whitespace inside the section", AM_HEAD.replace("New discovery rule.", "New discovery rule. "), "the section-after SHA-256 does not match"],
      ["tab instead of a space inside the section", AM_HEAD.replace("New discovery rule.", "New\tdiscovery rule."), "the section-after SHA-256 does not match"],
      ["CRLF line ending outside the section", AM_HEAD.replace("Tail text.\n", "Tail text.\r\n"), "bytes after the authorized section changed"],
    ];
    for (const [name, text, message] of variants) {
      const cwd = amendmentRepo(amendmentControl(amEnvelope()));
      commitMaster(cwd, text, name);
      expectRefused(amendGate(cwd), message);
    }
  });

  test("t13 master amendment: duplicate or ambiguous anchors and boundaries fail closed", () => {
    const withHead = (base: string) => base.replace("Old discovery rule.", "New discovery rule.");
    const cases: Array<[string, string, Record<string, unknown>, string]> = [
      ["duplicated start heading", AM_BASE.replace("Tail text.", "Tail text.\n\n" + AM_START), {}, "the start heading occurs 2 times"],
      ["duplicated closing heading", AM_BASE.replace("Tail text.", "Tail text.\n\n" + AM_END), {}, "the closing heading occurs 2 times"],
      ["closing heading duplicated inside a fenced block", AM_BASE.replace("Tail text.", "Tail text.\n\n```\n" + AM_END + "\n```"), {}, "the closing heading occurs 2 times"],
      ["closing boundary before the start", AM_BASE, { section_end_heading: "## 0.1 Scope" }, "the closing heading appears before the start heading"],
      ["decoy heading inside a fenced block", AM_BASE.replace("Detail text.", "Detail text.\n\n```md\n## Decoy heading\n```"), {}, "heading-like text that is not an actual Master heading"],
      ["start heading only inside a fenced block", AM_BASE.replace(AM_START + "\n", "```\n" + AM_START + "\n```\n"), {}, "the start heading line is not an actual Master heading"],
      ["unclosed fenced block", AM_BASE.replace("Detail text.", "Detail text.\n```"), {}, "unclosed fenced code block"],
      ["end of file recorded while a closing heading exists", AM_BASE, { section_end_heading: { end_of_file: true } }, "the envelope records end of file"],
    ];
    for (const [name, base, overrides, message] of cases) {
      const head = withHead(base);
      const cwd = amendmentRepo(amendmentControl(amEnvelope(base, head, overrides)), base);
      commitMaster(cwd, head, name);
      expectRefused(amendGate(cwd), message);
    }
  });

  test("master amendment: the base contract must carry all five content-envelope values", () => {
    const keys = ["base_master_blob", "section_start_heading", "section_end_heading", "section_before_sha256", "section_after_sha256"];
    for (const key of keys) {
      const envelope: Record<string, unknown> = amEnvelope();
      delete envelope[key];
      const cwd = amendmentRepo(amendmentControl(envelope));
      commitMaster(cwd, AM_HEAD);
      expectRefused(amendGate(cwd), "control.master_amendment." + key + " is required");
    }
    const bare = amendmentRepo(amendmentControl(undefined));
    commitMaster(bare, AM_HEAD);
    expectRefused(amendGate(bare), "requires the control.master_amendment content envelope");

    const byLine = amendmentRepo(amendmentControl(amEnvelope(AM_BASE, AM_HEAD, { section_end_heading: 12 })));
    commitMaster(byLine, AM_HEAD);
    expectRefused(amendGate(byLine), "control.master_amendment.section_end_heading must be one exact heading line");
  });

  test("master amendment: the contract may authorize only the Master and no mutation class", () => {
    const wider = amendmentRepo(amendmentControl(amEnvelope(), { authorized_paths: [MASTER, STATE] }));
    commitMaster(wider, AM_HEAD);
    expectRefused(amendGate(wider), "master-amendment mode must authorize exactly one path");

    const mutation = amendmentRepo(amendmentControl(amEnvelope(), { schema_migration_authorized: true, impact_domains: ["governance", "schema"] }));
    commitMaster(mutation, AM_HEAD);
    expectRefused(amendGate(mutation), "master-amendment mode requires control.schema_migration_authorized=false");
  });

  test("master amendment requires the same live authority-root proof as control-root maintenance", () => {
    const cwd = amendmentRepo(amendmentControl(amEnvelope()));
    commitMaster(cwd, AM_HEAD);
    expectRefused(gate(cwd), "Master amendment is blocked until live GitHub rules prove authority-root");
    expectRefused(gate(cwd, { MALLAN_AUTHORITY_ROOT_REQUIRED: "false" }), "Master amendment is blocked until live GitHub rules prove authority-root");
  });

  test("master amendment exits only through a state-only PR back to control-update", () => {
    const exit = amendmentRepo(amendmentControl(amEnvelope()));
    write(exit, STATE, controlMarkdown(exitContract()));
    git(exit, "add", STATE);
    git(exit, "commit", "-m", "exit master amendment");
    const result = gate(exit);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Master amendment exited through a state-only control update");

    const toImplementation = amendmentRepo(amendmentControl(amEnvelope()));
    write(toImplementation, STATE, controlMarkdown(baseControl()));
    git(toImplementation, "add", STATE);
    git(toImplementation, "commit", "-m", "jump to implementation");
    expectRefused(gate(toImplementation), "may exit only to control-update mode; the proposed mode is implementation");
  });

  test("master amendment: a deleted Master is refused", () => {
    const cwd = amendmentRepo(amendmentControl(amEnvelope()));
    git(cwd, "rm", "-q", MASTER);
    git(cwd, "commit", "-m", "delete master");
    expectRefused(amendGate(cwd), "Master amendment must modify " + MASTER + " in place");
  });

  test("an unauthorized Master edit still fails in implementation, control-update and control-root-maintenance", () => {
    const implementation = initRepo();
    commitMaster(implementation, "# MASTER\nchanged\n");
    expectRefused(amendGate(implementation), "Implementation PR may not modify authority file " + MASTER);

    const update = initRepo(baseControl({ mode: "control-update", authorized_paths: [STATE], allowed_new_files: [], impact_domains: ["governance"] }));
    commitMaster(update, "# MASTER\nchanged\n");
    expectRefused(amendGate(update), "Execution contract is in control-update mode. Only");

    const root = initRepo(baseControl({ mode: "control-root-maintenance", authorized_paths: [".github/workflows/pr-check.yml"], allowed_new_files: [], impact_domains: ["governance"] }));
    commitMaster(root, "# MASTER\nchanged\n");
    expectRefused(amendGate(root), "Control-root maintenance contains paths outside the protected control root");

    const implementationNamesMaster = initRepo(baseControl({ authorized_paths: [MASTER, "lib/allowed.ts"] }));
    commitMaster(implementationNamesMaster, "# MASTER\nchanged\n");
    expectRefused(amendGate(implementationNamesMaster), MASTER + " may be authorized only by a master-amendment contract");

    const rootNamesMaster = initRepo(baseControl({ mode: "control-root-maintenance", authorized_paths: [MASTER], allowed_new_files: [], impact_domains: ["governance"] }));
    commitMaster(rootNamesMaster, "# MASTER\nchanged\n");
    expectRefused(amendGate(rootNamesMaster), "control-root-maintenance may authorize only protected control paths");

    const envelopeOutsideMode = initRepo(baseControl({ master_amendment: amEnvelope() }));
    commitMaster(envelopeOutsideMode, "# MASTER\nchanged\n");
    expectRefused(amendGate(envelopeOutsideMode), "control.master_amendment is valid only in master-amendment mode");
  });

  // Codex P1 on #643: a heading-like line inside a raw HTML block or another Markdown block
  // container is never a governing Master heading. It may not be the start anchor, the closing
  // anchor or a boundary, and ambiguous or unclosed containers fail closed.
  const withNewRule = (base: string) => base.replace("Old discovery rule.", "New discovery rule.");
  function containerRepo(base: string, overrides: Record<string, unknown> = {}, end: string | null = AM_END) {
    const head = withNewRule(base);
    const envelope = amEnvelope(base, head, {
      section_before_sha256: sha256Hex(sectionOf(base, AM_START, end)),
      section_after_sha256: sha256Hex(sectionOf(head, AM_START, end)),
      ...overrides,
    });
    const cwd = amendmentRepo(amendmentControl(envelope), base);
    commitMaster(cwd, head);
    return cwd;
  }

  test("raw HTML: an ATX heading-looking line inside <div>...</div> cannot be the closing anchor", () => {
    const base = AM_BASE.replace("Detail text.", "Detail text.\n\n<div>\n## Decoy\n</div>");
    const cwd = containerRepo(base, { section_end_heading: "## Decoy" }, "## Decoy");
    expectRefused(amendGate(cwd), "heading-like text that is not an actual Master heading");
  });

  test("raw HTML: other raw HTML block forms cannot supply a closing anchor either", () => {
    const forms = [
      "<!--\n## Decoy\n-->",
      "<pre>\n## Decoy\n\n</pre>",
      "<script>\n## Decoy\n</script>",
      "<table>\n## Decoy\n</table>",
    ];
    for (const form of forms) {
      const base = AM_BASE.replace("Detail text.", "Detail text.\n\n" + form);
      const cwd = containerRepo(base, { section_end_heading: "## Decoy" }, "## Decoy");
      expectRefused(amendGate(cwd), "heading-like text that is not an actual Master heading");
    }
  });

  test("raw HTML: a pseudo start heading inside raw HTML is not the section start", () => {
    const base = AM_BASE.replace(AM_START + "\n", "<div>\n" + AM_START + "\n</div>\n");
    const cwd = containerRepo(base);
    expectRefused(amendGate(cwd), "the start heading line is not an actual Master heading");
  });

  test("raw HTML: a pseudo closing heading inside raw HTML is not the closing heading", () => {
    const base = AM_BASE.replace(AM_END + "\n", "<details>\n" + AM_END + "\n</details>\n");
    const cwd = containerRepo(base);
    expectRefused(amendGate(cwd), "heading-like text that is not an actual Master heading");
  });

  test("raw HTML: a decoy between the real start and the real closing heading fails", () => {
    const base = AM_BASE.replace("Detail text.", "Detail text.\n\n<div>\n## Decoy between\n</div>");
    const cwd = containerRepo(base);
    expectRefused(amendGate(cwd), "heading-like text that is not an actual Master heading");
  });

  test("raw HTML and containers: ambiguous or unclosed forms fail closed", () => {
    const cases: Array<[string, string]> = [
      [AM_BASE.replace("Detail text.", "Detail text.\n\n<!--\ncomment never closed"), "unclosed raw HTML block"],
      [AM_BASE.replace("Detail text.", "Detail text.\n\n<pre>\npre never closed"), "unclosed raw HTML block"],
      [AM_BASE.replace("Detail text.", "- list item\n  ## Decoy owned by the list"), "heading-like text that is not an actual Master heading"],
      [AM_BASE.replace("Detail text.", "Decoy setext title\n---"), "heading-like text that is not an actual Master heading"],
    ];
    for (const [base, message] of cases) {
      expectRefused(amendGate(containerRepo(base)), message);
    }
    const indentedAnchor = containerRepo(AM_BASE, { section_start_heading: " " + AM_START });
    expectRefused(amendGate(indentedAnchor), "must be a Markdown heading line starting in column 0");
  });

  test("raw HTML: real headings outside containers still resolve and the amendment passes", () => {
    const base = AM_BASE
      .replace("Detail text.", "Detail text.\n\n<div>\nplain html, no heading\n</div>\n\n<!-- a one-line comment -->\n\n---\n\nMore detail.")
      .replace("Tail text.", "Tail text.\n\n<div>\n## Not governing, after the section\n</div>");
    const result = amendGate(containerRepo(base));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Master amendment is base-authorized, Master-only and content-pinned");
  });

  // Codex P1 on #643 (second finding, head 959af808): headings owned by Markdown containers - block
  // quotes, list items, nested containers and indented code - are heading-like decoys. They are never
  // governing headings, and one between the real start and the real closing heading fails closed.
  test("containers: block-quote, list-item, nested and indented-code headings are boundary decoys", () => {
    const decoys = [
      "> ## Decoy in a block quote",
      ">## Decoy in a tight block quote",
      "- ## Decoy in a bullet item",
      "* ## Decoy in a star item",
      "+ ## Decoy in a plus item",
      "1. ## Decoy in an ordered item",
      "2) ## Decoy in a paren item",
      "> - ## Decoy in a nested container",
      "    ## Decoy in indented code",
      "\t## Decoy after a tab",
    ];
    for (const decoy of decoys) {
      const base = AM_BASE.replace("Detail text.", "Detail text.\n\n" + decoy);
      expectRefused(amendGate(containerRepo(base)), "heading-like text that is not an actual Master heading");
    }
  });

  test("containers: container content without heading-like lines, and container headings after the section, still pass", () => {
    const base = AM_BASE
      .replace("Detail text.", "Detail text.\n\n> a quoted line\n\n- a list item\n- another item\n\n1. an ordered item\n\n    indented code line")
      .replace("Tail text.", "Tail text.\n\n> ## Container heading after the section");
    const result = amendGate(containerRepo(base));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Master amendment is base-authorized, Master-only and content-pinned");
  });

  // Codex P1 on #643 (third finding, head 6251d644): lookalike detection is context-free. Setext
  // headings owned by containers and raw HTML heading elements are heading-like decoys too.
  test("containers: container-owned setext headings and raw HTML heading elements are boundary decoys", () => {
    const decoys = [
      "> Decoy in quote\n> ---",
      "> Decoy in quote\n> ===",
      "- Decoy in a list item\n  ---",
      "1. Decoy in an ordered item\n   ---",
      "> - Decoy in a nested container\n>   ---",
      "Decoy setext title\n===",
      "<h2>Decoy heading element</h2>",
      "<div><h1 class=\"x\">Decoy heading element</h1></div>",
    ];
    for (const decoy of decoys) {
      const base = AM_BASE.replace("Detail text.", "Detail text.\n\n" + decoy);
      expectRefused(amendGate(containerRepo(base)), "heading-like text that is not an actual Master heading");
    }
  });

  test("containers: thematic breaks, table rules and headings after the section do not block a valid amendment", () => {
    const base = AM_BASE
      .replace("Detail text.", "Detail text.\n\n---\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n***\n\n> quoted\n>\n> ---")
      .replace("Tail text.", "Tail text.\n\n> After the section\n> ---\n\n<h2>After the section</h2>");
    const result = amendGate(containerRepo(base));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Master amendment is base-authorized, Master-only and content-pinned");
  });
});
