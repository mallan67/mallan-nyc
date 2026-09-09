/**
 * DOM Tracker — THE one home of Mallan's days-on-market rules (Maya 2026-09-08: two clocks, one rule each).
 *
 *   A. Coming Soon DOM (`comingSoonDom`) — a SEPARATE clock: from the day the status became Coming Soon
 *      (ContractStatusChangeDate; equals the StatusChangeTimestamp day on every live Coming Soon row) to the as-of
 *      day, with the countdown to ActivationDate (REBNY's First Showing Date). Never merged into the market clock.
 *   B. Market DOM (`marketDom`) — from the day the property is on market (`marketClockStart`: the later of
 *      OnMarketDate and ActivationDate — Coming Soon days are not market days) until the listing CLOSES (the
 *      CloseDate of a Sold / Rented row) or is REMOVED (the OffMarketDate of a Withdrawn / Canceled / Expired / Hold
 *      row), else until the row left the feed (Off Market), else until the as-of day while it is still on the market
 *      (Active / ActiveUnderContract / Pending). NEVER PurchaseContractDate (owner ruling, Maya 2026-09-08 evening):
 *      a signed contract keeps the listing on the market until it closes. A row with no on-market date, a closed row
 *      with no CloseDate, or a removal with no OffMarketDate has NO market DOM: nothing is derived from
 *      ListingContractDate, the entry time, the contract, or a Mallan created_at. The dates are live Cotality
 *      Property fields (lib/cotality/generated/contract.ts); UCBA is the compliance source only.
 *
 *   Contract signed (`contractSignedDate`, `inContractSince`) — a separate FACT, never the clock's end. Proven live
 *   2026-09-08 (docs/operations/evidence-2026-09-08/dom/):
 *     Sale   PurchaseContractDate on a Pending / Closed row. REBNY's required input for Pending is "Purchase Contract
 *            Signed Date" (data/UCBA-2026-Requirements.md); the field is on 100 % of Pending sales, equals
 *            ContractStatusChangeDate on 94 %, and precedes CloseDate by a median 83 days. On an ACTIVE row it is not
 *            a signed contract: 178 live Active rows carry one (92 predate a BackOnMarketDate — a fallen contract;
 *            80 are stale entries with no status change), and ContingentDate is populated on 0 rows.
 *     Rental PurchaseContractDate on a Pending / Closed row (97.7 % of Pending rentals; equals
 *            ContractStatusChangeDate on 99.4 %), else the Leased date (CloseDate — REBNY's "Sold or Leased Date")
 *            on a Closed row. Whether a Pending rental's PurchaseContractDate is the lease signing or the
 *            application acceptance is UNVERIFIED (REBNY input semantics); it is the only contract event delivered.
 *     PendingTimestamp is the status-change timestamp and is never a contract date. The provider's DaysOnMarket and
 *     CumulativeDaysOnMarket are null on every sampled row of this feed and are never read.
 *
 *   The stored-column clock (`computeDomTransition` / `getCurrentDom` without a lifecycle) applies the same rule to
 *   Mallan-authored rows that carry no provider dates: the clock runs while Active, ActiveUnderContract or Pending
 *   (on the market) and freezes at a removal or resets at the close.
 *   `lib/compliance/rebny-ucba-rules.ts` domRules is DERIVED from the exports below; no second rule table exists.
 *
 * UCBA 2026 rules (Art. I, Sec. 11) carried by the stored-column clock (compliance source only):
 *   - DOM accrues while the listing is on the market: Active, ActiveUnderContract, Pending
 *   - DOM does NOT accrue during ComingSoon, Withdrawn, Cancelled, Expired
 *   - DOM does NOT accrue while the listing is participant-only
 *     (even if status is Active) — UCBA 2026 explicit carve-out
 *   - If listing is in Withdrawn/Cancelled for >= 30 consecutive days,
 *     DOM resets to 0 upon reactivation
 *   - If < 30 days in Withdrawn/Cancelled, DOM resumes where it left off
 *   - DOM resets to zero on close (sold/rented) — the third reset trigger;
 *     historical exposure is retained in `cumulative_days_on_market`
 *   - Cannot circumvent by re-naming or re-listing
 *
 * PROVIDER VOCABULARY DOES NOT BELONG IN THIS FILE.
 * ------------------------------------------------
 * Cotality `Permission` is `Collection(Multi.ListingPermission)`, serialized
 * comma-joined on the wire (live examples: `IDX,OfficeInactive`,
 * `IDX,SyndicateOptOut`). It is parsed EXACTLY ONCE, at the provider boundary:
 *
 *     Permission
 *       -> enumValueTokens('Permission', raw.Permission)   [lib/cotality/live-contract.ts]
 *       -> permissionTokens.includes('Private')            [lib/idx/trestle-mapper.ts]
 *       -> listings.participant_only : boolean             [canonical Mallan fact]
 *
 * DOM consumes that typed boolean and nothing else. It previously took a raw
 * `permissions: string` and re-interpreted provider tokens with an exact-match
 * Set, which (a) could never match a multi-value value such as `IDX,Private`
 * and (b) was fed from `listing.compliance.Permissions`, a key present on 0 of
 * 26,497 production rows. Both were symptoms of one defect: the wrong
 * representation crossing this boundary. See
 * `__tests__/dom-canonical-permission.test.ts`, which fails if provider
 * vocabulary reappears here.
 */

