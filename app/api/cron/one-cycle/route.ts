import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual, randomUUID } from 'crypto';
import prisma from '@/lib/prisma';

// ─── One Cycle W2 — the coordinated feed/media spine (Maya-approved 10-minute
// cadence, 2026-07-24) ───────────────────────────────────────────────────────
//
// Replaces the independent idx-sync (*/30) and media-sync (hourly) schedules
// with ONE orchestrated cycle every 10 minutes, per the W2 design doc
// (docs/operations/one-cycle-w2-schedule-design-2026-07-23.md §(b)/(d)) with
// Maya's cadence override (10 min, not 30).
//
// NEON COST — stated accurately, NOT claimed as a reduction:
//   The orchestrator ALWAYS touches Neon on every fire: it takes an advisory
//   lock and writes a one_cycle_started + one_cycle_run audit record. W3's
//   adaptive drain may skip media-SPECIFIC backlog work on an empty cycle, but
//   that does NOT make the one-cycle invocation DB-wake-free — the cycle still
//   wakes Neon. Whether consolidating to */10 lowers Neon wake count / active
//   time / compute-per-hour is a PRODUCTION-MEASURED question (before/after the
//   deploy), not an assertion. No compute-reduction claim is made here.
//
// Authority hierarchy (verbatim from the design):
//   "Cotality API → sole listing and feed-media truth → One Cycle → Neon
//    operational copy → projections → Vercel cache."
//
// Members are invoked IN-PROCESS by calling the existing route handlers with a
// forwarded Authorization header — no HTTP fan-out. Members run STRICTLY
// SEQUENTIALLY and each is AWAITED TO SETTLEMENT before the next starts, so IDX
// and media can never overlap inside a cycle and no completion is ever recorded
// while a started member is unresolved (see runMember + the loop below).
//
// MEASUREMENT (the "one production machine" contract): the `one_cycle_run`
// audit payload carries the machine roll-up (member statuses/durations, media
// cursor lag, overlap, run_id). DETAILED per-domain counters stay in each
// member's own audit event, which external observers already consume:
//   - listing/projection writes + suppression, cache revalidations,
//     affected-vs-warmed shards, manifest hits vs live fills → `idx_sync_cron`
//   - media rows, R2 admitted (mirror_allowed) / parked
//     (mirror_rejected_policy_parked) / uploaded (r2_uploaded) / reused
//     (r2_reused), W3 drain counters, cursor telemetry → `media_sync_cron`
//   - total Neon wake count / active time / compute per hour → Neon console/API
//     (ops:health), correlated by timestamp + run_id with the cycle audit rows.

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * The unified machine cadence, in milliseconds — the single source of truth for
 * "10 minutes" on the orchestrator side. Kept in lockstep with the production
 * cron (`*&#47;10 * * * *`), the public cache fallback TTL (SYNC_CADENCE_SECONDS
 * = 600s), and the listing-detail ISR window (revalidate = 600). A cycle must
 * always finish within one interval — enforced by the budget invariant below
 * (maxDuration 300s < CYCLE_INTERVAL_MS 600s) so a cycle can never run into the
 * next fire.
 */
export const CYCLE_INTERVAL_MS = 600_000;

/** Ordered required members (authority hierarchy: listings first, media second). */
const MEMBER_NAMES = ['idx-sync', 'media-sync'] as const;

/** Per-member soft wall-clock budgets (ms). Sum + headroom < maxDuration. */
const MEMBER_BUDGETS_MS: Record<string, number> = {
  'idx-sync': 120_000,
  'media-sync': 150_000,
};
const CYCLE_HEADROOM_MS = 20_000;
/** No single member may be budgeted longer than this (must leave room for others). */
const MAX_MEMBER_BUDGET_MS = 240_000;

