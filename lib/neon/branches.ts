/**
 * Neon branches API client + prune logic.
 *
 * Why this exists: the Neon-Vercel marketplace integration creates a
 * fresh DB branch on every preview deploy so PR previews can write
 * without polluting production. Convenient — but those preview branches
 * accumulate operational debt + cost when left unpruned, even though
 * the Launch plan's 5000-branch cap is far above any realistic
 * accumulation rate.
 *
 * This module is the hygiene + cost-control discipline: it deletes
 * preview branches idle past a 24-hour retention window, keeping the
 * branch count near its steady-state baseline (~8 at time of writing).
 * It is also a defense-in-depth complement to Vercel's own auto-cleanup
 * (which runs on Vercel deployment retention — 180 days by default —
 * and is too slow for our day-to-day hygiene).
 *
 * ═══════════════════════════════════════════════════════════════════════
 * PRODUCTION SAFETY — read this before editing `isPrunable`.
 * ═══════════════════════════════════════════════════════════════════════
 * PREVIEW BRANCHES AND PRODUCTION LIVE IN THE SAME NEON PROJECT.
 * `hidden-mountain-87248164` ("neon-green-school") is the canonical
 * PRODUCTION project AND the project the Vercel-Neon integration creates
 * preview branches in. Live control-plane facts (re-verified 2026-08-20,
 * read-only):
 *
 *   br-crimson-frog-adr7g9gt  name "main"
 *     primary=true, default=true, protected=FALSE, ~627 MB logical,
 *     compute ep-cold-waterfall-adno3ao2 — THIS IS PRODUCTION.
 *   br-spring-mouse-adfywa55  name "preview/fix/neon-p0-event-driven-wake-2026-08-16"
 *     primary=false, default=false, parent br-crimson-frog-adr7g9gt.
 *
 * The cron that calls this module (`app/api/cron/neon-branch-prune`,
 * vercel.json `0 4 * * *`) is correctly restricted to the canonical
 * project — which means it runs DAILY, WITH DELETE RIGHTS, ACROSS EVERY
 * BRANCH OF THE PROJECT THAT HOLDS PRODUCTION.
 *
 * Until 2026-08-20 the only thing standing between that cron and
 * production `main` was the single provider-supplied boolean
 * `branch.primary`. That is not a safety property:
 *   - `NeonBranch.primary` is a COMPILE-TIME-ONLY boolean. A response
 *     that omits the field (API change, partial projection, a hand-built
 *     object in a script) is falsy at runtime → production became prunable.
 *   - `protected` excludes nothing here: production main is protected=FALSE.
 *   - Nothing refused by production branch id.
 *   - Nothing refused by the name `main`.
 *   - Nothing required the `preview/` prefix, so any non-preview branch
 *     in the project was deletable.
 * Executed proof of the pre-fix behaviour is in the PR body; the guard
 * tests below re-prove each refusal and are mutation-tested.
 *
 * The rule now: production is refused DELIBERATELY, by FIVE independent
 * predicates, and identity gaps FAIL CLOSED. An absent flag never means
 * "safe to delete".
 *
 * Sibling implementation of the same model (kept intentionally in sync):
 *   .github/workflows/cleanup-neon-preview-branch.yml (PR-close cleanup)
 *   lib/ops/canonical-neon-target.ts                  (project/host identity)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Historical context (2026-04-28 → 2026-05-17): this module was
 * originally built to keep mallan-nyc under the Neon free-tier 10-branch
 * cap. After the plan was upgraded to Launch, the cap dimension
 * disappeared, but the hygiene + cost-control motivation remained.
 * See docs/support/vercel-neon-false-branch-limit-status-2026-06-03.md (canonical Neon/Vercel status).
 *
 * This module provides the shared pruning logic used by:
 *   - scripts/neon-prune-branches.ts (one-shot CLI; dry-run by default)
 *   - app/api/cron/neon-branch-prune/route.ts (Vercel Cron, daily)
 *
 * Pruning rules (ALL must hold for a branch to be deleted):
 *   1. Branch identity is fully verifiable: `id`, `name`, `primary`,
 *      `protected` and a parseable `updated_at` are all present and of
 *      the right type. Missing / wrong-typed → REFUSED (fail-closed).
 *   2. NOT the project's primary branch (`primary === true`).
 *   3. NOT `protected` (operator-flagged "do not auto-delete").
 *   4. NOT the project's default branch (`default === true`, when present).
 *   5. NOT a known production branch id (`PRODUCTION_NEON_BRANCH_IDS`).
 *   6. NOT a protected branch name (`PROTECTED_NEON_BRANCH_NAMES`).
 *   7. Name STARTS WITH `preview/` and has at least one character after
 *      it — only integration-created preview branches are deletable.
 *   8. Retention window is a positive finite number of hours, and the
 *      last-update timestamp is older than it (default 24h).
 *
 * A branch's last-update timestamp is `updated_at`, not `created_at`.
 * Neon refreshes `updated_at` whenever the branch is queried, so an
 * idle branch hits the retention window only when no one has used it
 * for a full day. Active reviewers get the full window after their
 * last interaction.
 *
 * @module lib/neon/branches
 */

