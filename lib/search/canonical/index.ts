/**
 * Canonical Search / Intelligence Contract — single source of search truth, verified against
 * live Cotality (`data/cotality-enums.live.json`).
 *
 * Backend-Search-1: this package is ADDED but NOT WIRED into any reader. Existing
 * search/CRM/comps/projection/alert/CMA/UI code keeps its current behavior. Later per-surface PRs
 * swap readers onto these functions, each with a failing test that flips green. Nothing here
 * changes what any audience sees, and nothing here touches schema.
 *
 * It COMPOSES the merged Backend-Search-0 visibility contract (`../visibility-contract`) and the
 * existing compliance primitives (`../../compliance/gates`) — it never duplicates or re-encodes them.
 *
 * Fact vs policy: status/class/ownership/comp/registry functions are pure FACTS. Public display of
 * `pending_contract`, owner-opt-out signal resolution, and every `needs_probe` field are POLICY /
 * live-verification decisions deferred out of this PR.
 */

export * from './capability';
export * from './live-truth';
export * from './listing-class';
export * from './ownership';
export * from './status';
export * from './display-gate';
export * from './comp-eligibility';
export * from './sort';
export * from './filter-keys';
export * from './attribution';
export * from './field-registry';
export * from './reserved-dimensions';
// A1 — pure canonical dimensions (Backend-Search Lane A / A1; NOT WIRED).
// Extensions live in the modules above: EvidenceClassification → ./comp-eligibility,
// AttributionEnvelope → ./attribution, SourcePermissionCapabilities → ./capability.
export * from './contract-decision';
export * from './source-provenance';
export * from './inventory-scope';
export * from './record-status';
export * from './identity';
