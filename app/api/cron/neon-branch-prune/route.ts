// GET /api/cron/neon-branch-prune
// Daily cron — deletes idle Neon branches that the Neon-Vercel
// marketplace integration accumulates from preview deploys. The
// Launch plan's 5000-branch cap is far above any realistic
// accumulation rate, but stale branches represent operational debt
// + cost; this cron + a 24h retention window keep the count near its
// steady-state baseline (~8) without operator intervention.
//
// Originally built 2026-04-28 to keep mallan-nyc under the Neon
// free-tier 10-branch cap. After the plan upgrade to Launch the cap
// dimension disappeared but the hygiene + cost-control motivation
// remained. See docs/support/vercel-neon-false-branch-limit-status-2026-06-03.md.
//
// Mirrors scripts/neon-prune-branches.ts so an operator can verify the
// cron's decisions locally before deploys. See lib/neon/branches.ts
// for the shared logic and NEON.md §11 for the full architecture note.
//
// Observability: every code path writes a `neon_branch_prune_cron`
// audit event so ops:health can detect cron-stoppage and silent
// missing-env skips. This was added 2026-05-10 after a 2+ week silent
// outage where the cron returned 200 skipped=true on every firing
// because NEON_API_KEY / NEON_PROJECT_ID were never provisioned in
// Vercel Production env, which let preview branches accumulate until
// the integration's branch cap was hit.
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { pruneBranches } from "@/lib/neon/branches";
import { isCanonicalNeonProject } from "@/lib/ops/canonical-neon-target";

export const maxDuration = 60;

const AUDIT_ACTION = "neon_branch_prune_cron";

async function writeAudit(changes: Prisma.InputJsonObject): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        action: AUDIT_ACTION,
        entity_type: "neon_branch",
        entity_id: "bulk",
        user_type: "system",
        user_id: null,
        changes,
      },
    });
  } catch {
    // Audit-event failure must NEVER mask the cron response. The cron
    // result (skipped/ok/partial) is the load-bearing signal; an audit
    // write failure is a secondary concern logged separately.
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (
    !cronSecret ||
    !authHeader ||
    authHeader.length !== ("Bearer " + cronSecret).length ||
    !timingSafeEqual(Buffer.from(authHeader), Buffer.from("Bearer " + cronSecret))
  ) {
    // Auth failure intentionally writes NO audit event — would let an
    // unauthenticated caller spam the audit log.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.NEON_API_KEY;
  const projectId = process.env.NEON_PROJECT_ID;
  if (!apiKey || !projectId) {
    // Configuration gap. Surface in the audit log so ops:health can
    // detect a missing-env state, AND return 503 so Vercel's cron
    // logs flag the run as failed (the prior 200-skipped behavior was
    // invisible to every observation surface, which let the gap
    // persist undetected for 2+ weeks).
    const missing = [
      !apiKey ? "NEON_API_KEY" : null,
      !projectId ? "NEON_PROJECT_ID" : null,
    ].filter((x): x is string => x !== null);
    await writeAudit({
      status: "skipped",
      reason: "missing_env",
      missing,
    });
    return NextResponse.json(
      {
        ok: false,
        skipped: true,
        reason: "NEON_API_KEY or NEON_PROJECT_ID not set on this Vercel environment",
        missing,
      },
      { status: 503 }
    );
  }

  // Fail-closed production-target guard. Refuse to prune any project that is not
  // the canonical production project (e.g. the stale do-not-serve
  // morning-bread-68708332). This runs BEFORE pruneBranches so no branch is ever
  // deleted against an ambiguous / wrong NEON_PROJECT_ID. (Phase 0.5 guardrail.)
  if (!isCanonicalNeonProject(projectId)) {
    await writeAudit({
      status: "refused",
      reason: "non_canonical_project",
      project_id: projectId,
    });
    return NextResponse.json(
      {
        ok: false,
        refused: true,
        reason:
          "NEON_PROJECT_ID is not the canonical production project; prune refused (fail-closed).",
        project_id: projectId,
      },
      { status: 409 }
    );
  }

  try {
    const result = await pruneBranches({
      apiKey,
      projectId,
      retentionHours: 24,
      execute: true,
    });
    // Production-safety guard refusals from lib/neon/branches.ts (unverifiable
    // identity, production branch id, protected branch name, missing
    // `preview/` prefix, default branch, invalid retention). Read defensively
    // so a PruneResult shaped before these fields existed cannot crash the cron.
    const guardRefusedCount = result.guard_refused_count ?? 0;
    const guardRefused = (result.guard_refused ?? []).map((r) => ({
      name: r.name,
      code: r.code,
    }));
    const kept = {
      primary: result.primary_count,
      protected: result.protected_count,
      within_retention: result.too_recent_count,
      // Non-zero is the guard working, not a failure. Surfaced so that drift
      // in the Neon branch-naming convention — which would silently stop all
      // pruning — is visible instead of looking like "nothing was idle".
      guard_refused: guardRefusedCount,
    };
    const body = {
      ok: result.errors.length === 0,
      examined: result.examined,
      pruned: result.pruned.length,
      pruned_branches: result.pruned.map((b) => b.name),
      kept,
      guard_refused_branches: guardRefused,
      errors: result.errors,
      ts: new Date().toISOString(),
    };
    await writeAudit({
      status: result.errors.length === 0 ? "ok" : "partial",
      examined: result.examined,
      pruned_count: result.pruned.length,
      pruned_branches: result.pruned.map((b) => b.name),
      kept,
      guard_refused_count: guardRefusedCount,
      guard_refused_branches: guardRefused,
      errors_count: result.errors.length,
    });
    if (result.errors.length > 0) {
      // Per-branch DELETE failures are surfaced as a 500 so Vercel's
      // cron logs flag the run as failed and an operator notices. A
      // 200 here would let stale branches accumulate silently and
      // defeat the whole point of the cron — `pruneBranches` already
      // collected the per-branch errors instead of aborting, so the
      // body still contains the partial-success details for triage.
      console.error(
        `[neon-branch-prune] ${result.errors.length} delete(s) failed:`,
        result.errors.map((e) => `${e.name}: ${e.message}`).join("; ")
      );
      return NextResponse.json(body, { status: 500 });
    }
    return NextResponse.json(body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    console.error("[neon-branch-prune] Failed:", msg);
    await writeAudit({
      status: "error",
      reason: "exception",
      error: msg,
    });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