const NEON_API_BASE = "https://console.neon.tech/api/v2";
const DEFAULT_RETENTION_HOURS = 24;

/**
 * Branch ids that are NEVER deletable by any code path in this module.
 *
 * `br-crimson-frog-adr7g9gt` is production `main` on the canonical project
 * `hidden-mountain-87248164` (CLAUDE.md AGENT STOP box · NEON.md §canonical ·
 * lib/ops/canonical-neon-target.ts · verified live read-only 2026-08-20).
 *
 * This list is a REFUSAL list, not an allow-list: adding an id here can only
 * ever protect more, never delete more.
 */
export const PRODUCTION_NEON_BRANCH_IDS: readonly string[] = [
  "br-crimson-frog-adr7g9gt",
];

/**
 * Branch names that are NEVER deletable, regardless of flags.
 *
 * Matches the name set enforced by
 * `.github/workflows/cleanup-neon-preview-branch.yml` (plus `prod`/`default`),
 * so the cron and the PR-close workflow refuse the same names.
 * Compared case-insensitively after trimming.
 */
export const PROTECTED_NEON_BRANCH_NAMES: readonly string[] = [
  "main",
  "master",
  "production",
  "prod",
  "default",
  "preview/main",
  "preview/master",
  "preview/production",
];

/**
 * The ONLY name prefix this module will ever delete. The Vercel-Neon
 * integration names every PR branch `preview/<head_ref>` (live example:
 * `preview/fix/neon-p0-event-driven-wake-2026-08-16`). Anything without this
 * prefix — production `main`, an operator's hand-made branch, a `vercel-dev`
 * scratch branch — is refused. Compared case-insensitively after trimming.
 */
export const DELETABLE_BRANCH_NAME_PREFIX = "preview/";

export interface NeonBranch {
  id: string;
  name: string;
  primary: boolean;
  protected: boolean;
  /** Neon's default-branch flag. Optional in this type; refused when `true`. */
  default?: boolean;
  created_at: string;
  updated_at: string;
}

/** Why a branch was (not) selected for deletion. `prunable` means deletable. */
export type PruneDecisionCode =
  | "prunable"
  | "identity_unverifiable"
  | "invalid_retention"
  | "primary"
  | "operator_protected"
  | "default_branch"
  | "production_branch_id"
  | "protected_branch_name"
  | "not_preview_prefixed"
  | "within_retention";

export interface PruneDecision {
  prunable: boolean;
  reason: string;
  code: PruneDecisionCode;
}

export interface PruneResult {
  examined: number;
  protected_count: number;
  primary_count: number;
  too_recent_count: number;
  /**
   * Branches refused by a production-safety guard (identity unverifiable,
   * production id, protected name, missing `preview/` prefix, default branch,
   * invalid retention). Non-zero is not an error — it is the guard working —
   * but a SUSTAINED non-zero count on branches you expect to be pruned means
   * the naming convention drifted, so it is surfaced in the cron audit event.
   */
  guard_refused_count: number;
  /** Detail for the refusals above, capped so an audit event stays small. */
  guard_refused: { id: string; name: string; code: PruneDecisionCode; reason: string }[];
  pruned: { id: string; name: string; updated_at: string }[];
  errors: { id: string; name: string; message: string }[];
}

const GUARD_REFUSED_DETAIL_CAP = 25;

interface NeonBranchListResponse {
  branches: NeonBranch[];
}

function neonHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

/** Trim + lowercase a value only when it is a genuinely non-empty string. */
function normalized(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.toLowerCase();
}

/**
 * True when this branch id is a known production branch.
 *
 * Exported so the delete path can re-assert it independently of `isPrunable`
 * — see `deleteBranch`. Fail-closed: a non-string / empty id is treated as
 * production (unknown identity is never safe to delete).
 */
