/**
 * COMPLIANCE BY AUDIENCE — what a listing must satisfy to reach each visibility mode.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS CLOSES
 *
 * A Mallan-authored listing (`mls_id === null`) skipped the write-time
 * compliance gate entirely, because both mutation paths did this:
 *
 *     const isCrmCreated = !listing.mls_id;
 *     if (listing.rls_eligible && !isCrmCreated) { assertCompliantPayload(...) }
 *
 * The reasoning was "this listing is not distributed to the provider, so the
 * provider's field rules do not apply". That part is CORRECT. The problem is
 * that the Fair Housing content scan lives INSIDE that same function, so the
 * skip took the legal check with it.
 *
 * Fair Housing is not a provider rule. Federal FHA, NY State HRL and NYC HRL
 * bind an advertisement because it is an advertisement — whether it reaches the
 * public through a provider feed or through mallan.nyc directly. "We are not
 * syndicating it" is not a defence.
 *
 * On top of that, the surviving check ran ONCE, at create. Never on edit, never
 * at publication. So prohibited content introduced after create — or introduced
 * deliberately just before going live — reached the public unexamined.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MODEL
 *
 * Requirements attach to the AUDIENCE, not to whether a provider is involved:
 *
 *   INTERNAL_ONLY          Broker + assigned agent only. Nothing is advertised
 *                          to anyone, so public-advertising rules do not block a
 *                          private draft. Provider distribution rules certainly
 *                          do not.
 *
 *   PRIVATE_CLIENT         Shown to specific authenticated clients. Content a
 *                          client reads is subject to Fair Housing.
 *
 *   PUBLIC_WEB             A public advertisement. Fair Housing, address-display
 *                          permission, rental fee disclosure (NYC LL 119/2024),
 *                          and broker attribution all apply.
 *
 *   DISTRIBUTION_ELIGIBLE  Everything PUBLIC_WEB requires, plus the provider's
 *                          own distribution requirements — and those may only
 *                          come from the live-verified Cotality contract.
 *
 * Each level INCLUDES the level below it, so a rule cannot be lost by widening
 * the audience.
 */
import { scanRecordForFairHousing } from "@/lib/compliance/rls-enforcement";
import { checkFeeDisclosure } from "@/lib/crm/fee-disclosure";
import type { VisibilityMode } from "@/lib/crm/publication-state";

export interface PublicationComplianceFailure {
  code: string;
  field?: string;
  message: string;
  /** The narrowest audience at which this requirement begins to apply. */
  appliesFrom: VisibilityMode;
}

export interface PublicationComplianceResult {
  passed: boolean;
  audience: VisibilityMode;
  failures: PublicationComplianceFailure[];
  /**
   * Requirements that could NOT be evaluated. Never silently treated as passes —
   * an unevaluated requirement blocks, the same way an unknown status is not
   * displayable.
   */
  unevaluated: string[];
}

/** The listing facts these rules read. Deliberately small and explicit. */
export interface PublicationComplianceInput {
  listing_type?: string | null;
  /** Free-text fields that constitute the advertisement. */
  text: Record<string, string | null | undefined>;
  /** Saved provider/CRM payload — the source for fee-disclosure fields. */
  rawData?: Record<string, unknown> | null;
  /** Whether the address may be shown publicly. */
  addressDisplayable?: boolean | null;
  /** Broker attribution required on every public advertisement (NY DOS §175.25). */
  brokerAttribution?: string | null;
}

/** Audience ordering, narrowest first. Each level inherits the previous. */
const AUDIENCE_ORDER: VisibilityMode[] = [
  "INTERNAL_ONLY",
  "PRIVATE_CLIENT",
  "PUBLIC_WEB",
  "DISTRIBUTION_ELIGIBLE",
];

function reaches(audience: VisibilityMode, level: VisibilityMode): boolean {
  return AUDIENCE_ORDER.indexOf(audience) >= AUDIENCE_ORDER.indexOf(level);
}

/**
 * Evaluate the requirements for a target audience.
 *
 * PURE — no I/O. The caller loads the listing and decides what to do with the
 * verdict, which keeps the whole matrix directly testable.
 */