/**
 * Resolve + VALIDATE the member budgets. Each is overridable via
 * `ONE_CYCLE_BUDGET_MS_<MEMBER>` (e.g. ONE_CYCLE_BUDGET_MS_IDX_SYNC) for ops
 * retuning without a redeploy. Invalid configuration FAILS CLOSED — the cycle
 * starts NO member and returns a configuration_error. Rejected:
 *   - non-finite / non-integer / zero / negative;
 *   - greater than MAX_MEMBER_BUDGET_MS;
 *   - a combined total + headroom that does not fit inside maxDuration.
 */
function resolveBudgets():
  | { ok: true; budgets: Record<string, number> }
  | { ok: false; error: string } {
  const budgets: Record<string, number> = {};
  let total = 0;
  for (const name of MEMBER_NAMES) {
    const raw = process.env[`ONE_CYCLE_BUDGET_MS_${name.replace(/-/g, '_').toUpperCase()}`];
    let b: number;
    if (raw === undefined) {
      b = MEMBER_BUDGETS_MS[name] ?? 60_000;
    } else {
      const n = Number(raw);
      if (!Number.isInteger(n) || n <= 0) {
        return { ok: false, error: `budget for ${name} must be a positive integer ms, got "${raw}"` };
      }
      b = n;
    }
    if (b > MAX_MEMBER_BUDGET_MS) {
      return { ok: false, error: `budget for ${name} (${b}ms) exceeds max ${MAX_MEMBER_BUDGET_MS}ms` };
    }
    budgets[name] = b;
    total += b;
  }
  if (total + CYCLE_HEADROOM_MS >= maxDuration * 1000) {
    return {
      ok: false,
      error: `member budgets + headroom (${total + CYCLE_HEADROOM_MS}ms) do not fit inside maxDuration (${maxDuration * 1000}ms)`,
    };
  }
  return { ok: true, budgets };
}

// Static invariant: the whole cycle fits inside one interval with margin, so
// scheduled fires never overlap under budget. (Belt-and-suspenders: the claim
// below still hard-stops any genuine overlap, e.g. a manual trigger.)
const _CYCLE_FITS_INTERVAL: true =
  (maxDuration * 1000 < CYCLE_INTERVAL_MS) as true;
void _CYCLE_FITS_INTERVAL;

// Advisory-lock identity for the cycle-claim mutex (distinct from the R2 drain
// lock class 20260723). A second concurrent invocation cannot win this lock and
// therefore cannot pass the claim.
const CYCLE_LOCK_CLASS = 20260724;
const CYCLE_LOCK_KEY = 1;

/**
 * Terminal member statuses. A member is "resolved" once it holds one of these:
 *   - ok            — settled 2xx within its soft budget
 *   - failed        — settled non-2xx
 *   - member_error  — threw
 *   - timed_out     — SETTLED, but ran longer than its soft budget (never
 *                     abandoned — the orchestrator awaited it to settlement)
 *   - budget_skipped— never started (insufficient remaining budget / chain
 *                     stopped by a prior non-ok member)
 * `ok` is the ONLY status that contributes to cycle success.
 */
type MemberStatus =
  | 'ok'
  | 'failed'
  | 'member_error'
  | 'timed_out'
  | 'budget_skipped';

const TERMINAL_STATUSES: ReadonlySet<MemberStatus> = new Set<MemberStatus>([
  'ok', 'failed', 'member_error', 'timed_out', 'budget_skipped',
]);

