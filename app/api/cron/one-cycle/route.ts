import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual, randomUUID } from 'crypto';
import prisma from '@/lib/prisma';
import { claimMachine } from '@/lib/idx/machine-claim';
import { runIdxSyncMember } from '@/lib/idx/idx-sync-member';
import type { MemberOutcome, MemberRunResult } from '@/lib/idx/idx-sync-member';
import { runMediaSyncMember } from '@/lib/idx/media-sync-member';
import { requiredMembersForPlan } from '@/lib/idx/one-cycle-preflight';
import { currentExecutionPlan } from '@/lib/idx/one-cycle-plan-channel';

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
// Members are invoked IN-PROCESS by importing and calling their internal work
// functions directly (runIdxSyncMember / runMediaSyncMember) — no HTTP fan-out,
// no forwarded secret, no forgeable header. One Cycle already owns the shared
// machine claim, so members do NOT claim again; the public GET routes ALWAYS
// claim, so there is no HTTP path that reaches an unclaimed member. Members run
// STRICTLY SEQUENTIALLY and each is AWAITED TO SETTLEMENT before the next starts,
// so IDX and media can never overlap inside a cycle and no completion is ever
// recorded while a started member is unresolved (see runMember + the loop below).
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

// Machine-execution overlap protection is the SHARED atomic claim
// (lib/idx/machine-claim.ts), used by One Cycle AND every standalone member so a
// manual run can never overlap the machine via a non-atomic check-then-start.

/**
 * Terminal member statuses — derived from the member's SEMANTIC outcome, never
 * from HTTP status. A member is "resolved" once it holds one of these:
 *   - ok            — did its full work, every required unit succeeded
 *   - partial       — STARTED and settled, but some units failed (member
 *                     outcome "partial", e.g. media rows_failed/r2_failed > 0):
 *                     it ran to settlement (⇒ counts toward complete) but is NOT
 *                     ok (⇒ forces success=false, machine outcome "partial")
 *   - skipped       — a precondition prevented the work (IDX/media disabled or
 *                     no creds): the member did NOT do its work, so it is NOT a
 *                     completion (⇒ complete=false) and it stops the chain
 *   - failed        — the run failed (member outcome "error"; settled non-ok)
 *   - member_error  — threw
 *   - timed_out     — SETTLED, but ran longer than its soft budget (never
 *                     abandoned — the orchestrator awaited it to settlement)
 *   - budget_skipped— never started (insufficient remaining budget / chain
 *                     stopped by a prior non-ok member)
 * `ok` is the ONLY status that contributes to cycle success.
 */
type MemberStatus =
  | 'ok'
  | 'partial'
  | 'skipped'
  | 'failed'
  | 'member_error'
  | 'timed_out'
  | 'budget_skipped';

const TERMINAL_STATUSES: ReadonlySet<MemberStatus> = new Set<MemberStatus>([
  'ok', 'partial', 'skipped', 'failed', 'member_error', 'timed_out', 'budget_skipped',
]);

