/**
 * inventory-scope.ts — canonical inventory-scope dimension + audience gate (PURE, A1).
 *
 * The scope a search runs in. Some scopes are PRIVATE (agent/broker only); public
 * and client audiences fail closed on them. This module declares the vocabulary,
 * the private/non-private partition, and the AUDIENCE×SCOPE access matrix, and
 * returns typed `ContractDecision`s — it never returns HTTP or imports Next.js.
 *
 * Supplemental inventory is PRIVATE BY DEFAULT. `supplemental_only` access at the
 * agent level is scope-allowed, but EFFECTIVE access additionally requires an
 * approved source permission (`evaluateSourcePermission`, capability.ts) — the
 * scope gate alone never authorizes supplemental data.
 *
 * NOT WIRED: no runtime reader imports this in A1.
 */

import { type Audience } from '../visibility-contract';
import { contractOk, contractFail, type ContractDecision } from './contract-decision';

export const INVENTORY_SCOPES = Object.freeze([
  'public_inventory',
  'client_inventory',
  'agent_complete_inventory',
  'cotality_only',
  'mallan_exclusive',
  'supplemental_only',
  'missing_from_cotality',
  'verification_required',
  'source_conflicts',
] as const);
export type InventoryScope = (typeof INVENTORY_SCOPES)[number];

export function isInventoryScope(v: unknown): v is InventoryScope {
  return typeof v === 'string' && (INVENTORY_SCOPES as readonly string[]).includes(v);
}

/**
 * PRIVATE scopes — agent/broker only (analysis §5.1). Public/client requests for
 * any of these fail closed. `Record<InventoryScope, boolean>` → compile-time
 * completeness (a new scope must be classified). Note this is the coarse
 * "agent/broker-only" partition; the finer per-audience rules (e.g. public may
 * not see `client_inventory` though it is not agent-private) are in the matrix.
 */
const SCOPE_IS_PRIVATE: Readonly<Record<InventoryScope, boolean>> = Object.freeze({
  public_inventory: false,
  client_inventory: false,
  cotality_only: false,
  mallan_exclusive: false,
  agent_complete_inventory: true,
  supplemental_only: true,
  missing_from_cotality: true,
  verification_required: true,
  source_conflicts: true,
});

export function isPrivateInventoryScope(scope: InventoryScope): boolean {
  return SCOPE_IS_PRIVATE[scope];
}

export const PRIVATE_INVENTORY_SCOPES: readonly InventoryScope[] = Object.freeze(
  INVENTORY_SCOPES.filter((s) => SCOPE_IS_PRIVATE[s]),
);
export const NON_PRIVATE_INVENTORY_SCOPES: readonly InventoryScope[] = Object.freeze(
  INVENTORY_SCOPES.filter((s) => !SCOPE_IS_PRIVATE[s]),
);

/**
 * Per-audience scope access matrix (addendum §5 / required audience matrix).
 * "broker" is represented by 'agent'/'internal_report' (the codebase `Audience`
 * has no separate broker value). Compile-time complete: `Record` over
 * InventoryScope × `Record` over Audience.
 *
 * `mallan_exclusive` is allowed at the SCOPE layer for all audiences, but the
 * scope alone must NOT bypass display/ownership compliance — that is decided by
 * displayGate/resolveVisibility, not here.
 */
const AUDIENCE_SCOPE_ACCESS: Readonly<
  Record<InventoryScope, Readonly<Record<Audience, boolean>>>
> = Object.freeze({
  public_inventory: Object.freeze({ public: true, client: true, agent: true, internal_report: true }),
  cotality_only: Object.freeze({ public: true, client: true, agent: true, internal_report: true }),
  mallan_exclusive: Object.freeze({ public: true, client: true, agent: true, internal_report: true }),
  client_inventory: Object.freeze({ public: false, client: true, agent: true, internal_report: true }),
  agent_complete_inventory: Object.freeze({ public: false, client: false, agent: true, internal_report: true }),
  supplemental_only: Object.freeze({ public: false, client: false, agent: true, internal_report: true }),
  missing_from_cotality: Object.freeze({ public: false, client: false, agent: true, internal_report: true }),
  verification_required: Object.freeze({ public: false, client: false, agent: true, internal_report: true }),
  source_conflicts: Object.freeze({ public: false, client: false, agent: true, internal_report: true }),
});

/** Local audience validity check (mirrors visibility-contract `Audience`, compile-time bound). */
const AUDIENCE_KEYS: Readonly<Record<Audience, true>> = Object.freeze({
  public: true,
  client: true,
  agent: true,
  internal_report: true,
});
function isAudience(v: unknown): v is Audience {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(AUDIENCE_KEYS, v);
}

/**
 * Decide whether `audience` may query `scope`. PURE, fail-closed, typed. Unknown
 * audience/scope → INVALID_VALUE; unauthorized combination → UNAUTHORIZED_SCOPE.
 * This is the AUDIENCE×SCOPE gate ONLY — supplemental access additionally
 * requires `evaluateSourcePermission` (capability.ts), which is fail-closed.
 */
export function evaluateInventoryScopeAccess(audience: unknown, scope: unknown): ContractDecision {
  if (!isAudience(audience)) {
    return contractFail('INVALID_VALUE', 'unknown audience', 'audience');
  }
  if (!isInventoryScope(scope)) {
    return contractFail('INVALID_VALUE', 'unknown inventory scope', 'inventory_scope');
  }
  return AUDIENCE_SCOPE_ACCESS[scope][audience]
    ? contractOk()
    : contractFail(
        'UNAUTHORIZED_SCOPE',
        `audience '${audience}' may not access inventory scope '${scope}'`,
        'inventory_scope',
      );
}