import type { ContractEvents, ListingLifecycle } from "@/lib/listings/canonical-lifecycle";
import { normalizeStoredStatus } from "@/lib/listings/mallan-status";

/** Number of consecutive days in Withdrawn/Cancelled before DOM resets */
export const DOM_RESET_DAYS = 30;

/**
 * Statuses where the market clock runs (subject to the participant-only carve-out): the listing is on the market
 * until it closes or is removed. Pending (the CRM "Contract Signed") keeps accruing — the market clock ends at the
 * CloseDate of a Sold / Rented listing or at the OffMarketDate of a removal, never at PurchaseContractDate (owner
 * ruling, Maya 2026-09-08 evening). THE accrual set — every rule table derives from it.
 */
export const DOM_ACCRUING_STATUSES: ReadonlySet<string> = new Set(["Active", "ActiveUnderContract", "Pending"]);

/**
 * Statuses that can trigger a DOM reset after DOM_RESET_DAYS (UCBA Art. I §11: Withdrawn / Canceled only; Hold
 * pauses). Live StandardStatus tokens (one-L Canceled); a legacy 'Cancelled' row is normalized before the check.
 */
export const DOM_RESET_ELIGIBLE_STATUSES: ReadonlySet<string> = new Set(["Withdrawn", "Canceled"]);

// ── The two clocks ──────────────────────────────────────────────────────────────────────────────────────────

const dayStr = (v: Date | string): string => (typeof v === "string" ? v.slice(0, 10) : v.toISOString().slice(0, 10));
/** Whole days from a to b (YYYY-MM-DD, UTC); negative when b precedes a. */
const daysBetween = (a: string, b: string): number => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
/** Provider stages whose market clock is still running (on the market until it closes or is removed). */
const RUNNING_STAGES: ReadonlySet<string> = new Set(["active", "coming_soon", "in_contract"]);

/**
 * THE contract-signed date (see the file header for the live proof). Null unless the provider stage confirms a
 * contract (in_contract / closed) AND the exact field is delivered — never PendingTimestamp, never a closing on a
 * sale, never a date on an Active row.
 */
export function contractSignedDate(l: Pick<ListingLifecycle, "providerStage" | "transactionType" | "contractEvents">): string | null {
  const ev = l.contractEvents;
  if (l.providerStage !== "in_contract" && l.providerStage !== "closed") return null;
  if (ev.purchaseContractDate) return ev.purchaseContractDate;
  if (l.transactionType === "rental" && l.providerStage === "closed") return ev.closeDate;
  return null;
}

