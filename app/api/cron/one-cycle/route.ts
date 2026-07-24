import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import prisma from '@/lib/prisma';

// ─── One Cycle W2 — the coordinated feed/media spine (Maya-approved 10-minute
// cadence, 2026-07-24) ───────────────────────────────────────────────────────
//
// Replaces the independent idx-sync (*/30) and media-sync (hourly) schedules
// with ONE orchestrated cycle every 10 minutes, per the W2 design doc
// (docs/operations/one-cycle-w2-schedule-design-2026-07-23.md §(b)/(d)) with
// Maya's cadence override (10 min, not 30) — affordable because W3's adaptive
// drain skips the DB wake entirely on empty cycles.
//
// Authority hierarchy (verbatim from the design):
//   "Cotality API → sole listing and feed-media truth → One Cycle → Neon
//    operational copy → projections → Vercel cache."
//
// Members are invoked IN-PROCESS by calling the existing route handlers with
// a forwarded Authorization header — no HTTP fan-out, no member refactor:
// every member keeps its own auth check, 10-minute concurrency guard, audit
// event, and counters byte-identical to its standalone schedule. The once-
// daily compliance/business crons intentionally keep their own slots (1
// firing/day each; consolidation of the 5 heavyweight inline routes is a
// separately-scoped refactor per the design's §(d) fallback note).
//
// Failure design (W2 §(d)): a failed member never breaks the chain; statuses
// land in ONE `one_cycle_run` AuditEvent per firing with a per-member status
// array + the machine roll-up. No in-cycle retries — the next cycle re-covers
// missed ground because failures never advance cursors/watermarks.
//
// MEASUREMENT (the "one production machine" contract): the `one_cycle_run`
// audit payload carries the machine roll-up (member statuses/durations,
// media cursor lag, previous-run overlap). The DETAILED per-domain counters
// intentionally stay in the members' own audit events, which external
// observers already consume:
//   - listing/projection writes + suppression, cache revalidations,
//     affected-vs-warmed shards, manifest hits vs live fills → `idx_sync_cron`
//   - media rows, R2 admitted (mirror_allowed) / parked
//     (mirror_rejected_policy_parked) / uploaded (r2_uploaded) / reused
//     (r2_reused), W3 drain counters, cursor telemetry → `media_sync_cron`
//   - total Neon activity per hour → Neon console/API (ops:health), not
//     app-measurable; correlated by timestamp with cycle audit rows.

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Per-member wall-clock budgets (ms). Sum + headroom < maxDuration. */
const MEMBER_BUDGETS_MS: Record<string, number> = {
  'idx-sync': 120_000,
  'media-sync': 150_000,
};
const CYCLE_HEADROOM_MS = 20_000;

interface MemberResult {
  member: string;
  status: 'ok' | 'failed' | 'budget_skipped' | 'timeout' | 'member_error';
  http_status: number | null;
  duration_ms: number;
  /** Whitelisted numeric/boolean counters from the member's JSON response. */
  summary: Record<string, unknown>;
}

/** Counter keys worth echoing into the cycle roll-up (prefix allowlist). */
const SUMMARY_KEY_PREFIXES = [
  'rows_', 'listings_', 'r2_', 'mirror_', 'backlog_', 'summary_',
  'projections', 'write_paths', 'revalidat', 'warm', 'shards_',
  'cache_', 'fallback_', 'skipped', 'processed', 'failed', 'ghost',
  'overlap_', 'time_budget', 'query_path', 'run_duration',
];

function extractSummary(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (!SUMMARY_KEY_PREFIXES.some((p) => k.startsWith(p))) continue;
    if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') {
      out[k] = v;
    } else if (typeof v === 'object' && v !== null) {
      // one level of nested counter objects (e.g. write_paths, revalidation)
      out[k] = v;
    }
  }
  return out;
}

async function runMember(
  member: string,
  handler: (req: NextRequest) => Promise<Response>,
  authHeader: string,
  budgetMs: number,
): Promise<MemberResult> {
  const started = Date.now();
  try {
    // `x-one-cycle-member` signals the member it is running INSIDE the
    // orchestrator. The orchestrator is the single 10-minute concurrency unit
    // (members run sequentially, never overlapping; the media drain also holds
    // a pg advisory lock), so the member's own AuditEvent concurrency guard —
    // which is a 10-minute lookback and would therefore FALSE-TRIGGER at a
    // 10-minute cadence (each run's completion lands inside the next cycle's
    // window) — is bypassed for the orchestrated path. The guard stays active
    // for manual / standalone invocation.
    const req = new NextRequest(`https://internal.one-cycle/${member}`, {
      headers: { authorization: authHeader, 'x-one-cycle-member': '1' },
    });
    const raced = await Promise.race([
      handler(req).then(async (res) => ({
        kind: 'res' as const,
        status: res.status,
        body: await res.json().catch(() => ({})),
      })),
      new Promise<{ kind: 'timeout' }>((resolve) =>
        setTimeout(() => resolve({ kind: 'timeout' }), budgetMs),
      ),
    ]);
    const duration_ms = Date.now() - started;
    if (raced.kind === 'timeout') {
      // The member keeps running inside this invocation; we record the
      // breach and move on — its own audit event tells the full story.
      return { member, status: 'timeout', http_status: null, duration_ms, summary: {} };
    }
    return {
      member,
      status: raced.status >= 200 && raced.status < 300 ? 'ok' : 'failed',
      http_status: raced.status,
      duration_ms,
      summary: extractSummary(raced.body),
    };
  } catch (err) {
    return {
      member,
      status: 'member_error',
      http_status: null,
      duration_ms: Date.now() - started,
      summary: { error: err instanceof Error ? err.message.slice(0, 200) : 'unknown' },
    };
  }
}