interface MemberResult {
  member: string;
  status: MemberStatus;
  http_status: number | null;
  duration_ms: number;
  /** True once the started member promise has settled (resolved OR rejected). */
  settled: boolean;
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

/**
 * Run ONE member to SETTLEMENT — no Promise.race, no abandonment.
 *
 * The prior implementation raced the member against a timeout and, on timeout,
 * returned while the member kept running — which let the next member start
 * concurrently and allowed a cycle to record completion with a member still
 * unresolved. That is removed. Here the member handler is AWAITED fully, so:
 *   - the caller cannot start the next member until this one settles;
 *   - IDX and media never overlap;
 *   - `settled` is always true on return.
 *
 * The soft budget is a wall-clock CLASSIFICATION + chain-stop signal, not a
 * cancellation: a member that settles later than its budget is marked
 * `timed_out`. We do NOT claim to cancel it — the underlying Prisma / Trestle /
 * R2 work does not honor an AbortSignal we could thread through, so per the
 * contract we "stop the chain and await/settle the started work" instead. The
 * hard ceiling is the function `maxDuration` (Vercel kills at 300s), after which
 * no one_cycle_run is written and the started-marker staleness window frees the
 * machine for the next fire.
 */
async function runMember(
  member: string,
  handler: (req: NextRequest) => Promise<Response>,
  authHeader: string,
  memberToken: string,
  runId: string,
  budgetMs: number,
): Promise<MemberResult> {
  const started = Date.now();
  // `x-one-cycle-member` is the orchestrator-identity proof that lets the member
  // SKIP its own 10-minute AuditEvent concurrency guard (which would FALSE-
  // TRIGGER at a 10-minute cadence). The header VALUE must equal CRON_SECRET
  // (the member timing-safe-compares it), so the header ALONE cannot bypass:
  // auth (401) precedes the guard, and a bare `x-one-cycle-member: 1` does not
  // match. Only the secret-holding orchestrator can produce the bypass.
  // `x-one-cycle-run-id` lets the member stamp its own durable audit event
  // (idx_sync_cron / media_sync_cron, incl. Cotality telemetry) with THIS
  // cycle's run_id, so member-level telemetry correlates with the cycle.
  const req = new NextRequest(`https://internal.one-cycle/${member}`, {
    headers: {
      authorization: authHeader,
      'x-one-cycle-member': memberToken,
      'x-one-cycle-run-id': runId,
    },
  });

  let status: MemberStatus;
  let http_status: number | null = null;
  let summary: Record<string, unknown> = {};
  try {
    const res = await handler(req); // FULLY AWAITED — never abandoned
    http_status = res.status;
    const body = await res.json().catch(() => ({}));
    status = res.status >= 200 && res.status < 300 ? 'ok' : 'failed';
    summary = extractSummary(body);
  } catch (err) {
    status = 'member_error';
    summary = { error: err instanceof Error ? err.message.slice(0, 200) : 'unknown' };
  }
  const duration_ms = Date.now() - started;
  // Settled-but-over-budget ⇒ timed_out (never contributes to success).
  if ((status === 'ok' || status === 'failed') && duration_ms > budgetMs) {
    status = 'timed_out';
  }
  return { member, status, http_status, duration_ms, settled: true, summary };
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

/**
 * Atomically claim the right to run THIS cycle — the orchestrator-level overlap
 * guard. Inside a single short transaction:
 *   1. take the cycle advisory xact lock (auto-released at txn end) so two
 *      concurrent claims serialize and cannot both proceed;
 *   2. find the most recent `one_cycle_started` marker within the max cycle
 *      runtime (maxDuration — a cycle can never be older than that and still
 *      running); if its run_id has NO matching `one_cycle_run` completion,
 *      another cycle is genuinely in progress → refuse the claim;
 *   3. otherwise write the `one_cycle_started` marker (carrying THIS run_id) and
 *      grant the claim.
 * started/completed are paired by a unique run_id — NOT timestamp inference.
 * A refused claim means the caller MUST exit without starting any member.
 * Fail-closed: any error refuses the claim (never risk two concurrent cycles).
 *
 * `db` is injected (the shared prisma client in production; an ephemeral-DB
 * client in the integration test) so the real advisory-lock + JSON-path query
 * are exercised against actual PostgreSQL, not mocks. Exported for that test.
 */
type ClaimDb = Pick<typeof prisma, '$transaction'>;
export async function claimCycle(
  db: ClaimDb,
  runId: string,
  now: Date,
): Promise<{ ok: boolean; reason?: string }> {
  const staleMs = maxDuration * 1000;
  try {
    return await db.$transaction(async (tx) => {
      const lockRows = (await tx.$queryRaw`
        SELECT pg_try_advisory_xact_lock(${CYCLE_LOCK_CLASS}::int4, ${CYCLE_LOCK_KEY}::int4) AS locked
      `) as Array<{ locked: boolean }>;
      if (!lockRows?.[0]?.locked) {
        return { ok: false, reason: 'lock_contended' };
      }
      const started = await tx.auditEvent.findFirst({
        where: {
          action: 'one_cycle_started',
          created_at: { gte: new Date(now.getTime() - staleMs) },
        },
        orderBy: { created_at: 'desc' },
        select: { created_at: true, changes: true },
      });
      if (started) {
        const prevRunId =
          started.changes && typeof started.changes === 'object'
            ? (started.changes as Record<string, unknown>).run_id
            : undefined;
        const completed = await tx.auditEvent.findFirst({
          where:
            typeof prevRunId === 'string'
              ? { action: 'one_cycle_run', changes: { path: ['run_id'], equals: prevRunId } }
              : { action: 'one_cycle_run', created_at: { gte: started.created_at } },
          select: { id: true },
        });
        if (!completed) {
          return { ok: false, reason: 'overlap_in_progress' };
        }
      }
      await tx.auditEvent.create({
        data: {
          action: 'one_cycle_started',
          entity_type: 'cron',
          entity_id: 'one-cycle',
          user_type: 'system',
          user_id: null,
          changes: { run_id: runId, started_at: now.toISOString(), cadence_ms: CYCLE_INTERVAL_MS },
        },
      });
      return { ok: true };
    });
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? `claim_error:${err.message.slice(0, 120)}` : 'claim_error',
    };
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

  const runId = randomUUID();

  // Budget config validation — FAIL CLOSED before taking a claim or starting any
  // member. An invalid ONE_CYCLE_BUDGET_MS_* override must never silently force
  // timeouts or defeat the budget design.
  const budgetCfg = resolveBudgets();
  if (!budgetCfg.ok) {
    // Best-effort audit (never throws); no claim taken, no member started.
    try {
      await prisma.auditEvent.create({
        data: {
          action: 'one_cycle_config_error',
          entity_type: 'cron',
          entity_id: 'one-cycle',
          user_type: 'system',
          user_id: null,
          changes: { run_id: runId, configuration_error: budgetCfg.error },
        },
      });
    } catch {
      /* observability only */
    }
    return NextResponse.json(
      { configuration_error: budgetCfg.error, run_id: runId, started: false },
      { status: 500 },
    );
  }
  const budgets = budgetCfg.budgets;

  const startedAt = new Date();

  // Overlap guard: a second concurrent one-cycle invocation cannot win the
  // advisory claim and exits here WITHOUT starting either member.
  const claim = await claimCycle(prisma, runId, startedAt);
  if (!claim.ok) {
    return NextResponse.json(
      {
        skipped: true,
        reason: claim.reason ?? 'overlap',
        run_id: runId,
        started_at: startedAt.toISOString(),
      },
      { status: 200 },
    );
  }

  // Member order is the authority hierarchy: listings first, media second.
  // Lazy require so a member module failure is isolated.
  const memberDefs: Array<[string, () => (r: NextRequest) => Promise<Response>]> = [
    ['idx-sync', () => require('@/app/api/cron/idx-sync/route').GET],
    ['media-sync', () => require('@/app/api/cron/media-sync/route').GET],
  ];
  const requiredMembers = memberDefs.map(([n]) => n);

  const members: MemberResult[] = [];
  let chainStopped = false;
  let chainStopReason: string | null = null;

  for (const [name, load] of memberDefs) {
    const budget = budgets[name];

    // Chain already stopped by a prior non-ok member → never start this one.
    if (chainStopped) {
      members.push({
        member: name, status: 'budget_skipped', http_status: null,
        duration_ms: 0, settled: false, summary: { skip_reason: chainStopReason },
      });
      continue;
    }

    // Not enough wall-clock left for this member to plausibly finish inside the
    // function budget → skip it (do NOT start work we can't let settle).
    const elapsed = Date.now() - startedAt.getTime();
    if (elapsed + budget + CYCLE_HEADROOM_MS > maxDuration * 1000) {
      chainStopped = true;
      chainStopReason = 'insufficient_budget';
      members.push({
        member: name, status: 'budget_skipped', http_status: null,
        duration_ms: 0, settled: false, summary: { skip_reason: chainStopReason },
      });
      continue;
    }

    let handler: (r: NextRequest) => Promise<Response>;
    try {
      handler = load();
    } catch (err) {
      chainStopped = true;
      chainStopReason = 'member_load_error';
      members.push({
        member: name, status: 'member_error', http_status: null,
        duration_ms: 0, settled: true,
        summary: { error: err instanceof Error ? err.message.slice(0, 200) : 'load failed' },
      });
      continue;
    }

    // Await to settlement BEFORE the loop can reach the next member.
    const result = await runMember(name, handler, authHeader, cronSecret, runId, budget);
    members.push(result);

    // Any non-ok member stops the chain: a slow/failed/timed-out IDX must never
    // let media start (on stale or incomplete listings), and a timed_out member
    // has already SETTLED here — nothing is left unresolved.
    if (result.status !== 'ok') {
      chainStopped = true;
      chainStopReason = `prior_member_${result.status}`;
    }
  }

  const endedAt = new Date();
  const cursorLag = await readMediaCursorLagSeconds();

  const byName = new Map(members.map((m) => [m.member, m] as const));
  // "Ran to settlement" = actually started AND settled (ok/failed/error/timed_out).
  // budget_skipped means the member NEVER STARTED — it is NOT a completion.
  const ranToSettlement = (s: MemberStatus): boolean =>
    s === 'ok' || s === 'failed' || s === 'member_error' || s === 'timed_out';

  // members_unresolved: a member that was STARTED but never settled. The
  // sequential-await structure makes this structurally 0 in any written audit
  // (the completion write is only reached after every member settled or was
  // skipped) — the field exists to PROVE that invariant.
  const members_unresolved = members.filter(
    (m) => m.status !== 'budget_skipped' && !m.settled,
  ).length;
  const missing_required = requiredMembers.filter((n) => !byName.has(n)).length;
  const members_budget_skipped = members.filter((m) => m.status === 'budget_skipped').length;

  // orchestration_settled: every started promise settled AND every required
  // member has a terminal record. TRUE even when a member was budget_skipped
  // (nothing was left dangling) — it is the "nothing abandoned" invariant.
  const orchestration_settled = members_unresolved === 0 && missing_required === 0;
  // complete: every REQUIRED member actually started and settled. A skipped
  // required member ⇒ NOT complete (media did not complete).
  const complete = requiredMembers.every((n) => {
    const m = byName.get(n);
    return !!m && ranToSettlement(m.status);
  });
  // success: complete AND every required member is 'ok'. timed_out /
  // budget_skipped / failed / member_error all force success=false.
  const success = complete && requiredMembers.every((n) => byName.get(n)?.status === 'ok');

  const machine = {
    run_id: runId,
    cadence: '10m',
    cadence_ms: CYCLE_INTERVAL_MS,
    orchestration_settled,
    complete,
    success,
    media_cursor_lag_seconds: cursorLag,
    members_ok: members.filter((m) => m.status === 'ok').length,
    members_failed: members.filter(
      (m) => m.status === 'failed' || m.status === 'member_error',
    ).length,
    members_timed_out: members.filter((m) => m.status === 'timed_out').length,
    members_budget_skipped,
    members_unresolved,
  };

  // ONE cycle-completion audit — written ONLY after every member has settled or
  // been skipped (never while a member is unresolved). Paired to the start
  // marker by run_id. Never throws.
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
          ...machine, // includes run_id, complete, success, member tallies
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
    started_at: startedAt.toISOString(),
    duration_ms: endedAt.getTime() - startedAt.getTime(),
    members,
    ...machine,
  });
}
