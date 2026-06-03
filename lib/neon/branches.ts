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
 * Pruning rules (all must hold for a branch to be deleted):
 *   1. NOT the project's primary branch (Neon flags this as `primary` in
 *      the API; branches with this flag are typically `main` and back
 *      production).
 *   2. NOT `protected` (operator-flagged "do not auto-delete" branches).
 *   3. Last-update timestamp older than the retention window (default
 *      24h — the same envelope a developer would expect their PR's
 *      preview to stay alive for review).
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

export interface NeonBranch {
  id: string;
  name: string;
  primary: boolean;
  protected: boolean;
  created_at: string;
  updated_at: string;
}

export interface PruneResult {
  examined: number;
  protected_count: number;
  primary_count: number;
  too_recent_count: number;
  pruned: { id: string; name: string; updated_at: string }[];
  errors: { id: string; name: string; message: string }[];
}

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

/** Delete a single branch. Throws on HTTP error. */
export async function deleteBranch(
  apiKey: string,
  projectId: string,
  branchId: string
): Promise<void> {
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
 * Decide whether a branch is eligible for pruning. Pure function — no
 * I/O — so the script and the cron route can both reuse it and the
 * decision is unit-testable.
 */
export function isPrunable(
  branch: NeonBranch,
  retentionHours: number,
  now: Date = new Date()
): { prunable: boolean; reason: string } {
  if (branch.primary) {
    return { prunable: false, reason: "primary branch (production)" };
  }
  if (branch.protected) {
    return { prunable: false, reason: "operator-protected" };
  }
  const updatedAt = new Date(branch.updated_at);
  const ageHours = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60);
  if (ageHours < retentionHours) {
    return {
      prunable: false,
      reason: `inside retention window (${ageHours.toFixed(1)}h < ${retentionHours}h)`,
    };
  }
  return { prunable: true, reason: `idle for ${ageHours.toFixed(1)}h` };
}

/**
 * Run the prune pass against a Neon project. Set `execute: false` for
 * a dry run that reports what WOULD be deleted without touching the
 * project. Errors on individual branches are collected — a single
 * failure does not abort the run.
 */
export async function pruneBranches(opts: {
  apiKey: string;
  projectId: string;
  retentionHours?: number;
  execute: boolean;
}): Promise<PruneResult> {
  const retentionHours = opts.retentionHours ?? DEFAULT_RETENTION_HOURS;
  const branches = await listBranches(opts.apiKey, opts.projectId);
  const result: PruneResult = {
    examined: branches.length,
    protected_count: 0,
    primary_count: 0,
    too_recent_count: 0,
    pruned: [],
    errors: [],
  };

  const now = new Date();
  for (const branch of branches) {
    const decision = isPrunable(branch, retentionHours, now);
    if (!decision.prunable) {
      if (branch.primary) result.primary_count += 1;
      else if (branch.protected) result.protected_count += 1;
      else result.too_recent_count += 1;
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
