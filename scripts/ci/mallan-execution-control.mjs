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
  ".github/workflows/pr-check.yml"
]);

const BOOTSTRAP_ALLOWED = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  "MALLAN-PLATFORM-MASTER-PLAN.md",
  "NEON.md",
  "docs/architecture/NEON-COST-CONTROL-POLICY.md",
  "docs/architecture/NEON-VERCEL-OWNERSHIP-MAP.md",
  "docs/audits/zero-billing-neon-vercel-2026-06-12.md",
  "docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md",
  "docs/operations/site-audit-handoff-2026-09-18.md",
  "docs/superpowers/plans/2026-06-12-return-neon-to-free-tier-P2-MONEY.md",
  "docs/support/vercel-neon-false-branch-limit-status-2026-06-03.md",
  "scripts/ci/mallan-execution-control.mjs",
  "tests/runtime/agent-authority-live-source.test.ts",
  "tests/runtime/mallan-execution-control.test.ts",
  ".github/workflows/pr-check.yml",
  ".github/workflows/branch-authority.yml",
  ".github/workflows/authority-root.yml"
]);

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
    return { status: parts[0], path: parts[parts.length - 1] };
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
  for (const key of ["mode", "authorized_branch", "base_branch", "packet_id", "objective"]) {
    if (typeof control[key] !== "string" || !control[key].trim()) {
      throw new Error("control." + key + " must be a non-empty string");
    }
  }

  for (const key of ["authorized_paths", "allowed_new_files", "impact_domains", "provider_proof_required"]) {
    if (!Array.isArray(control[key])) {
      throw new Error("control." + key + " must be an array");
    }
  }

  if (!control.impact_graph || typeof control.impact_graph !== "object") {
    throw new Error("control.impact_graph must be an object");
  }

  const graphKeys = [
    "root_owner_paths",
    "writer_paths",
    "reader_paths",
    "publisher_paths",
    "downstream_surfaces",
    "test_paths",
    "compliance_surfaces"
  ];

  for (const key of graphKeys) {
    if (!Array.isArray(control.impact_graph[key]) || control.impact_graph[key].length === 0) {
      throw new Error("control.impact_graph." + key + " must be a non-empty array");
    }
  }

  if (control.mode === "implementation") {
    if (control.authorized_paths.length === 0) {
      throw new Error("implementation mode requires authorized_paths");
    }
    if (control.impact_domains.length === 0) {
      throw new Error("implementation mode requires impact_domains");
    }
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

  const controlRootChanges = changedPaths.filter((filePath) =>
    IMMUTABLE_CONTROL_PATHS.has(filePath)
  );
  if (controlRootChanges.length) {
    fail(
      "PR attempts to modify the immutable execution-control root:\n" +
      controlRootChanges.map((filePath) => "  - " + filePath).join("\n") +
      "\nControl-root maintenance requires an explicit out-of-band governance procedure."
    );
  }

  if (baseBranch !== control.base_branch) {
    fail(
      "PR base is " + baseBranch +
      "; execution contract requires " + control.base_branch + "."
    );
  }

  if (headBranch !== control.authorized_branch) {
    fail(
      "PR head is " + headBranch +
      "; only authorized branch " + control.authorized_branch + " may execute."
    );
  }

  if (control.mode === "control-update") {
    const onlyState =
      changedPaths.length > 0 &&
      changedPaths.every((filePath) => filePath === STATE_PATH);
    if (!onlyState) {
      fail(
        "Execution contract is in control-update mode. Only " +
        STATE_PATH + " may change.\n" +
        changedPaths.map((filePath) => "  - " + filePath).join("\n")
      );
    }
    pass("Control-update PR is limited to the canonical Execution State.");
    return;
  }

  if (control.mode !== "implementation") {
    fail("Unsupported execution mode: " + control.mode);
  }

  try {
    validateImpactPaths(control, baseRef);
  } catch (error) {
    fail("Impact graph is not grounded in the PR base: " + error.message);
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