export function isProductionBranchId(branchId: unknown): boolean {
  const id = normalized(branchId);
  if (id === null) return true; // unverifiable identity → treat as production
  return PRODUCTION_NEON_BRANCH_IDS.some((p) => p.toLowerCase() === id);
}

/** Fetch every branch on a Neon project. Throws on HTTP error. */
export async function listBranches(
  apiKey: string,
  projectId: string
): Promise<NeonBranch[]> {
  const res = await fetch(
    `${NEON_API_BASE}/projects/${encodeURIComponent(projectId)}/branches`,
    { headers: neonHeaders(apiKey) }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Neon listBranches failed: HTTP ${res.status} ${res.statusText} — ${body.slice(0, 200)}`
    );
  }
  const json = (await res.json()) as NeonBranchListResponse;
  return json.branches;
}

/**
 * Delete a single branch. Throws on HTTP error.
 *
 * LAST-LINE PRODUCTION GUARD: this function refuses — before any network I/O —
 * to issue a DELETE for a known production branch id or for an unverifiable
 * id. It is deliberately independent of `isPrunable`, so a future reordering
 * or regression in the decision function still cannot delete production
 * through this exported entry point.
 */
export async function deleteBranch(
  apiKey: string,
  projectId: string,
  branchId: string
): Promise<void> {
  if (isProductionBranchId(branchId)) {
    throw new Error(
      `Refusing to DELETE Neon branch "${String(branchId)}": it is a protected ` +
        `production branch id (or its identity is unverifiable). Fail-closed.`
    );
  }
  const res = await fetch(
    `${NEON_API_BASE}/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branchId)}`,
    { method: "DELETE", headers: neonHeaders(apiKey) }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Neon deleteBranch ${branchId} failed: HTTP ${res.status} ${res.statusText} — ${body.slice(0, 200)}`
    );
  }
}

/**
 * The BRANCH-IDENTITY half of the prune decision: every production-safety
 * refusal that depends only on the branch record itself (not on the clock).
 *
 * Returns a refusal decision, or `null` when the branch cleared every guard.
 *
 * This is factored out of `isPrunable` DELIBERATELY so the delete path
 * (`assertDeletable`) can re-derive the refusals itself instead of trusting
 * whatever `isPrunable` happened to return. Mutation evidence for why that
 * matters: when `isPrunable` was regressed to always-permissive, the
 * `deleteBranch` id guard still saved the real production branch, but
 * branches merely NAMED `main` / `production` / `preview/main` were deleted —
 * `deleteBranch` only ever sees an id, never a name. This function closes
 * that gap.
 *
 * FAIL-CLOSED: every unknown, missing, wrong-typed or ambiguous input is a
 * refusal. There is no input for which "I could not tell" means "delete it".
 *
 * See the PRODUCTION SAFETY block at the top of this file before changing or
 * reordering any predicate. Each one is independently load-bearing and
 * independently mutation-tested in
 * `tests/runtime/neon-branch-prune-guard.test.ts`.
 */
