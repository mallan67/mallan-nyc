// lib/email/listing-economics.ts
// Pure, testable resolution of a listing's rent economics for the investor
// campaign email + the compose-screen Calculated Investment Summary.
//
// WHY THIS EXISTS — a listing can have an in-place rent AND a *future* scheduled
// rent (a step-up written into the current lease). The email must NEVER label a
// scheduled rent as "current" before its effective date. This resolver takes the
// raw compose values plus an `asOf` date and returns figures pre-labeled with the
// correct temporal framing, so the template renders truth by construction and a
// test can pin the rule (see listing-economics.test.ts).
//
// It is I/O-free — the route parses the compose fields, calls this, and renders.

import { parseMoney } from "./investment-metrics";

export interface ListingEconomicsInput {
  /** Verified in-place rent today (may be blank until the agent confirms it). */
  currentRent?: string | null;
  /** A future scheduled rent written into the current lease, if any. */
  scheduledRent?: string | null;
  /** Effective date of the scheduled rent ("2026-08-15" or "August 15, 2026"). */
  scheduledRentEffective?: string | null;
  /** Monthly maintenance / common charges. */
  maintenance?: string | null;
  /** Lease expiration ("August 14, 2027" or ISO). */
  leaseExpiration?: string | null;
  /** Evaluation date — defaults to now; tests pass a fixed date. */
  asOf?: Date;
}

export interface ResolvedEconomics {
  /** Display value for the CURRENT in-place rent (never a future amount). */
  currentRentValue: string | null;
  /** Future scheduled rent, shown under its own dated label only. */
  scheduledRent: string | null;
  /** Effective date parsed, or null. */
  scheduledRentEffective: Date | null;
  /** Human label of the effective date ("August 15, 2026"), or null. */
  scheduledEffectiveLabel: string | null;
  /** True once asOf has reached the effective date (scheduled has become current). */
  scheduledIsEffective: boolean;
  /** True when there is a distinct FUTURE scheduled rent to show separately. */
  showScheduledSeparately: boolean;
  /** Monthly rent used for the illustrative cap-rate / NOI math, or null. */
  analysisRent: number | null;
  /**
   * Short basis chip for the figures band ("In-Place Rent" | "Scheduled Rent").
   * Non-null only when analysisRent is set.
   */
  analysisRentShort: string | null;
  /**
   * Full basis note for the cap-rate footnote
   * ("current in-place rent" | "scheduled rent effective August 15, 2026").
   */
  analysisRentBasis: string | null;
  maintenance: string | null;
  leaseExpiration: string | null;
}

/** Parse a loose date string to a calendar-day UTC Date, or null. */
function parseDay(v: string | null | undefined): Date | null {
  if (!v || typeof v !== "string" || !v.trim()) return null;
  const t = Date.parse(v.trim());
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  // Normalize to UTC calendar day so month-apart comparisons are TZ-stable.
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function dayNumber(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function formatDay(d: Date): string {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

export function resolveListingEconomics(input: ListingEconomicsInput): ResolvedEconomics {
  const asOf = input.asOf ?? new Date();
  const currentRentRaw = strOrNull(input.currentRent);
  const scheduledRentRaw = strOrNull(input.scheduledRent);
  const eff = parseDay(input.scheduledRentEffective ?? null);
  const effLabel = eff ? formatDay(eff) : null;
  const scheduledIsEffective = eff != null && dayNumber(asOf) >= dayNumber(eff);

  // A scheduled rent is shown separately ONLY while it is still in the future.
  // Once effective, it silently becomes the current in-place rent.
  const hasFutureScheduled = scheduledRentRaw != null && eff != null && !scheduledIsEffective;

  let currentRentValue: string | null;
  let analysisRentSource: string | null;
  let analysisRentShort: string | null;
  let analysisRentBasis: string | null;

  if (hasFutureScheduled) {
    // Future step-up: current stays whatever the agent verified (may be blank);
    // the $X scheduled figure is NEVER presented as "current" here.
    currentRentValue = currentRentRaw;
    if (currentRentRaw != null) {
      analysisRentSource = currentRentRaw;
      analysisRentShort = "In-Place Rent";
      analysisRentBasis = "current in-place rent";
    } else {
      // No verified current rent yet — the illustrative yield is on the scheduled
      // rent, and it is labeled as such so nothing reads as a current figure.
      analysisRentSource = scheduledRentRaw;
      analysisRentShort = "Scheduled Rent";
      analysisRentBasis = effLabel ? `scheduled rent effective ${effLabel}` : "scheduled rent";
    }
  } else if (scheduledRentRaw != null && eff != null && scheduledIsEffective) {
    // The scheduled rent has taken effect — it is now the current in-place rent.
    currentRentValue = scheduledRentRaw;
    analysisRentSource = scheduledRentRaw;
    analysisRentShort = "In-Place Rent";
    analysisRentBasis = "current in-place rent";
  } else {
    // No scheduled rent (or no effective date) — current rent is the basis.
    currentRentValue = currentRentRaw ?? scheduledRentRaw;
    analysisRentSource = currentRentValue;
    analysisRentShort = currentRentValue != null ? "In-Place Rent" : null;
    analysisRentBasis = currentRentValue != null ? "current in-place rent" : null;
  }

  const analysisRent = parseMoney(analysisRentSource);
  return {
    currentRentValue,
    scheduledRent: hasFutureScheduled ? scheduledRentRaw : null,
    scheduledRentEffective: eff,
    scheduledEffectiveLabel: effLabel,
    scheduledIsEffective,
    showScheduledSeparately: hasFutureScheduled,
    analysisRent: analysisRent != null && analysisRent > 0 ? analysisRent : null,
    analysisRentShort: analysisRent != null && analysisRent > 0 ? analysisRentShort : null,
    analysisRentBasis: analysisRent != null && analysisRent > 0 ? analysisRentBasis : null,
    maintenance: strOrNull(input.maintenance),
    leaseExpiration: strOrNull(input.leaseExpiration),
  };
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
