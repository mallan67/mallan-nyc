// lib/email/campaign-confirmation.ts
// Server-side enforcement of the "figures confirmed against the lease" gate for
// listing campaigns. Dry-run, test, schedule, and live sends are all blocked
// until the authenticated agent confirms the listing economics are current — AND
// the confirmation is bound to the exact values via a fingerprint, so editing any
// economic field after confirming automatically invalidates it (fail-closed).
//
// The checkbox is NOT a substitute for accurate data: it is an attestation that
// the agent personally checked the lease + listing record, captured in the audit
// trail (who / when / what values / effective dates / source reference).
//
// Pure + I/O-free so it unit-tests directly (see campaign-confirmation.test.ts).

import { createHash } from "crypto";

/** Economic fields whose change must invalidate a prior confirmation. */
export interface EconomicsForConfirmation {
  currentRent?: string | null;
  scheduledRent?: string | null;
  scheduledRentEffective?: string | null;
  maintenance?: string | null;
  leaseExpiration?: string | null;
}

const FIELDS = [
  "currentRent",
  "scheduledRent",
  "scheduledRentEffective",
  "maintenance",
  "leaseExpiration",
] as const;

export const CONFIRMATION_TEXT =
  "I reviewed the current lease, rent schedule, maintenance and lease expiration " +
  "for this listing and confirm that the figures shown are current as of today.";

export const CONFIRMATION_REQUIRED_MESSAGE =
  "Economics confirmation required — confirm the figures are current against the " +
  "lease and listing record before sending or scheduling.";

export const CONFIRMATION_STALE_MESSAGE =
  "The listing economics changed since they were confirmed. Re-review the figures " +
  "and confirm again before sending.";

/**
 * Deterministic fingerprint of the confirm-able economics for one listing. Uses
 * the RAW trimmed strings (not parsed numbers) so ANY textual edit — including a
 * re-typed lease date or a changed rent — produces a different fingerprint and
 * therefore clears a prior confirmation.
 */
export function economicsFingerprint(listingId: string, e: EconomicsForConfirmation): string {
  const norm: Record<string, string> = {};
  for (const f of FIELDS) {
    const v = e[f];
    norm[f] = typeof v === "string" ? v.trim() : "";
  }
  const canonical = JSON.stringify({ listing_id: String(listingId || ""), ...norm });
  return createHash("sha256").update(canonical).digest("hex");
}

export interface ConfirmationInput {
  confirmed?: unknown;
  fingerprint?: unknown;
  confirmedAt?: unknown;
  sourceRef?: unknown;
}

export type ConfirmationResult =
  | { ok: true; confirmedAt: string; sourceRef: string | null }
  | { ok: false; code: "confirmation_required" | "confirmation_stale"; message: string };

/**
 * Validate a confirmation payload against the server-recomputed fingerprint.
 * `expectedFingerprint` is derived from the CURRENT submitted economics, so a
 * stale confirmation (values edited after ticking the box) fails closed.
 */
export function validateConfirmation(raw: unknown, expectedFingerprint: string): ConfirmationResult {
  const c: ConfirmationInput = raw && typeof raw === "object" ? (raw as ConfirmationInput) : {};
  if (c.confirmed !== true) {
    return { ok: false, code: "confirmation_required", message: CONFIRMATION_REQUIRED_MESSAGE };
  }
  if (typeof c.fingerprint !== "string" || c.fingerprint !== expectedFingerprint) {
    return { ok: false, code: "confirmation_stale", message: CONFIRMATION_STALE_MESSAGE };
  }
  const confirmedAt =
    typeof c.confirmedAt === "string" && c.confirmedAt.trim()
      ? c.confirmedAt.trim()
      : new Date().toISOString();
  const sourceRef =
    typeof c.sourceRef === "string" && c.sourceRef.trim() ? c.sourceRef.trim() : null;
  return { ok: true, confirmedAt, sourceRef };
}

/**
 * Build the JSON payload stored on the `email:economics_confirmed` audit row:
 * who confirmed, when, which values, the effective dates, and any source/document
 * reference the agent supplied.
 */
export function buildConfirmationAudit(opts: {
  userId: number | string;
  listingId: string;
  economics: EconomicsForConfirmation;
  fingerprint: string;
  confirmedAt: string;
  sourceRef: string | null;
}) {
  return {
    confirmed_by: opts.userId,
    confirmed_at: opts.confirmedAt,
    listing_id: opts.listingId,
    values_confirmed: {
      currentRent: opts.economics.currentRent ?? null,
      scheduledRent: opts.economics.scheduledRent ?? null,
      maintenance: opts.economics.maintenance ?? null,
      leaseExpiration: opts.economics.leaseExpiration ?? null,
    },
    effective_dates: {
      scheduledRentEffective: opts.economics.scheduledRentEffective ?? null,
      leaseExpiration: opts.economics.leaseExpiration ?? null,
    },
    source_reference: opts.sourceRef,
    economics_fingerprint: opts.fingerprint,
    confirmation_text: CONFIRMATION_TEXT,
  };
}