/**
 * The day the property is on market: the later of OnMarketDate and ActivationDate (REBNY's First Showing Date).
 * A listing entered as Coming Soon carries an OnMarketDate days before its activation — those days are not market
 * days (UCBA Art. I §11 / §16; Maya: a separate clock); a back-dated First Showing Date yields the entry day.
 * Null when neither is delivered — never ListingContractDate, the entry time, or a Mallan created_at.
 */
export function marketClockStart(ev: ContractEvents): string | null {
  const a = ev.onMarketDate;
  const b = ev.activationDate;
  if (a && b) return a > b ? a : b;
  return a ?? b ?? null;
}

/**
 * How the market clock ended: `closed` = the CloseDate of a Sold / Rented listing; `off_market` = the OffMarketDate
 * of a removal (Withdrawn / Canceled / Expired / Hold); `off_feed` = the day the row left the feed (the Mallan Off
 * Market state); `as_of` = still on the market (Active / ActiveUnderContract / Pending / Coming Soon activation).
 */
export type MarketDomEnd = "closed" | "off_market" | "off_feed" | "as_of";
export interface MarketDom {
  start: string | null;
  end: string | null;
  endReason: MarketDomEnd | null;
  /** Whole days from start to end, clamped at 0; null when either end is not verified. */
  days: number | null;
  /** Why no clock could be computed; null when `days` is a number. */
  unverified: string | null;
}

/** Provider stages that are a removal from the market: the OffMarketDate is the verified end. */
const REMOVAL_STAGES: ReadonlySet<string> = new Set(["withdrawn", "cancelled", "expired", "temp_off_market"]);

/**
 * Market DOM (owner ruling, Maya 2026-09-08 evening): on market → the CloseDate of a Sold / Rented listing, or → the
 * OffMarketDate of a removal, or → the day the row left the feed (Off Market), or → the as-of day while it is still on
 * the market. NEVER PurchaseContractDate: a signed contract (Pending) keeps the listing on the market until it closes.
 * A closed row without a CloseDate, or a removal without an OffMarketDate, has NO market DOM — nothing is guessed.
 */
export function marketDom(l: ListingLifecycle, asOf: Date | string): MarketDom {
  const start = marketClockStart(l.contractEvents);
  if (!start) return { start: null, end: null, endReason: null, days: null, unverified: "no on-market date delivered (OnMarketDate / ActivationDate)" };
  const ev = l.contractEvents;
  let end: string | null = null;
  let endReason: MarketDomEnd | null = null;
  let why: string | null = null;
  if (l.providerStage === "closed") {
    if (ev.closeDate) { end = ev.closeDate; endReason = "closed"; }
    else why = "no CloseDate delivered on a closed row";
  } else if (REMOVAL_STAGES.has(l.providerStage)) {
    if (ev.offMarketDate) { end = ev.offMarketDate; endReason = "off_market"; }
    else why = `no OffMarketDate delivered on a ${l.providerStage} row`;
  } else if (l.presence === "off_feed" && l.offFeedSince) {
    end = l.offFeedSince; endReason = "off_feed";
  } else if (RUNNING_STAGES.has(l.providerStage)) {
    end = dayStr(asOf); endReason = "as_of";
  } else {
    why = `no verified end for stage ${l.providerStage}`;
  }
  if (!end) return { start, end: null, endReason: null, days: null, unverified: why ?? `no verified end for stage ${l.providerStage}` };
  return { start, end, endReason, days: Math.max(0, daysBetween(start, end)), unverified: null };
}

export interface ComingSoonDom {
  /** The day the status became Coming Soon (ContractStatusChangeDate, else the entry day, else OnMarketDate). */
  start: string | null;
  /** ActivationDate — the First Showing Date. */
  activation: string | null;
  days: number | null;
  /** Days from the as-of day to activation; negative once activation is overdue. */
  daysUntilActivation: number | null;
  /** UCBA Art. I §16: a Coming Soon listing may run at most 14 days. */
  exceedsFourteenDays: boolean;
}