/** Media cursor lag vs NOW — the machine's freshness gauge (seconds). */
async function readMediaCursorLagSeconds(): Promise<number | null> {
  try {
    const { getMediaSyncCursor } = require('@/lib/idx/media-sync') as {
      getMediaSyncCursor: () => Promise<{ last_photos_change: Date | null }>;
    };
    const state = await getMediaSyncCursor();
    if (!state?.last_photos_change) return null;
    return Math.max(
      0,
      Math.round((Date.now() - new Date(state.last_photos_change).getTime()) / 1000),
    );
  } catch {
    return null; // measurement must never fail the cycle
  }
}

/** Did the previous cycle plausibly overlap this one? (observability only —
 *  hard overlap safety lives in the members' own guards + W3's advisory lock.) */
async function previousRunOverlap(startedAt: Date): Promise<boolean> {
  try {
    const prev = await prisma.auditEvent.findFirst({
      where: { action: 'one_cycle_run' },
      orderBy: { created_at: 'desc' },
      select: { created_at: true, changes: true },
    });
    if (!prev) return false;
    const prevStart = new Date(prev.created_at).getTime();
    const prevDuration =
      typeof (prev.changes as Record<string, unknown>)?.duration_ms === 'number'
        ? ((prev.changes as Record<string, unknown>).duration_ms as number)
        : 0;
    return prevStart + prevDuration > startedAt.getTime();
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  if (
    !cronSecret ||
    !authHeader ||
    authHeader.length !== ('Bearer ' + cronSecret).length ||
    !timingSafeEqual(Buffer.from(authHeader), Buffer.from('Bearer ' + cronSecret))
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = new Date();
  const overlap = await previousRunOverlap(startedAt);
  const members: MemberResult[] = [];

  // Member order is the authority hierarchy: listings first, media second.
  // Lazy require so a member module failure is isolated per W2 §(d).
  const memberDefs: Array<[string, () => (r: NextRequest) => Promise<Response>]> = [
    ['idx-sync', () => require('@/app/api/cron/idx-sync/route').GET],
    ['media-sync', () => require('@/app/api/cron/media-sync/route').GET],
  ];

  for (const [name, load] of memberDefs) {
    const elapsed = Date.now() - startedAt.getTime();
    const budget = MEMBER_BUDGETS_MS[name] ?? 60_000;
    if (elapsed + budget + CYCLE_HEADROOM_MS > maxDuration * 1000) {
      members.push({
        member: name,
        status: 'budget_skipped',
        http_status: null,
        duration_ms: 0,
        summary: {},
      });
      continue;
    }
    let handler: (r: NextRequest) => Promise<Response>;
    try {
      handler = load();
    } catch (err) {
      members.push({
        member: name,
        status: 'member_error',
        http_status: null,
        duration_ms: 0,
        summary: { error: err instanceof Error ? err.message.slice(0, 200) : 'load failed' },
      });
      continue;
    }
    members.push(await runMember(name, handler, authHeader, budget));
  }

  const endedAt = new Date();
  const cursorLag = await readMediaCursorLagSeconds();
  const machine = {
    cadence: '10m',
    previous_run_overlap: overlap,
    media_cursor_lag_seconds: cursorLag,
    members_ok: members.filter((m) => m.status === 'ok').length,
    members_failed: members.filter(
      (m) => m.status === 'failed' || m.status === 'member_error',
    ).length,
    members_skipped: members.filter(
      (m) => m.status === 'budget_skipped' || m.status === 'timeout',
    ).length,
  };

  // ONE cycle audit event (W2 §(d) partial-cycle reporting). Never throws.
  try {
    await prisma.auditEvent.create({
      data: {
        action: 'one_cycle_run',
        entity_type: 'cron',
        entity_id: 'one-cycle',
        user_type: 'system',
        user_id: null,
        changes: {
          started_at: startedAt.toISOString(),
          ended_at: endedAt.toISOString(),
          duration_ms: endedAt.getTime() - startedAt.getTime(),
          members: JSON.parse(JSON.stringify(members)),
          ...machine,
        },
      },
    });
  } catch (auditErr) {
    console.error(
      '[one-cycle] cycle audit write failed (members already audited individually):',
      auditErr instanceof Error ? auditErr.message : auditErr,
    );
  }

  return NextResponse.json({
    success: machine.members_failed === 0,
    started_at: startedAt.toISOString(),
    duration_ms: endedAt.getTime() - startedAt.getTime(),
    members,
    ...machine,
  });
}
