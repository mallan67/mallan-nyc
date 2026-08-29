/**
 * The four Search workflows Mallan operates.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A LEAF ON PURPOSE.
 *
 * `field-registry.ts` imports the generated vocabulary's type, so anything the
 * generated file needs must sit BELOW both. This module imports nothing, which
 * keeps the workflow names nameable from either side without a cycle.
 *
 * These are Mallan product names, decided by the Master Plan — not provider
 * vocabulary. A workflow says WHICH criteria a broker may use in that context.
 * It never says what a criterion means, what values it accepts, how it maps to
 * Cotality, or whether it may execute: those are the registry's, the value
 * contract's, the mapping owners' and `executionReadiness()`'s answers
 * respectively.
 */
export const SEARCH_WORKFLOWS = ['sale', 'rental', 'building', 'comparable'] as const;

export type SearchWorkflow = (typeof SEARCH_WORKFLOWS)[number];