/** Coming Soon DOM — the separate pre-market clock; null for every other stage. */
export function comingSoonDom(l: ListingLifecycle, asOf: Date | string): ComingSoonDom | null {
  if (l.providerStage !== "coming_soon") return null;
  const ev = l.contractEvents;
  const asOfDay = dayStr(asOf);
  const start = ev.contractStatusChangeDate ?? ev.originalEntryDate ?? ev.onMarketDate ?? null;
  const activation = ev.activationDate;
  const days = start ? Math.max(0, daysBetween(start, asOfDay)) : null;
  return {
    start,
    activation,
    days,
    daysUntilActivation: activation ? daysBetween(asOfDay, activation) : null,
    exceedsFourteenDays: days !== null && days > 14,
  };
}

/**
 * Transaction-close statuses. UCBA 2026 Art. I §11 resets DOM to zero on
 * sold/rented (Closed). `Closed` is the canonical Cotality StandardStatus
 * member; `Sold`/`Rented` are retained because Mallan storage statuses use them
 * for CRM-authored listings.
 */
const CLOSE_STATUSES = new Set(["Closed", "Sold", "Rented", "Leased"]); // the provider token + the legacy spellings

type ListingDomFields = {
  status: string;
  /**
   * Canonical Mallan visibility fact (`listings.participant_only`). UCBA 2026
   * carve-out: a participant-only listing accrues no DOM even while Active.
   * NOT a provider string — see the file header.
   */
  participant_only?: boolean | null;
  status_changed_at: Date | null;
  first_active_date: Date | null;
  days_on_market: number;
};

/**
 * Check if a listing has been in Withdrawn/Cancelled for >= 30 days
 * and should have its DOM reset upon reactivation.
 */
export function shouldResetDom(listing: ListingDomFields): boolean {
  if (!DOM_RESET_ELIGIBLE_STATUSES.has(normalizeStoredStatus(listing.status) ?? listing.status)) return false;
  if (!listing.status_changed_at) return false;

  const now = new Date();
  const elapsed = Math.floor(
    (now.getTime() - listing.status_changed_at.getTime()) / (1000 * 60 * 60 * 24)
  );
  return elapsed >= DOM_RESET_DAYS;
}

/**
 * Check if DOM accrual is suppressed by the listing's visibility.
 *
 * UCBA 2026 Art. I §11: a participant-only listing does not accrue DOM even
 * while Active. ComingSoon suppression is handled on the STATUS axis
 * (`DOM_ACCRUING_STATUSES`) — status and permission are separate axes and must
 * not be collapsed.
 *
 * Takes the canonical typed fact, never a provider string.
 */
export function isDomSuppressedByVisibility(
  participantOnly: boolean | null | undefined
): boolean {
  return participantOnly === true;
}

/**
 * Compute DOM update fields for a status transition.
 * Returns partial update data to spread into a Prisma update.
 *
 * Visibility-aware: a participant-only listing does not accrue DOM even if
 * status is Active. `newParticipantOnly` is the canonical post-transition
 * value; when omitted the listing's current value carries forward.
 */