export function evaluatePublicationCompliance(
  input: PublicationComplianceInput,
  audience: VisibilityMode,
): PublicationComplianceResult {
  const failures: PublicationComplianceFailure[] = [];
  const unevaluated: string[] = [];

  // ── PRIVATE_CLIENT and wider: Fair Housing ────────────────────────────────
  //
  // Scanned here directly rather than through the provider-payload validator,
  // precisely because that validator is skipped for Mallan-authored rows. The
  // law does not care which pipe the words travel down.
  if (reaches(audience, "PRIVATE_CLIENT")) {
    for (const issue of scanRecordForFairHousing(input.text)) {
      failures.push({
        code: issue.code,
        field: issue.field,
        message: issue.message,
        appliesFrom: "PRIVATE_CLIENT",
      });
    }
  }

  // ── PUBLIC_WEB and wider: public-advertising requirements ─────────────────
  if (reaches(audience, "PUBLIC_WEB")) {
    // Address display permission. `false` blocks; `null`/undefined means we do
    // not know, and an unknown permission is not a permission.
    if (input.addressDisplayable === false) {
      failures.push({
        code: "ADDR-001",
        field: "address",
        message:
          "The address may not be displayed publicly for this listing. Publish without the address or resolve the display permission.",
        appliesFrom: "PUBLIC_WEB",
      });
    } else if (input.addressDisplayable == null) {
      unevaluated.push("address display permission was not supplied");
    }

    // Broker attribution — NY DOS 19 NYCRR §175.25 requires the brokerage to be
    // identified in every advertisement.
    if (!input.brokerAttribution || !String(input.brokerAttribution).trim()) {
      failures.push({
        code: "ATTR-001",
        field: "brokerAttribution",
        message:
          "A public advertisement must identify the brokerage (NY DOS 19 NYCRR 175.25).",
        appliesFrom: "PUBLIC_WEB",
      });
    }

    // FARE Act fee disclosure — rentals only (NYC LL 119/2024).
    if ((input.listing_type ?? "") === "rent") {
      const fee = checkFeeDisclosure(input.rawData ?? {});
      if (!fee.ok) {
        failures.push({
          code: "FARE_FEE_DISCLOSURE",
          field: "MoveInCostsAmount",
          message: fee.reason ?? "Rental fee disclosure is incomplete.",
          appliesFrom: "PUBLIC_WEB",
        });
      }
    }
  }

  // ── DISTRIBUTION_ELIGIBLE: provider distribution requirements ─────────────
  //
  // NOT EVALUATED, AND THEREFORE BLOCKING. Cotality is the only provider
  // authority, its distribution requirements must come from the live-verified
  // contract, and Mallan has no authorized outbound distribution today. So
  // there is nothing truthful to evaluate against — and an unevaluated
  // requirement is not a passed one.
  //
  // This is deliberately NOT a silent pass. A listing cannot reach
  // DISTRIBUTION_ELIGIBLE through this evaluator, which matches the fact that
  // it cannot reach EXPORTED without real delivery evidence either.
  if (reaches(audience, "DISTRIBUTION_ELIGIBLE")) {
    unevaluated.push(
      "Cotality distribution requirements cannot be evaluated: distribution is not activated and there is no live-verified distribution contract to check against",
    );
  }

  return {
    // Unevaluated requirements block. Treating "we could not check" as "it
    // passed" is the failure mode every gate in this codebase is built to avoid.
    passed: failures.length === 0 && unevaluated.length === 0,
    audience,
    failures,
    unevaluated,
  };
}

/**
 * The free-text fields that constitute the advertisement.
 *
 * Kept in one place so a new remark field cannot be added to the product and
 * silently escape the Fair Housing scan. `PrivateRemarks` and
 * `ShowingInstructions` are included: they are not public, but Fair Housing
 * applies to internal records too, and they are shown to other licensees.
 */
export const ADVERTISEMENT_TEXT_FIELDS = [
  "PublicRemarks",
  "PrivateRemarks",
  "ShowingInstructions",
  "SyndicationRemarks",
  "MarketingHeadline",
] as const;

/** Pull the advertisement text out of a saved listing payload. */
export function advertisementText(
  rawData: Record<string, unknown> | null | undefined,
): Record<string, string | null | undefined> {
  const out: Record<string, string | null | undefined> = {};
  const src = rawData ?? {};
  for (const field of ADVERTISEMENT_TEXT_FIELDS) {
    const v = (src as Record<string, unknown>)[field];
    out[field] = typeof v === "string" ? v : null;
  }
  return out;
}
