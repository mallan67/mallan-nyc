// THE canonical pipeline_stage contract.
//
// pipeline_stage is WORKFLOW POSITION — where a person sits in a buyer/seller/landlord/renter
// progression. It is NOT Lead.status, which is record/account lifecycle and access (see
// lib/auth/lead-access.ts). The two have been blurred across this codebase for a long time; they are
// deliberately kept apart here and nothing in this module reads or writes status.
//
// WHY THIS EXISTS. app/api/crm/clients/[id]/route.ts carried a route-local nine-value array while the
// shipped application writes thirty-three distinct stages. Anything outside the nine was dropped
// SILENTLY — `if (validStages.includes(stage)) update.pipeline_stage = stage;` with no else — so the
// route answered 200, the browser toasted "Advanced to Listed", local state moved, and the database never
// changed. Every rung of the Sales seller ladder past `listed`, eight of nine rungs of the Rentals
// landlord ladder, and every cross-role conversion stage behaved that way.
//
// THE SET BELOW IS DERIVED FROM CURRENT SHIPPED WRITERS AND READERS, not from prose specs, not from
// historical documents, and not from tests without a production writer. Provenance is recorded per group
// so a future reader can re-verify each token rather than trusting the list.
//
// WHAT THIS MODULE DELIBERATELY DOES NOT DO — consolidation is a separate, later business decision:
//   - `exclusive` (Sales) and `exclusive_signed` (Rentals) are NOT merged;
//   - `contract` and `deal` are NOT merged;
//   - `post_sale` and `past` are NOT merged;
//   - `active_tenant` and `current_tenant` are NOT merged.
// They look duplicative and they are not: the shipped application gives each a distinct workflow meaning
// in a distinct ladder. Merging them here would silently rewrite what an agent's click means.
//
// AND IT DOES NOT SPEAK FOR STORED DATA. The production census — SELECT status, pipeline_stage, COUNT(*)
// FROM leads GROUP BY 1,2 — remains OWED (refused). A value absent from this set is therefore NOT
// "invalid data"; it is a token this shipped source does not currently write. Readers must surface such
// rows as UNRECOGNIZED rather than relabel or discard them.

/** Generic CRM board — public/crm/js/dashboard/panels.js:9891-9900, app/api/crm/pipeline/route.ts:7. */
export const GENERIC_STAGES = [
  'new', 'contacted', 'nurturing', 'active', 'showing', 'offer', 'deal', 'closed', 'past',
] as const;

/** Sales seller ladder — panels/sales-crm/index.js STAGES (:45-54) and _wsAction order (:1226). */
export const SELLER_STAGES = [
  'prospect', 'pitching', 'exclusive', 'listed', 'showing', 'offer', 'contract', 'closed', 'post_sale',
] as const;

/** Rentals landlord ladder — panels/rentals-crm/index.js STAGES (:43-52) and _wsAction order (:1213). */
export const LANDLORD_STAGES = [
  'prospect', 'pitching', 'exclusive_signed', 'listed', 'showing', 'application', 'lease_out',
  'lease_signed', 'rented',
] as const;

/** Rentals tenant ladder — panels/rentals-crm/index.js TENANT_STAGES (:55-63). */
export const TENANT_STAGES = [
  'prospect', 'searching', 'showing', 'applied', 'approved', 'lease_signed', 'moved_in', 'active_tenant',
] as const;

/**
 * Cross-role stages written by SERVER conversion routes and by Address Book / Sales controls.
 * Provenance, each verified as a live writer:
 *   active_buyer      app/api/crm/convert/route.ts:300,314 · panels/sales-crm/index.js:1238
 *   active_renter     app/api/crm/convert/route.ts:332,337 · panels/sales-crm/index.js:1243
 *   active_seller     app/api/crm/convert/route.ts:249 · sales/prospects/[id]/convert/route.ts:92,121
 *   active_landlord   app/api/crm/convert/route.ts:249
 *   current_tenant    app/api/crm/convert/route.ts:359,372 · app/api/crm/rentals/tenants/route.ts:15
 *   viewed_not_rent   app/api/crm/rentals/prospects/route.ts:27,174
 *   analyzing         public/crm/js/dashboard/panels.js:2459
 *   referral          public/crm/js/dashboard/panels/sales-crm/index.js:1249
 *
 * NOTE: active_seller and active_landlord were absent from the authorising packet's token list. They are
 * included because the census found them written by live server routes — the packet directed that any
 * additional current source writer discovered be added rather than dropped.
 */
export const CROSS_ROLE_STAGES = [
  'active_buyer', 'active_renter', 'active_seller', 'active_landlord', 'current_tenant',
  'viewed_not_rent', 'analyzing', 'referral',
] as const;

/** The union. Every value the shipped application can currently write. */
export const CANONICAL_PIPELINE_STAGES: readonly string[] = Object.freeze(
  Array.from(
    new Set<string>([
      ...GENERIC_STAGES,
      ...SELLER_STAGES,
      ...LANDLORD_STAGES,
      ...TENANT_STAGES,
      ...CROSS_ROLE_STAGES,
    ])
  )
);

const STAGE_SET = new Set(CANONICAL_PIPELINE_STAGES);

/** Is this a stage the shipped application currently writes? Exact match — no coercion, no casing games. */
export function isCanonicalPipelineStage(stage: unknown): boolean {
  return typeof stage === 'string' && STAGE_SET.has(stage);
}

/**
 * How a reader should bucket a STORED value.
 *
 *  - a recognized token buckets as itself;
 *  - null / undefined / empty buckets as the legacy default, because an unset column genuinely means
 *    "not yet staged" and the schema default is "new";
 *  - ANY OTHER non-empty string is UNRECOGNIZED and must be surfaced as such.
 *
 * The last rule is the point. Mapping an unknown historic token to "new" would invent a workflow position
 * for a real person and hide the row from anyone auditing the data — and with the stored census still
 * unavailable, nobody yet knows how many such rows exist.
 */
export const UNRECOGNIZED_STAGE_BUCKET = 'unrecognized';
export const LEGACY_DEFAULT_STAGE = 'new';

export function bucketStoredStage(stage: unknown): string {
  if (stage === null || stage === undefined || stage === '') return LEGACY_DEFAULT_STAGE;
  if (isCanonicalPipelineStage(stage)) return String(stage);
  return UNRECOGNIZED_STAGE_BUCKET;
}
