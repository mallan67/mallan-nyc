/**
 * WHAT KIND OF THING a registry entry is, with respect to Search.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS REPLACES A RULE THAT RAN BACKWARDS.
 *
 * Canonical Search membership used to be "the entry declares `searchParams`" —
 * that is, a criterion was canonical because a URL parameter existed for it.
 * Section 4 exists to establish the opposite direction:
 *
 *     brokerage criterion -> canonical object -> validated transport
 *
 * and the old rule was wrong in BOTH directions at once:
 *
 *   EXCLUDED real brokerage criteria. `pets` and `furnished` are verified facts
 *   that CURRENT.md names for Rental Search, and the CRM has dedicated rental
 *   sections for them — but neither had a wire param, so neither reached
 *   `RentalCriteria`. Eleven verified `filterable: 'yes'` facts were invisible
 *   for this reason alone.
 *
 *   INCLUDED a transport artifact. `map_grid_filter` is a raw viewport
 *   predicate and an explicit legacy refusal — a map must translate geographic
 *   intent into canonical geographic criteria, not smuggle a grid string into
 *   Search. It had a wire param, so it was admitted to both SaleCriteria and
 *   RentalCriteria.
 *
 * A URL parameter is evidence of what was once built, never of what the
 * business means. `searchParams` is now transport METADATA hanging off an entry
 * whose membership was already decided here.
 */
export const CRITERION_ROLES = [
  /**
   * A criterion a broker supplies. These, and only these, form the canonical
   * Search vocabulary and the four workflow contracts.
   *
   * Capability is a SEPARATE axis: `maintenance_common_charge` is a real broker
   * control whose provider filter is unsupported today. Being in the contract
   * states what the product offers; `executionReadiness()` answers whether it
   * runs. Conflating them is what let unwired criteria disappear.
   */
  'broker_input',
  /**
   * Fixed by the workflow rather than chosen. Sale always searches the
   * Residential universe and Rental always ResidentialLease, so `listing_universe`
   * is not a control — offering it would let a broker contradict the workflow
   * they are already in.
   */
  'workflow_invariant',
  /**
   * A raw transport artifact that Search explicitly refuses. It keeps its entry
   * so the refusal stays documented and testable, but it is not criteria state
   * and never appears in a workflow contract.
   */
  'boundary_refusal',
  /**
   * A canonical fact that is not offered as a Search input — display-gate facts,
   * provider attribution, media permissions, engagement records. Real facts, not
   * broker questions.
   */
  'non_search_fact',
] as const;

export type CriterionRole = (typeof CRITERION_ROLES)[number];
