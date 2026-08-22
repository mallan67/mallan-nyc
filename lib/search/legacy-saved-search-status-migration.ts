/**
 * LEGACY SAVED-SEARCH STATUS MIGRATION — a boundary, not a contract.
 *
 * This file exists so that backward compatibility does NOT live inside the
 * canonical Cotality contract. `lib/search/canonical/status-token-contract.ts`
 * accepts exact live `StandardStatus` members and nothing else; a Mallan
 * invention like `UNDER_CONTRACT` must not be quietly translatable there,
 * because a contract that accepts non-provider spellings is a contract that
 * keeps a second vocabulary alive.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY LEGACY VALUES EXIST AT ALL
 *
 * Saved searches persisted before 2026-08-22 hold an uppercase vocabulary the
 * JavaScript layer invented — `PENDING`, `UNDER_CONTRACT`, `COMING_SOON` — even
 * though the status checkboxes that produced them always carried
 * `data-value="Pending" / "ActiveUnderContract" / "ComingSoon"`, and the
 * database column has always held the RESO member
 * (`prisma/schema.prisma:447`). Only the middle layer disagreed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FLOW, AND THE DIRECTION IT MAY RUN
 *
 *     legacy persisted value -> ONE-TIME migration here -> exact Cotality member
 *                            -> canonical contract
 *
 * and never
 *
 *     legacy value -> canonical contract silently translates it
 *
 * A migrated criterion is written back only as the exact member. A legacy
 * spelling is never persisted again and never reaches Cotality.
 *
 * `FUTURE` and `OFFEROUT` are absent by design. They have no proven provider
 * member — `Incomplete` exists but nobody has established that it MEANS
 * `FUTURE`, which is the same unverified equivalence that made `PENDING` mean
 * `ActiveUnderContract`. They return `null`, and the caller fails loudly rather
 * than substituting or dropping.
 */
import {
  isStandardStatusMember,
  type StandardStatusMember,
} from '@/lib/search/canonical/status-token-contract';

/**
 * Uppercase spellings a saved search may still hold, and the member each meant.
 *
 * Every entry is a SPELLING of a status that already exists. None is a concept
 * borrowing a member it was never proven to mean.
 */
const LEGACY_SPELLINGS: Readonly<Record<string, StandardStatusMember>> = Object.freeze({
  ACTIVE: 'Active',
  PENDING: 'Pending',
  UNDER_CONTRACT: 'ActiveUnderContract',
  CONTRACT: 'ActiveUnderContract',
  ACTIVEUNDERCONTRACT: 'ActiveUnderContract',
  COMING_SOON: 'ComingSoon',
  COMINGSOON: 'ComingSoon',
  CLOSED: 'Closed',
  WITHDRAWN: 'Withdrawn',
  CANCELLED: 'Canceled',
  CANCELED: 'Canceled',
  EXPIRED: 'Expired',
  HOLD: 'Hold',
  INCOMPLETE: 'Incomplete',
  DELETE: 'Delete',
});

/**
 * The exact `StandardStatus` member a persisted value means, or `null`.
 *
 * An already-canonical member passes through untouched. `null` means the stored
 * value has no proven provider member — the caller must surface that, never
 * substitute a neighbour and never drop the criterion, since dropping widens
 * the restored search rather than narrowing it.
 */
export function migrateLegacySavedSearchStatus(stored: unknown): StandardStatusMember | null {
  if (typeof stored !== 'string') return null;
  const trimmed = stored.trim();
  if (isStandardStatusMember(trimmed)) return trimmed;

  // Whitespace is stripped so a spaced spelling ("Coming Soon", "Active Under
  // Contract") migrates through this same table rather than a second normaliser.
  return LEGACY_SPELLINGS[trimmed.replace(/\s+/g, '').toUpperCase()] ?? null;
}

/** Migrate a whole persisted criterion list, reporting what could not be migrated. */
export function migrateLegacySavedSearchStatuses(stored: readonly unknown[]): {
  members: StandardStatusMember[];
  unmigratable: string[];
} {
  const members: StandardStatusMember[] = [];
  const unmigratable: string[] = [];
  for (const value of stored) {
    const member = migrateLegacySavedSearchStatus(value);
    if (member === null) unmigratable.push(String(value));
    else if (!members.includes(member)) members.push(member);
  }
  return { members, unmigratable };
}
