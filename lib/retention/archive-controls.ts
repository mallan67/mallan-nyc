/**
 * OPS-009 — two-flag fail-closed archive controls (design decided by Maya 2026-07-02;
 * registry docs/PLATFORM-ISSUE-REGISTRY.md OPS-009).
 *
 * Two env flags, both read fail-closed (absent / empty / anything-but-the-exact-string
 * "true" = OFF):
 *
 *  - `ARCHIVE_ENABLED` — GLOBAL KILL SWITCH. false/absent → NO archive writes anywhere:
 *    the nightly T+180 archive loop (app/api/cron/data-retention/route.ts) and the
 *    operator backlog drain (scripts/drain-archive-backlog.ts via lib/retention/drain-core.ts)
 *    both refuse to write. Dry-runs still work.
 *  - `ARCHIVE_BACKLOG_DRAIN_ENABLED` — gates ONLY the operator backlog drain.
 *
 * Three states:
 *  - OFF          — neither flag "true" (or only the drain flag): nothing archives.
 *  - MAINTENANCE  — ARCHIVE_ENABLED=true only: nightly 500-cap T+180 loop only.
 *  - DRAIN        — both "true": operator drain execute permitted, LAYERED ON TOP of the
 *    existing drain gates (--execute, --ack-rollback-branch, mandatory --max-rows,
 *    MAX_RUN_CEILING=25,000, cold-waterfall host guard, in-transaction eligibility
 *    re-check). The flags never replace or weaken those gates.
 *
 * NOT gated by these flags (mandatory carve-out): the T+24h off-market display removal in
 * the data-retention cron — that step is REBNY UCBA Art. I §6 / RLS §2.05 display
 * compliance, not archiving, and runs unconditionally.
 *
 * The pre-existing `ARCHIVE_T180_BACKLOG_ENABLED` flag is NOT read here and keeps its
 * clock-selection semantics unchanged (terminal_since vs status_changed_at). The flags in
 * this module gate whether archive writes happen AT ALL.
 *
 * Pure module: no I/O, no Prisma; every reader takes an injectable env for testability.
 */

export type ArchiveControlEnv = Record<string, string | undefined>;

export const ARCHIVE_ENABLED_FLAG = "ARCHIVE_ENABLED";
export const ARCHIVE_BACKLOG_DRAIN_ENABLED_FLAG = "ARCHIVE_BACKLOG_DRAIN_ENABLED";

/** Fail-closed flag read: ONLY the exact string "true" enables. Everything else is OFF. */
function flagIsTrue(env: ArchiveControlEnv, name: string): boolean {
  return env[name] === "true";
}

/** Global kill switch — false → NO archive writes anywhere (nightly loop AND drain). */
export function archiveWritesEnabled(env: ArchiveControlEnv = process.env): boolean {
  return flagIsTrue(env, ARCHIVE_ENABLED_FLAG);
}

/** Drain-only flag — gates ONLY the operator backlog drain (never the nightly loop). */
export function backlogDrainEnabled(env: ArchiveControlEnv = process.env): boolean {
  return flagIsTrue(env, ARCHIVE_BACKLOG_DRAIN_ENABLED_FLAG);
}

export type ArchiveControlState = "OFF" | "MAINTENANCE" | "DRAIN";

/**
 * Resolve the three-state archive control. The kill switch always wins: the drain flag
 * alone (ARCHIVE_ENABLED not "true") is still OFF — fail-closed by construction.
 */
export function archiveControlState(env: ArchiveControlEnv = process.env): ArchiveControlState {
  if (!archiveWritesEnabled(env)) return "OFF";
  return backlogDrainEnabled(env) ? "DRAIN" : "MAINTENANCE";
}

/**
 * Fail-closed gate for drain EXECUTE mode: requires the DRAIN state (BOTH flags exactly
 * "true"). Throws naming every missing flag. Dry-run must never call this — dry-runs work
 * regardless of flag state.
 */
export function assertDrainExecuteAllowed(env: ArchiveControlEnv = process.env): void {
  const missing: string[] = [];
  if (!archiveWritesEnabled(env)) missing.push(ARCHIVE_ENABLED_FLAG);
  if (!backlogDrainEnabled(env)) missing.push(ARCHIVE_BACKLOG_DRAIN_ENABLED_FLAG);
  if (missing.length > 0) {
    throw new Error(
      `REFUSING drain --execute: fail-closed — missing flag(s): ${missing.join(", ")}. ` +
        `Execute mode requires BOTH ${ARCHIVE_ENABLED_FLAG}="true" AND ` +
        `${ARCHIVE_BACKLOG_DRAIN_ENABLED_FLAG}="true" (current state=${archiveControlState(env)}). ` +
        `Dry-run works without flags. Env changes are Maya-held (OPS-009).`,
    );
  }
}