export function computeDomTransition(
  listing: ListingDomFields,
  newStatus: string,
  newParticipantOnly?: boolean | null
): {
  status_changed_at: Date;
  first_active_date: Date | null;
  days_on_market: number;
  cumulative_days_on_market: number;
} {
  const now = new Date();
  const isActivating = DOM_ACCRUING_STATUSES.has(newStatus);
  const wasAccruing =
    DOM_ACCRUING_STATUSES.has(listing.status) &&
    !isDomSuppressedByVisibility(listing.participant_only);

  // If activating but the listing is participant-only, treat as non-accruing
  const effectivelyActivating =
    isActivating &&
    !isDomSuppressedByVisibility(newParticipantOnly ?? listing.participant_only);

  // Snapshot current DOM before transition (if was accruing)
  let currentDom = listing.days_on_market;
  if (wasAccruing && listing.status_changed_at) {
    const elapsed = Math.floor(
      (now.getTime() - listing.status_changed_at.getTime()) / (1000 * 60 * 60 * 24)
    );
    currentDom = listing.days_on_market + elapsed;
  }

  // Determine if DOM resets
  let resetDom = false;
  if (effectivelyActivating && shouldResetDom(listing)) {
    resetDom = true;
  }

  // Close: the RLS DOM clock RESETS to zero. UCBA 2026 Art. I §11 lists three
  // reset triggers — 30 days Withdrawn, 30 days Cancelled, and sold/rented
  // (Closed). See data/UCBA-2026-Requirements.md:14-16. This branch previously
  // FROZE DOM at its accrued value, which is the opposite of the rule.
  //
  // `cumulative_days_on_market` retains the historical market exposure for
  // Mallan comps/reporting. That retention is Mallan's reporting layer, not a
  // REBNY mandate — REBNY's explicit reset rule speaks to DOM.
  //
  // "Closed" is the canonical Cotality StandardStatus member and is the status
  // production actually carries (6,100 rows; 0 in Sold/Rented as of the
  // 2026-09-07 census), so it must be first-class here rather than falling
  // through to the generic non-accruing return below.
  if (CLOSE_STATUSES.has(newStatus)) {
    return {
      status_changed_at: now,
      first_active_date: listing.first_active_date,
      days_on_market: 0,
      cumulative_days_on_market: currentDom,
    };
  }

  if (effectivelyActivating) {
    return {
      status_changed_at: now,
      first_active_date: resetDom ? now : (listing.first_active_date ?? now),
      days_on_market: resetDom ? 0 : currentDom,
      cumulative_days_on_market: currentDom, // cumulative never resets
    };
  }

  // Moving to non-accruing status (Withdrawn, Cancelled, Expired, ComingSoon,
  // or Active with DOM-suppressing permissions like Participant Only Network)
  return {
    status_changed_at: now,
    first_active_date: listing.first_active_date,
    days_on_market: currentDom, // freeze at current value
    cumulative_days_on_market: currentDom,
  };
}

/**
 * Read-path DOM for display (dashboards, cards, public pages).
 *
 * With `opts.lifecycle` (lib/listings/canonical-lifecycle.ts) the provider-dated market clock is returned whenever
 * the row carries the contract-event dates (`marketDom`); the stored-column accrual below is the fallback for
 * Mallan-authored rows that carry none. Honors:
 *   - Stored `days_on_market` as the accumulated base
 *   - Adds elapsed time since `status_changed_at` ONLY if currently accruing
 *   - Suppresses accrual during ComingSoon / Withdrawn / Cancelled / Expired
 *   - Suppresses accrual when the listing is participant-only (typed
 *     `listings.participant_only` — never a provider permission string)
 *   - Freezes at stored value once Sold / Rented / Closed
 *
 * Use this instead of naive (now - created_at) math. That math:
 *   (a) never resets after 30 days Withdrawn/Cancelled (UCBA Art. I §11 violation)
 *   (b) continues accruing during ComingSoon (UCBA D1/D2 violation)
 *   (c) continues accruing on participant-only listings (UCBA 2026 carve-out)
 */
export function getCurrentDom(listing: ListingDomFields, opts?: { lifecycle?: ListingLifecycle; asOf?: Date | string }): number {
  if (opts?.lifecycle) {
    const m = marketDom(opts.lifecycle, opts.asOf ?? new Date());
    if (m.days !== null) return m.days;
  }
  const stored = listing.days_on_market || 0;

  // Not accruing → return stored snapshot
  if (!DOM_ACCRUING_STATUSES.has(listing.status)) return stored;
  if (isDomSuppressedByVisibility(listing.participant_only)) return stored;
  if (!listing.status_changed_at) return stored;

  // Accruing → add elapsed since last transition
  const elapsed = Math.floor(
    (Date.now() - listing.status_changed_at.getTime()) / (1000 * 60 * 60 * 24)
  );
  return Math.max(0, stored + elapsed);
}