export function productionSafetyRefusal(branch: NeonBranch): PruneDecision | null {
  // Treat the input as untrusted: `NeonBranch` is a compile-time contract,
  // and the values actually arrive from a remote HTTP API.
  const raw = branch as unknown as Record<string, unknown> | null | undefined;

  // -- GUARD 0 -- identity must be fully verifiable ----------------------
  // An absent `primary` flag is exactly how production became prunable
  // before 2026-08-20: `undefined` is falsy, so the primary check passed.
  if (raw === null || typeof raw !== "object") {
    return {
      prunable: false,
      reason: "branch record is not an object - identity unverifiable",
      code: "identity_unverifiable",
    };
  }
  const id = normalized(raw.id);
  const name = normalized(raw.name);
  if (id === null) {
    return {
      prunable: false,
      reason: "branch id missing or not a non-empty string - identity unverifiable",
      code: "identity_unverifiable",
    };
  }
  if (name === null) {
    return {
      prunable: false,
      reason: "branch name missing or not a non-empty string - identity unverifiable",
      code: "identity_unverifiable",
    };
  }
  if (typeof raw.primary !== "boolean") {
    return {
      prunable: false,
      reason:
        `branch "${name}" has no boolean \`primary\` flag - cannot prove it is not ` +
        `the production branch; refusing (fail-closed)`,
      code: "identity_unverifiable",
    };
  }
  if (typeof raw.protected !== "boolean") {
    return {
      prunable: false,
      reason:
        `branch "${name}" has no boolean \`protected\` flag - cannot prove it is not ` +
        `operator-protected; refusing (fail-closed)`,
      code: "identity_unverifiable",
    };
  }
  if (raw.default !== undefined && typeof raw.default !== "boolean") {
    return {
      prunable: false,
      reason: `branch "${name}" has a non-boolean \`default\` flag - refusing (fail-closed)`,
      code: "identity_unverifiable",
    };
  }
  // `updated_at` MUST be a non-empty string before it ever reaches `new Date()`.
  // Coercion here is a live trap, not a hypothetical: `new Date(null)` is
  // epoch 0 - a FINITE timestamp - so a null `updated_at` computes an age of
  // ~500,000 hours and reads as "infinitely idle". Same for any number.
  const updatedRaw = raw.updated_at;
  if (typeof updatedRaw !== "string" || updatedRaw.trim().length === 0) {
    return {
      prunable: false,
      reason: `branch "${name}" has a missing or non-string updated_at - cannot compute idle age (fail-closed)`,
      code: "identity_unverifiable",
    };
  }
  if (!Number.isFinite(new Date(updatedRaw).getTime())) {
    return {
      prunable: false,
      reason: `branch "${name}" has an unparseable updated_at - cannot compute idle age (fail-closed)`,
      code: "identity_unverifiable",
    };
  }

  // -- GUARD 1 -- the original provider flags (kept, never weakened) -----
  if (raw.primary === true) {
    return { prunable: false, reason: "primary branch (production)", code: "primary" };
  }
  if (raw.protected === true) {
    return { prunable: false, reason: "operator-protected", code: "operator_protected" };
  }

  // -- GUARD 2 -- Neon's default-branch flag -----------------------------
  if (raw.default === true) {
    return {
      prunable: false,
      reason: `branch "${name}" is the project default branch`,
      code: "default_branch",
    };
  }

  // -- GUARD 3 -- refuse the production branch by ID ---------------------
  // Independent of every provider flag: a renamed, un-flagged production
  // branch is still production.
  if (isProductionBranchId(id)) {
    return {
      prunable: false,
      reason: `branch id "${id}" is a protected production branch id`,
      code: "production_branch_id",
    };
  }

  // -- GUARD 4 -- refuse protected branch NAMES (incl. `main`) -----------
  if (PROTECTED_NEON_BRANCH_NAMES.some((n) => n.toLowerCase() === name)) {
    return {
      prunable: false,
      reason: `branch name "${name}" is a protected branch name`,
      code: "protected_branch_name",
    };
  }

  // -- GUARD 5 -- only integration-created `preview/...` branches may go --
  // A bare `preview/` with nothing after it is ambiguous -> refused.
  if (
    !name.startsWith(DELETABLE_BRANCH_NAME_PREFIX) ||
    name.length <= DELETABLE_BRANCH_NAME_PREFIX.length
  ) {
    return {
      prunable: false,
      reason:
        `branch name "${name}" is not a "${DELETABLE_BRANCH_NAME_PREFIX}" branch - ` +
        `only integration-created preview branches are deletable`,
      code: "not_preview_prefixed",
    };
  }

  return null;
}

/**
 * Decide whether a branch is eligible for pruning. Pure function - no
 * I/O - so the script and the cron route can both reuse it and the
 * decision is unit-testable.
 *
 * = `productionSafetyRefusal` (branch identity) + the retention window.
 * FAIL-CLOSED throughout: there is no input for which "I could not tell"
 * resolves to "delete it".
 */
export function isPrunable(
  branch: NeonBranch,
  retentionHours: number,
  now: Date = new Date()
): PruneDecision {
  const refusal = productionSafetyRefusal(branch);
  if (refusal !== null) return refusal;

  // -- GUARD 6 -- retention window must itself be valid ------------------
  // Without this, `ageHours < NaN` is false and EVERY branch looks idle.
  if (!Number.isFinite(retentionHours) || retentionHours <= 0) {
    return {
      prunable: false,
      reason: `retentionHours must be a positive finite number; got ${String(retentionHours)}`,
      code: "invalid_retention",
    };
  }
  const nowMs = now instanceof Date ? now.getTime() : NaN;
  if (!Number.isFinite(nowMs)) {
    return {
      prunable: false,
      reason: "`now` is not a valid Date - cannot compute idle age (fail-closed)",
      code: "identity_unverifiable",
    };
  }
  // `updated_at` is already proven present + parseable by productionSafetyRefusal.
  const raw = branch as unknown as Record<string, unknown>;
  const updatedMs = new Date(raw.updated_at as string).getTime();

  // A future-dated `updated_at` (clock skew, bad data) yields a negative age,
  // which this comparison refuses - deliberate, not incidental.
  const ageHours = (nowMs - updatedMs) / (1000 * 60 * 60);
  if (ageHours < retentionHours) {
    return {
      prunable: false,
      reason: `inside retention window (${ageHours.toFixed(1)}h < ${retentionHours}h)`,
      code: "within_retention",
    };
  }
  return { prunable: true, reason: `idle for ${ageHours.toFixed(1)}h`, code: "prunable" };
}

