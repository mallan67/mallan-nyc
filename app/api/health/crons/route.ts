// GET /api/health/crons
// Returns the last run status of each cron job from AuditEvent table.
// Protected by session cookie (broker-only access).
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireRole, isAuthError } from "@/lib/auth";

const CRON_NAMES = [
  "dom-reset", "idx-sync", "listing-expiration", "search-alerts",
  "seller-scoring", "experiment-metrics", "demand-signals", "intent-profiles",
  "agent-metrics", "market-snapshots", "lead-scoring", "data-retention",
  "conviction-scores", "listing-momentum", "social-proof", "lifecycle-triggers",
];

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "BROKER");
  if (isAuthError(auth)) return auth;

  // Single query instead of 32 (2 per cron name)
  const events = await prisma.auditEvent.findMany({
    where: {
      entity_type: "cron",
      entity_id: { in: CRON_NAMES },
      action: { in: ["cron_success", "cron_failure"] },
    },
    orderBy: { created_at: "desc" },
    select: {
      entity_id: true,
      action: true,
      created_at: true,
      changes: true,
    },
  });

  // Group by cron name, keeping only the latest success and failure for each
  const results: Record<string, {
    last_success: Date | null;
    last_success_data: unknown;
    last_failure: Date | null;
    last_failure_data: unknown;
  }> = {};

  // Initialize all cron names
  for (const name of CRON_NAMES) {
    results[name] = {
      last_success: null,
      last_success_data: null,
      last_failure: null,
      last_failure_data: null,
    };
  }

  // Events are ordered by created_at desc, so first match per (name, action) is latest
  const seen = new Set<string>();
  for (const event of events) {
    const key = `${event.entity_id}:${event.action}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const entry = results[event.entity_id];
    if (!entry) continue;

    if (event.action === "cron_success") {
      entry.last_success = event.created_at;
      entry.last_success_data = event.changes;
    } else {
      entry.last_failure = event.created_at;
      // Sanitize error output — don't leak stack traces
      const changes = event.changes as Record<string, unknown> | null;
      entry.last_failure_data = changes
        ? { error: changes.error, duration_ms: changes.duration_ms }
        : null;
    }
  }

  return NextResponse.json({ crons: results });
}
