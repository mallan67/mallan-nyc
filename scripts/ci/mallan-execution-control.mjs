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

const STATE_PATH = "docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md";
const MASTER_PATH = "MALLAN-PLATFORM-MASTER-PLAN.md";
const CONTROL_START = "<!-- MALLAN_EXECUTION_CONTROL_V1_START -->";
const CONTROL_END = "<!-- MALLAN_EXECUTION_CONTROL_V1_END -->";
const BOOTSTRAP_PR = "632";

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
  ".github/workflows/pr-check.yml"
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
  for (const key of ["mode", "authorized_branch", "base_branch"]) {
    if (typeof control[key] !== "string" || !control[key].trim()) {
      throw new Error("control." + key + " must be a non-empty string");
    }
  }
  for (const key of ["authorized_paths", "allowed_new_files", "impact_domains", "provider_proof_required"]) {
    if (!Array.isArray(control[key])) {
      throw new Error("control." + key + " must be an array");
    }
  }
}

function main() {
  const baseBranch = process.env.GITHUB_BASE_REF || process.env.MALLAN_BASE_BRANCH || "main";
  const headBranch =
    process.env.GITHUB_HEAD_REF ||
    process.env.MALLAN_HEAD_BRANCH ||
    git(["branch", "--show-current"]);
  const prNumber = process.env.GITHUB_PR_NUMBER || process.env.MALLAN_PR_NUMBER || "";
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

main();
