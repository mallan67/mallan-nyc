#!/usr/bin/env node
/**
 * Mallan Execution Control Gate
 *
 * Authorization is read from the PR BASE branch, never from HEAD.
 * A PR therefore cannot widen its own execution envelope.
 *
 * PR #632 is the one-time bootstrap exception because main did not yet
 * contain the Master/Execution State when this control plane was introduced.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";

const STATE_PATH = "docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md";
const MASTER_PATH = "MALLAN-PLATFORM-MASTER-PLAN.md";
const CONTROL_START = "<!-- MALLAN_EXECUTION_CONTROL_V1_START -->";
const CONTROL_END = "<!-- MALLAN_EXECUTION_CONTROL_V1_END -->";
const BOOTSTRAP_PR = "632";

const IMMUTABLE_CONTROL_PATHS = new Set([
  "scripts/ci/mallan-execution-control.mjs",
  ".github/workflows/authority-root.yml",
  ".github/workflows/branch-authority.yml",
  ".github/workflows/pr-check.yml",
  ".github/workflows/release-truth.yml",
  "scripts/validate-release-status.js",
  "tests/runtime/mallan-execution-control.test.ts",
  "tests/runtime/agent-authority-live-source.test.ts",
  "tests/runtime/release-safety-release-truth.test.ts",
  ".github/workflows/cleanup-neon-preview-branch.yml",
  ".github/workflows/rotate-db-keys.yml",
  "app/api/cron/neon-branch-prune/route.ts",
  "scripts/neon-prune-branches.ts",
  "tests/runtime/neon-branch-prune-route.test.ts",
  "tests/runtime/neon-prune-cli.test.ts"
]);

const BOOTSTRAP_ALLOWED = new Set([
  "AGENTS.md", "CLAUDE.md", "MALLAN-PLATFORM-MASTER-PLAN.md", "NEON.md",
  ".mcp.json", "mcp/trestle-fields/index.ts",
  "docs/architecture/NEON-COST-CONTROL-POLICY.md",
  "docs/architecture/NEON-VERCEL-OWNERSHIP-MAP.md",
  "docs/audits/zero-billing-neon-vercel-2026-06-12.md",
  "docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md",
  "docs/superpowers/plans/2026-06-12-return-neon-to-free-tier-P2-MONEY.md",
  "docs/support/vercel-neon-false-branch-limit-status-2026-06-03.md",
  "scripts/ci/mallan-execution-control.mjs", "scripts/validate-release-status.js",
  "tests/runtime/agent-authority-live-source.test.ts",
  "tests/runtime/mallan-execution-control.test.ts",
  "tests/runtime/release-safety-release-truth.test.ts",
  "tests/runtime/neon-branch-prune-route.test.ts", "tests/runtime/neon-prune-cli.test.ts",
  ".github/workflows/pr-check.yml", ".github/workflows/branch-authority.yml",
  ".github/workflows/authority-root.yml", ".github/workflows/release-truth.yml",
  ".github/workflows/cleanup-neon-preview-branch.yml", ".github/workflows/rotate-db-keys.yml",
  "app/api/cron/neon-branch-prune/route.ts", "scripts/neon-prune-branches.ts", "vercel.json"
]);

const MUTATION_FLAGS = [
  "production_mutation_authorized", "schema_migration_authorized",
  "environment_mutation_authorized", "neon_mutation_authorized",
  "destructive_data_authorized", "manual_cron_authorized",
  "new_canonical_system_authorized"
];

const REQUIREMENT_KEYS = [
  "impact_graph_required", "all_readers_writers_required", "negative_tests_required",
  "integration_proof_required", "downstream_proof_required",
  "compliance_proof_required_when_applicable", "no_parallel_path_proof_required"
];

const FLAG_DOMAINS = {
  production_mutation_authorized: "production-mutation",
  schema_migration_authorized: "schema",
  environment_mutation_authorized: "environment",
  neon_mutation_authorized: "neon-control-plane",
  destructive_data_authorized: "destructive-data",
  manual_cron_authorized: "manual-cron"
};

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function fail(message) {
  process.stderr.write("\n[MALLAN EXECUTION CONTROL] FAIL\n");
  process.stderr.write(message + "\n");
  process.exit(1);
}

function pass(message) {
  process.stdout.write("\n[MALLAN EXECUTION CONTROL] PASS\n");
  process.stdout.write(message + "\n");
}

function parseControl(markdown) {
  const start = markdown.indexOf(CONTROL_START);
  const end = markdown.indexOf(CONTROL_END);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("execution-control markers are missing or malformed");
  }
  const body = markdown.slice(start + CONTROL_START.length, end);
  const fence = body.match(/\`\`\`json\s*([\s\S]*?)\s*\`\`\`/);
  if (!fence) throw new Error("execution-control JSON fence is missing");
  const control = JSON.parse(fence[1]);
  if (control.version !== 1) throw new Error("unsupported execution-control version");
  return control;
}

function readBaseFile(baseRef, filePath) {
  try {
    return git(["show", baseRef + ":" + filePath]);
  } catch {
    return null;
  }
}

function changedFiles(baseRef) {
  const out = git(["diff", "--name-status", baseRef + "...HEAD"]);
  if (!out) return [];
  return out.split("\n").filter(Boolean).map((line) => {
    const parts = line.split("\t");
    const status = parts[0];

    if (status.startsWith("R") || status.startsWith("C")) {
      return {
        status,
        sourcePath: parts[1],
        path: parts[2],
      };
    }

    return { status, sourcePath: null, path: parts[1] };
  });
}

function pathAllowed(filePath, allowed) {
  return allowed.some((entry) => {
    if (entry.endsWith("/**")) return filePath.startsWith(entry.slice(0, -3));
    if (entry.endsWith("/")) return filePath.startsWith(entry);
    return filePath === entry;
  });
}

function validateControl(control) {
  const allowedModes = new Set(["control-update", "implementation", "control-root-maintenance"]);
  if (!allowedModes.has(control.mode)) throw new Error("unsupported execution-control mode: " + control.mode);

  for (const key of ["mode", "authorized_branch", "base_branch", "packet_id", "objective"]) {
    if (typeof control[key] !== "string" || !control[key].trim()) throw new Error("control." + key + " must be a non-empty string");
  }
  for (const key of ["authorized_paths", "allowed_new_files", "impact_domains", "provider_proof_required"]) {
    if (!Array.isArray(control[key])) throw new Error("control." + key + " must be an array");
  }
  for (const proof of control.provider_proof_required) {
    if (typeof proof !== "string" || !proof.trim()) throw new Error("control.provider_proof_required entries must be non-empty strings");
  }
  for (const key of MUTATION_FLAGS) {
    if (typeof control[key] !== "boolean") throw new Error("control." + key + " must be boolean");
  }

  if (!control.requirements || typeof control.requirements !== "object") throw new Error("control.requirements must be an object");
  for (const key of REQUIREMENT_KEYS) {
    if (typeof control.requirements[key] !== "boolean") throw new Error("control.requirements." + key + " must be boolean");
  }
  for (const key of ["impact_graph_required", "all_readers_writers_required", "no_parallel_path_proof_required"]) {
    if (control.requirements[key] !== true) throw new Error("control.requirements." + key + " must remain true");
  }

  if (!control.impact_graph || typeof control.impact_graph !== "object") throw new Error("control.impact_graph must be an object");
  for (const key of ["root_owner_paths","writer_paths","reader_paths","publisher_paths","downstream_surfaces","test_paths","compliance_surfaces"]) {
    if (!Array.isArray(control.impact_graph[key]) || control.impact_graph[key].length === 0) {
      throw new Error("control.impact_graph." + key + " must be a non-empty array");
    }
  }

  if (control.mode === "implementation" || control.mode === "control-root-maintenance") {
    if (control.authorized_paths.length === 0) throw new Error(control.mode + " mode requires authorized_paths");
    if (control.impact_domains.length === 0) throw new Error(control.mode + " mode requires impact_domains");
  }
  if (control.mode === "control-root-maintenance") {
    const invalid = control.authorized_paths.filter((p) => !IMMUTABLE_CONTROL_PATHS.has(p));
    if (invalid.length) throw new Error("control-root-maintenance may authorize only protected control paths:\n" + invalid.map((p)=>"  - "+p).join("\n"));
  }
  for (const [flag, domain] of Object.entries(FLAG_DOMAINS)) {
    if (control[flag] === true && !control.impact_domains.includes(domain)) {
      throw new Error("control." + flag + "=true requires impact_domains to include " + domain);
    }
  }
}

function csvSet(name) {
  return new Set(String(process.env[name] || "").split(",").map((v)=>v.trim()).filter(Boolean));
}

function mutationRequirementsForPath(filePath) {
  const out = new Set();
  if (filePath === "prisma/schema.prisma" || filePath.startsWith("prisma/migrations/") || filePath.startsWith("sql/")) out.add("schema_migration_authorized");
  if (filePath === "vercel.json" || filePath === ".github/workflows/rotate-db-keys.yml") out.add("environment_mutation_authorized");
  if ([
    ".github/workflows/cleanup-neon-preview-branch.yml",
    ".github/workflows/rotate-db-keys.yml",
    "app/api/cron/neon-branch-prune/route.ts",
    "scripts/neon-prune-branches.ts"
  ].includes(filePath) || filePath.startsWith("lib/neon/")) out.add("neon_mutation_authorized");
  if ([
    ".github/workflows/cleanup-neon-preview-branch.yml",
    ".github/workflows/rotate-db-keys.yml",
    "app/api/cron/neon-branch-prune/route.ts",
    "scripts/neon-prune-branches.ts"
  ].includes(filePath)) out.add("destructive_data_authorized");
  if (filePath === ".github/workflows/rotate-db-keys.yml") {
    out.add("production_mutation_authorized");
    out.add("manual_cron_authorized");
  }
  return [...out];
}

function validateExecutionEvidence(control, changes) {
  const providerProofs = csvSet("MALLAN_PROVIDER_PROOFS");
  const missingProvider = control.provider_proof_required.filter((proof)=>!providerProofs.has(proof));
  if (missingProvider.length) throw new Error("required provider proof is absent from the base-controlled workflow:\n" + missingProvider.map((p)=>"  - "+p).join("\n"));

  const failures = [];
  for (const change of changes) {
    for (const requiredFlag of mutationRequirementsForPath(change.path)) {
      if (control[requiredFlag] !== true) failures.push(change.path + " requires " + requiredFlag + "=true");
    }
  }
  if (failures.length) throw new Error("sensitive change class is not authorized by the base Execution State:\n" + failures.map((v)=>"  - "+v).join("\n"));

  if (control.requirements.negative_tests_required) {
    const changedPaths = new Set(changes.map((c)=>c.path));
    const changedTest = control.impact_graph.test_paths.some((p)=>changedPaths.has(p));
    if (!changedTest) throw new Error("negative_tests_required=true but none of impact_graph.test_paths changed");
  }

  if ((process.env.MALLAN_CONTROL_PHASE || "preflight") === "final") {
    const proofs = csvSet("MALLAN_EXECUTION_PROOFS");
    const needed = [];
    if (control.requirements.negative_tests_required) needed.push("negative-tests");
    if (control.requirements.integration_proof_required) needed.push("integration");
    if (control.requirements.downstream_proof_required) needed.push("downstream");
    if (control.requirements.compliance_proof_required_when_applicable) needed.push("compliance");
    if (control.requirements.no_parallel_path_proof_required) needed.push("no-parallel-path");
    const missing = needed.filter((p)=>!proofs.has(p));
    if (missing.length) throw new Error("final execution proof is incomplete:\n" + missing.map((p)=>"  - "+p).join("\n"));
  }
}
function checkCreatedBranch() {
  const createdBranch = process.argv[3] || process.env.CREATED_BRANCH || "";
  if (!createdBranch) fail("Created branch name was not provided.");

  let state;
  try {
    state = fs.readFileSync(STATE_PATH, "utf8");
  } catch {
    fail("Canonical Execution State is missing on the checked-out main branch.");
  }

  let control;
  try {
    control = parseControl(state);
    validateControl(control);
  } catch (error) {
    fail("Canonical Execution State is invalid: " + error.message);
  }

  if (createdBranch === "main" || createdBranch === control.authorized_branch) {
    pass("Created branch is authorized: " + createdBranch);
    return;
  }

  fail(
    "Unauthorized branch creation: " + createdBranch +
    ". The only active work branch is " + control.authorized_branch + "."
  );
}

function basePathExists(baseRef, filePath) {
  try {
    git(["cat-file", "-e", baseRef + ":" + filePath]);
    return true;
  } catch {
    return false;
  }
}

function validateImpactPaths(control, baseRef) {
  const pathKeys = [
    "root_owner_paths",
    "writer_paths",
    "reader_paths",
    "publisher_paths",
    "test_paths"
  ];

  const missing = [];
  for (const key of pathKeys) {
    for (const filePath of control.impact_graph[key]) {
      if (basePathExists(baseRef, filePath)) continue;
      if (control.allowed_new_files.includes(filePath)) continue;
      missing.push(key + ": " + filePath);
    }
  }

  if (missing.length) {
    throw new Error(
      "impact graph names repo paths that do not exist on the PR base and are not authorized new files:\n" +
      missing.map((item) => "  - " + item).join("\n")
    );
  }
}

function main() {
  const baseBranch = process.env.MALLAN_BASE_BRANCH || process.env.GITHUB_BASE_REF || "main";
  const headBranch =
    process.env.MALLAN_HEAD_BRANCH ||
    process.env.GITHUB_HEAD_REF ||
    git(["branch", "--show-current"]);
  const prNumber = process.env.MALLAN_PR_NUMBER || process.env.GITHUB_PR_NUMBER || "";
  const baseRef = process.env.MALLAN_BASE_REF || "origin/" + baseBranch;

  const changes = changedFiles(baseRef);

  const renameOrCopyChanges = changes.filter(
    (item) => item.status.startsWith("R") || item.status.startsWith("C")
  );
  if (renameOrCopyChanges.length) {
    fail(
      "Renames/copies are not permitted by the Mallan execution gate because both source and destination authority must be reviewed explicitly.\n" +
      renameOrCopyChanges
        .map((item) => "  - " + item.status + ": " + item.sourcePath + " -> " + item.path)
        .join("\n")
    );
  }

  const changedPaths = changes.map((item) => item.path);

  const baseMaster = readBaseFile(baseRef, MASTER_PATH);
  const baseState = readBaseFile(baseRef, STATE_PATH);

  if (!baseMaster || !baseState) {
    if (prNumber !== BOOTSTRAP_PR) {
      fail(
        "Base " + baseBranch +
        " is missing the canonical Master and/or Execution State. " +
        "Only bootstrap PR #" + BOOTSTRAP_PR + " may establish them."
      );
    }

    const unexpected = changedPaths.filter((filePath) => !BOOTSTRAP_ALLOWED.has(filePath));
    if (unexpected.length) {
      fail(
        "Bootstrap PR #" + BOOTSTRAP_PR +
        " contains paths outside its fixed governance allowlist:\n" +
        unexpected.map((filePath) => "  - " + filePath).join("\n")
      );
    }

    if (!changedPaths.includes(MASTER_PATH) || !changedPaths.includes(STATE_PATH)) {
      fail(
        "Bootstrap PR #" + BOOTSTRAP_PR +
        " must add both " + MASTER_PATH + " and " + STATE_PATH + "."
      );
    }

    const headState = git(["show", "HEAD:" + STATE_PATH]);
    const control = parseControl(headState);
    validateControl(control);

    pass(
      "Bootstrap PR #" + BOOTSTRAP_PR +
      " is limited to the fixed governance/control-plane allowlist."
    );
    return;
  }

  let control;
  try {
    control = parseControl(baseState);
    validateControl(control);
  } catch (error) {
    fail("Base execution contract is invalid: " + error.message);
  }

  if (baseBranch !== control.base_branch) {
    fail("PR base is " + baseBranch + "; execution contract requires " + control.base_branch + ".");
  }
  if (headBranch !== control.authorized_branch) {
    fail("PR head is " + headBranch + "; only authorized branch " + control.authorized_branch + " may execute.");
  }

  if (control.mode === "control-update") {
    const onlyState = changedPaths.length > 0 && changedPaths.every((filePath)=>filePath===STATE_PATH);
    if (!onlyState) fail("Execution contract is in control-update mode. Only " + STATE_PATH + " may change.\n" + changedPaths.map((p)=>"  - "+p).join("\n"));
    let proposedControl;
    try {
      proposedControl = parseControl(git(["show","HEAD:"+STATE_PATH]));
      validateControl(proposedControl);
      validateImpactPaths(proposedControl, baseRef);
    } catch (error) {
      fail("Proposed execution contract is invalid: " + error.message);
    }
    if (proposedControl.base_branch !== baseBranch) fail("Proposed execution contract targets base " + proposedControl.base_branch + "; control updates must remain anchored to " + baseBranch + ".");
    pass("Control-update PR is limited to a valid canonical Execution State.");
    return;
  }

  if (control.mode === "control-root-maintenance") {
    const onlyState = changedPaths.length > 0 && changedPaths.every((filePath)=>filePath===STATE_PATH);
    if (onlyState) {
      try {
        const proposed = parseControl(git(["show","HEAD:"+STATE_PATH]));
        validateControl(proposed);
        validateImpactPaths(proposed, baseRef);
        if (proposed.mode !== "control-update") throw new Error("root maintenance may exit only to control-update mode");
      } catch (error) {
        fail("Control-root maintenance exit contract is invalid: " + error.message);
      }
      pass("Control-root maintenance exited through a state-only control update.");
      return;
    }
    if (process.env.MALLAN_AUTHORITY_ROOT_REQUIRED !== "true") fail("Control-root maintenance is blocked until live GitHub rules prove authority-root is a required main-branch status check.");
    const outsideRoot = changedPaths.filter((p)=>!IMMUTABLE_CONTROL_PATHS.has(p));
    if (outsideRoot.length) fail("Control-root maintenance contains paths outside the protected control root:\n" + outsideRoot.map((p)=>"  - "+p).join("\n"));
    const outsideEnvelope = changedPaths.filter((p)=>!pathAllowed(p,control.authorized_paths));
    if (outsideEnvelope.length) fail("Control-root maintenance changed paths outside its base-state envelope:\n" + outsideEnvelope.map((p)=>"  - "+p).join("\n"));
    try {
      validateImpactPaths(control, baseRef);
      validateExecutionEvidence(control, changes);
    } catch (error) {
      fail("Control-root maintenance proof failed: " + error.message);
    }
    const added = changes.filter((i)=>i.status.startsWith("A")).map((i)=>i.path);
    const unapproved = added.filter((p)=>!control.allowed_new_files.includes(p));
    if (unapproved.length) fail("Control-root maintenance created unapproved files:\n" + unapproved.map((p)=>"  - "+p).join("\n"));
    pass("Control-root maintenance is base-authorized and authority-root is required.");
    return;
  }

  if (control.mode !== "implementation") fail("Unsupported execution mode: " + control.mode);

  const controlRootChanges = changedPaths.filter((p)=>IMMUTABLE_CONTROL_PATHS.has(p));
  if (controlRootChanges.length) {
    fail("Implementation PR attempts to modify the protected execution/proof root:\n" + controlRootChanges.map((p)=>"  - "+p).join("\n") + "\nUse a prior state-only control update to authorize control-root-maintenance.");
  }
  try {
    validateImpactPaths(control, baseRef);
    validateExecutionEvidence(control, changes);
  } catch (error) {
    fail("Implementation proof is not grounded in the base authority: " + error.message);
  }

  for (const protectedPath of [STATE_PATH, MASTER_PATH]) {
    if (changedPaths.includes(protectedPath)) {
      fail("Implementation PR may not modify authority file " + protectedPath + ".");
    }
  }

  const outOfScope = changedPaths.filter(
    (filePath) => !pathAllowed(filePath, control.authorized_paths)
  );
  if (outOfScope.length) {
    fail(
      "Changed paths outside the base-state authorization envelope:\n" +
      outOfScope.map((filePath) => "  - " + filePath).join("\n")
    );
  }

  const added = changes
    .filter((item) => item.status.startsWith("A"))
    .map((item) => item.path);

  const unapprovedNew = added.filter(
    (filePath) => !control.allowed_new_files.includes(filePath)
  );
  if (unapprovedNew.length) {
    fail(
      "New files were created without explicit base-state authorization:\n" +
      unapprovedNew.map((filePath) => "  - " + filePath).join("\n")
    );
  }

  if (control.new_canonical_system_authorized !== true) {
    const suspicious = added.filter((filePath) =>
      /(?:^|\/)(?:canonical|registry|engine|service|store|model|mapper|authority|system)(?:[-_.\/]|$)/i.test(filePath)
    );
    if (suspicious.length) {
      fail(
        "New system-shaped files were added while new_canonical_system_authorized=false:\n" +
        suspicious.map((filePath) => "  - " + filePath).join("\n")
      );
    }
  }

  pass(
    "Implementation is inside the base-state envelope: branch=" +
    headBranch + ", changed=" + changedPaths.length + ", new=" + added.length + "."
  );
}

if (process.argv[2] === "--branch-created") {
  checkCreatedBranch();
} else {
  main();
}
