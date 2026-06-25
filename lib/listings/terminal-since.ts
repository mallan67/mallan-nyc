/**
 * terminal_since — stable terminal-age clock (Archive Eligibility Clock PR-1, #415).
 *
 * WHY: archive eligibility (`data-retention` T+180) used `status_changed_at` /
 * `modification_timestamp`, but those are continuously re-stamped by idx-sync
 * (DB-proven: `status_changed_at` ≈ `modification_timestamp` for 99.1% of
 * terminals) — so terminal rows never "age" and the archive drain reaches ~0
 * rows. `terminal_since` is a typed clock set ONCE when a listing becomes
 * terminal, derived from a STABLE source date (the sale / off-market date) that
 * sync does not bump on re-emit. See
 * docs/superpowers/plans/2026-06-24-archive-eligibility-clock-fix-plan.md.
 *
 * PR-1 is CLOCK PLUMBING ONLY: this populates `terminal_since` going forward and
 * (via the backfill script, dry-run by default) can fill historical rows. It does
 * NOT repoint the archive predicate, enable the backlog flag, run the backfill,
 * archive/strip, or reclaim.
 *
 * @module lib/listings/terminal-since
 */
import { TERMINAL_STATUSES, normalizeStandardStatus } from "@/lib/idx/trestle-mapper";

/** Sanity window — reject impossible dates (e.g. a bogus CloseDate of year 2814). */
const SANITY_MIN_MS = Date.UTC(2000, 0, 1); // 2000-01-01
const SANITY_GRACE_MS = 24 * 60 * 60 * 1000; // allow up to now + 1 day (tz/clock skew)

/** True when `status` normalizes to a terminal status. */
export function isTerminalStatus(status: unknown): boolean {
  return TERMINAL_STATUSES.has(normalizeStandardStatus(status));
}

/**
 * Parse a candidate date string and apply the sanity window.
 * Returns a Date only when valid AND within [2000-01-01, now+1d]; else null.
 * (Rejects unparseable, ancient, and impossible-future dates like year 2814.)
 */
export function parseStableDate(v: unknown, now: Date = new Date()): Date | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  if (t < SANITY_MIN_MS) return null;
  if (t > now.getTime() + SANITY_GRACE_MS) return null;
  return new Date(t);
}

/**
 * Derive a STABLE terminal-age date from a listing's stable source fields.
 *
 * Priority (first valid wins): `raw_data.CloseDate` → `features.CloseDate`
 * (import-closed rows store it there) → `raw_data.OffMarketDate` →
 * `raw_data.ExpirationDate` (only for Expired status). Returns null if none is
 * present/valid — callers must NOT fabricate (backfill leaves NULL; the live
 * writer falls back to the transition wall-clock — see computeTerminalSincePatch).
 */
export function deriveTerminalSince(input: {
  status?: unknown;
  raw_data?: Record<string, unknown> | null;
  features?: Record<string, unknown> | null;
  now?: Date;
}): Date | null {
  const now = input.now ?? new Date();
  const raw = (input.raw_data ?? {}) as Record<string, unknown>;
  const feat = (input.features ?? {}) as Record<string, unknown>;
  const normalized = normalizeStandardStatus(input.status);
  const candidates: unknown[] = [raw.CloseDate, feat.CloseDate, raw.OffMarketDate];
  if (normalized === "Expired") candidates.push(raw.ExpirationDate);
  for (const cand of candidates) {
    const d = parseStableDate(cand, now);
    if (d) return d;
  }
  return null;
}

/**
 * Compute the `terminal_since` write for a status transition (the writer rule).
 *
 *  - non-terminal → terminal: SET to the stable source date, else the transition
 *    wall-clock (`now`) — honest "first observed terminal" going forward.
 *  - terminal → terminal (re-sync of an already-terminal listing): NO change
 *    (returns `{}`) — never bump it.
 *  - terminal → non-terminal (reinstated to active/on-market): CLEAR to null.
 *  - non-terminal → non-terminal: no change.
 *
 * Spread the result into a Prisma `update`/`create` data object.
 */
export function computeTerminalSincePatch(args: {
  previousStatus: unknown;
  newStatus: unknown;
  raw_data?: Record<string, unknown> | null;
  features?: Record<string, unknown> | null;
  now?: Date;
}): { terminal_since?: Date | null } {
  const now = args.now ?? new Date();
  const wasTerminal = isTerminalStatus(args.previousStatus);
  const nowTerminal = isTerminalStatus(args.newStatus);

  if (!wasTerminal && nowTerminal) {
    const stable = deriveTerminalSince({
      status: args.newStatus,
      raw_data: args.raw_data,
      features: args.features,
      now,
    });
    return { terminal_since: stable ?? now };
  }
  if (wasTerminal && !nowTerminal) {
    return { terminal_since: null };
  }
  return {};
}
