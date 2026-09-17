// lib/crm/listing-publish-contract.ts
//
// S-BE-006 — the success contract the CRM form/dashboard needs after a
// create/update/publish so it can explain Featured / Exclusive availability
// and surface the public + REBNY listing URLs. Returned alongside listing_id,
// status, publicUrl, rebnyListingUrl from the CRM listing write paths.
//
// Semantics are grounded in the existing model:
//   - Exclusive: a CRM-created listing is a Mallan Exclusive (the
//     listing_search_projection sets is_exclusive via isMallanExclusiveListing()
//     — SL-/RL- listing_id prefix OR rls_eligible === false, never agent_id). It
//     stays an active exclusive until it reaches a terminal status.
//   - Featured: the homepage Featured rail only shows publicly displayable,
//     live listings, so a listing is Featured-eligible once it is Active and
//     not display-suppressed (InternetEntireListingDisplayYN !== false).
//     A freshly created Draft is therefore exclusive-eligible but not yet
//     Featured-eligible.

import { TERMINAL_STATUSES, normalizeStandardStatus } from "@/lib/idx/trestle-mapper";

export type ListingPublishContract = {
  /** True when the listing can appear in the homepage Featured rail
   *  (Active + publicly displayable). */
  featuredEligible: boolean;
  /** True when the listing qualifies as a live Mallan Exclusive
   *  (CRM-created, not in a terminal status). */
  exclusiveEligible: boolean;
  /** Human-readable explanation the UI can show after publish. */
  eligibilityReason: string;
};

export function buildPublishContract(input: {
  status: string;
  /** RLS-eligibility reason from classifyRlsEligibility(). */
  rlsReason: string;
  internetEntireListingDisplayYN?: boolean | null;
  internetAddressDisplayYN?: boolean | null;
}): ListingPublishContract {
  const status = normalizeStandardStatus(String(input.status || ""));
  const isTerminal = TERMINAL_STATUSES.has(status);
  const isActive = status === "Active";
  // Display gates fail OPEN under the REBNY IDX Plus pre-filter: only an
  // explicit `false` suppresses display (see compliance gate §2.1).
  const entireDisplayable = input.internetEntireListingDisplayYN !== false;

  const exclusiveEligible = !isTerminal;
  const featuredEligible = isActive && entireDisplayable;

  const parts: string[] = [];
  parts.push(
    exclusiveEligible
      ? "Mallan exclusive (CRM-created)."
      : "Terminal status — no longer a live exclusive.",
  );
  if (featuredEligible) {
    parts.push("Eligible for Featured placement.");
  } else if (!isActive) {
    parts.push("Publish to Active to become eligible for Featured placement.");
  } else {
    parts.push("Display-suppressed — not eligible for Featured placement.");
  }
  if (input.rlsReason) parts.push(input.rlsReason);

  return {
    featuredEligible,
    exclusiveEligible,
    eligibilityReason: parts.join(" "),
  };
}