/**
 * Throw unless `branch` may be deleted, checked immediately before the delete.
 *
 * TWO INDEPENDENT LAYERS, in this order:
 *   1. `productionSafetyRefusal` is re-derived HERE, so the identity /
 *      production refusals do not depend on what `isPrunable` returned. A
 *      regression that makes `isPrunable` permissive still cannot delete a
 *      protected branch through this path. (Mutation-proven - test file SSH.)
 *   2. `isPrunable` is then consulted for the retention window.
 *
 * Throwing (rather than skipping) makes a guard trip loud: `pruneBranches`
 * records it as an error and the cron route returns 500.
 */
export function assertDeletable(
  branch: NeonBranch,
  retentionHours: number,
  now: Date
): void {
  const refusal = productionSafetyRefusal(branch);
  if (refusal !== null) {
    throw new Error(
      `Refusing to delete Neon branch: ${refusal.reason} [${refusal.code}] (fail-closed)`
    );
  }
  const decision = isPrunable(branch, retentionHours, now);
  if (!decision.prunable) {
    throw new Error(
      `Refusing to delete Neon branch: ${decision.reason} [${decision.code}] (fail-closed)`
    );
  }
}

export async function pruneBranches(opts: {
  apiKey: string;
  projectId: string;
  retentionHours?: number;
  execute: boolean;
}): Promise<PruneResult> {
  const retentionHours = opts.retentionHours ?? DEFAULT_RETENTION_HOURS;
  const branches = await listBranches(opts.apiKey, opts.projectId);
  const result: PruneResult = {
    examined: Array.isArray(branches) ? branches.length : 0,
    protected_count: 0,
    primary_count: 0,
    too_recent_count: 0,
    guard_refused_count: 0,
    guard_refused: [],
    pruned: [],
    errors: [],
  };
  if (!Array.isArray(branches)) return result;

  const now = new Date();
  for (const branch of branches) {
    const decision = isPrunable(branch, retentionHours, now);

    // Classify from the DECISION, never by re-reading the branch fields.
    // Re-reading is what let a guard refusal be miscounted as
    // "within retention" and disappear from the cron audit event.
    if (!decision.prunable) {
      if (decision.code === "primary") result.primary_count += 1;
      else if (decision.code === "operator_protected") result.protected_count += 1;
      else if (decision.code === "within_retention") result.too_recent_count += 1;
      else {
        result.guard_refused_count += 1;
        if (result.guard_refused.length < GUARD_REFUSED_DETAIL_CAP) {
          const rec = branch as unknown as Record<string, unknown>;
          result.guard_refused.push({
            id: typeof rec?.id === "string" ? rec.id : "(unknown)",
            name: typeof rec?.name === "string" ? rec.name : "(unknown)",
            code: decision.code,
            reason: decision.reason,
          });
        }
      }
      continue;
    }

    // Re-assert immediately before acting. Applies to the dry run too, so the
    // "would delete" list can never be more permissive than the real delete.
    try {
      assertDeletable(branch, retentionHours, now);
    } catch (e) {
      result.errors.push({
        id: branch.id,
        name: branch.name,
        message: e instanceof Error ? e.message : String(e),
      });
      continue;
    }

    if (!opts.execute) {
      result.pruned.push({
        id: branch.id,
        name: branch.name,
        updated_at: branch.updated_at,
      });
      continue;
    }
    try {
      await deleteBranch(opts.apiKey, opts.projectId, branch.id);
      result.pruned.push({
        id: branch.id,
        name: branch.name,
        updated_at: branch.updated_at,
      });
    } catch (e) {
      result.errors.push({
        id: branch.id,
        name: branch.name,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return result;
}