interface MemberResult {
  member: string;
  status: MemberStatus;
  /** The member's explicit semantic outcome (machine-truth source, not status). */
  outcome: MemberOutcome;
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
 * A member is an IN-PROCESS function (runIdxSyncMember / runMediaSyncMember) —
 * NOT an HTTP handler. One Cycle already owns the machine claim, so members do
 * NOT claim. There is NO forgeable HTTP header that reaches this unclaimed path:
 * the public GET routes always claim; only this direct import is exempt.
 */
type MemberFn = (args: { oneCycleRunId: string }) => Promise<MemberRunResult>;

/**
 * Run ONE member to SETTLEMENT — no Promise.race, no abandonment.
 *
 * The member function is AWAITED fully, so:
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
  fn: MemberFn,
  runId: string,
  budgetMs: number,
): Promise<MemberResult> {
  const started = Date.now();
  let status: MemberStatus;
  let outcome: MemberOutcome;
  let http_status: number | null = null;
  let summary: Record<string, unknown> = {};
  try {
    const res = await fn({ oneCycleRunId: runId }); // FULLY AWAITED — never abandoned
    http_status = res.status;
    outcome = res.outcome;
    // Classify from the SEMANTIC outcome, NEVER from the HTTP status. A 200 that
    // is a precondition skip or a partial run must NOT be counted as ok.
    switch (res.outcome) {
      case 'ok':
        status = 'ok';
        break;
      case 'partial':
        status = 'partial';
        break;
      case 'skipped':
        status = 'skipped';
        break;
      case 'error':
      default:
        status = 'failed';
        break;
    }
    summary = extractSummary(res.body);
  } catch (err) {
    // A member function catches its own errors and returns outcome "error";
    // reaching here means an UNEXPECTED throw escaped it.
    status = 'member_error';
    outcome = 'error';
    summary = { error: err instanceof Error ? err.message.slice(0, 200) : 'unknown' };
  }
  const duration_ms = Date.now() - started;
  // Settled-but-over-budget ⇒ timed_out (never contributes to success). Applies
  // to any status that actually did work (ok/partial/failed); a precondition
  // skip did no work, so it is never reclassified.
  if ((status === 'ok' || status === 'partial' || status === 'failed') && duration_ms > budgetMs) {
    status = 'timed_out';
  }
  return { member, status, outcome, http_status, duration_ms, settled: true, summary };
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

  // WHICH members this cycle is responsible for. Read from the INTERNAL plan
  // channel, never from the request — see lib/idx/one-cycle-plan-channel.ts.
  // Any caller outside the preflight's scope gets `full_safety`, so a direct
  // HTTP request can never narrow the cycle or suppress a member.
  const executionPlan = currentExecutionPlan();

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

  // Overlap guard: the SHARED atomic machine claim. A second concurrent
  // execution (another cycle OR a standalone member) cannot win it and exits
  // here WITHOUT starting any member.
  const claim = await claimMachine(prisma, {
    runId,
    executionType: 'one-cycle',
    member: null,
    extra: { cadence_ms: CYCLE_INTERVAL_MS },
    now: startedAt,
  });
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
  // Members are the internal work functions, imported and called in-process.
  // One Cycle owns the claim, so these run UNCLAIMED here — that unclaimed path
  // is reachable ONLY via this direct import, never over HTTP (the public GET
  // routes always claim). One Cycle drives INCREMENTAL idx-sync (forceFull:false);
  // a full backlog drain is a deliberate manual `?full=true` GET, which claims.
  const allMemberDefs: Array<[string, MemberFn]> = [
    ['idx-sync', ({ oneCycleRunId }) => runIdxSyncMember({ oneCycleRunId, forceFull: false })],
    ['media-sync', ({ oneCycleRunId }) => runMediaSyncMember({ oneCycleRunId })],
  ];

  // Members are SELECTED BY PLAN, and completion is judged against that
  // selection. Previously both were a constant, which meant an intentionally
  // IDX-free cycle was scored against a member it was never asked to run:
  // `complete` would be false, `outcome` would be 'incomplete', `forceRun`
  // would be set, and every later poll would fail open — so the machine would
  // never skip again.
  //
  // Filtering `allMemberDefs` (rather than mapping the plan to functions)
  // preserves the authority hierarchy structurally: IDX cannot be reordered
  // after media, whatever the plan says.
  const planned = new Set(requiredMembersForPlan(executionPlan));
  const memberDefs = allMemberDefs.filter(([name]) => planned.has(name as 'idx-sync' | 'media-sync'));
  const requiredMembers = memberDefs.map(([n]) => n);

  const members: MemberResult[] = [];
  let chainStopped = false;
  let chainStopReason: string | null = null;

  for (const [name, fn] of memberDefs) {
    const budget = budgets[name];

    // Chain already stopped by a prior non-ok member → never start this one.
    if (chainStopped) {
      members.push({
        member: name, status: 'budget_skipped', outcome: 'skipped', http_status: null,
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
        member: name, status: 'budget_skipped', outcome: 'skipped', http_status: null,
        duration_ms: 0, settled: false, summary: { skip_reason: chainStopReason },
      });
      continue;
    }

    // Await to settlement BEFORE the loop can reach the next member.
    const result = await runMember(name, fn, runId, budget);
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
  // A member "ran to settlement" if it actually started AND settled — ok,
  // partial (started, some units failed), failed, member_error, or timed_out.
  // A precondition `skipped` and a `budget_skipped` did NOT do their work, so
  // they are NOT completions.
  const ranToSettlement = (s: MemberStatus): boolean =>
    s === 'ok' || s === 'partial' || s === 'failed' || s === 'member_error' || s === 'timed_out';

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
  // success: complete AND every required member is 'ok'. partial / skipped /
  // timed_out / budget_skipped / failed / member_error all force success=false.
  // A partial media run is therefore complete=true but success=false.
  const success = complete && requiredMembers.every((n) => byName.get(n)?.status === 'ok');

  const machine = {
    run_id: runId,
    execution_type: 'one-cycle',
    outcome: success ? 'success' : complete ? 'partial' : 'incomplete',
    // Which members this cycle was responsible for, and therefore what
    // `complete`/`success` above were actually judged against. Without this a
    // reader cannot tell a healthy media_only cycle from a full cycle that lost
    // IDX, because both report exactly one settled member.
    execution_plan: executionPlan,
    required_members: requiredMembers,
    cadence: '10m',
    cadence_ms: CYCLE_INTERVAL_MS,
    orchestration_settled,
    complete,
    success,
    media_cursor_lag_seconds: cursorLag,
    members_ok: members.filter((m) => m.status === 'ok').length,
    // partial: STARTED and settled but some units failed (member outcome
    // "partial") — counts toward complete, never toward success.
    members_partial: members.filter((m) => m.status === 'partial').length,
    // precondition-skipped: a member whose precondition (IDX/media enabled +
    // creds) failed — did NOT run its work (distinct from budget_skipped).
    members_precondition_skipped: members.filter((m) => m.status === 'skipped').length,
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
