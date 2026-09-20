import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const GATE = path.resolve(__dirname, "../../scripts/ci/mallan-execution-control.mjs");
const STATE = "docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md";
const MASTER = "MALLAN-PLATFORM-MASTER-PLAN.md";

function run(cmd: string, args: string[], cwd: string, env: Record<string, string> = {}) {
  return spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
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
  write(cwd, "lib/feature/publisher.ts", "export const publisher = true;\n");
  write(cwd, "prisma/schema.prisma", "generator client { provider = \"prisma-client-js\" }\n");
  write(cwd, "tests/runtime/mallan-execution-control.test.ts", "fixture\n");
  write(cwd, ".github/workflows/pr-check.yml", "name: fixture\n");
  git(
    cwd,
    "add",
    MASTER,
    STATE,
    "lib/feature/reader.ts",
    "lib/feature/publisher.ts",
    "prisma/schema.prisma",
    "tests/runtime/mallan-execution-control.test.ts",
    ".github/workflows/pr-check.yml"
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

  test("glob authorization preserves the directory boundary", () => {
    const cwd = initRepo(baseControl({
      authorized_paths: ["lib/feature/**"],
      allowed_new_files: [],
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

});
