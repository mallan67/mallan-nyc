/**
 * display-gate.ts — canonical display gate (PURE), COMPOSED, never re-encoded.
 *
 * This gate does NOT invent a second visibility or permission rule. It COMPOSES:
 *   1. the merged audience/lifecycle/source decision  → `resolveVisibility` (visibility-contract.ts)
 *   2. the existing compliance-column primitive        → `affirmPermission` (lib/compliance/gates)
 *
 * The compliance columns mirror `lib/search/listing-access-decision.ts` SEARCH_DISPLAY_GATE
 * ({ idx_display_yn:true, owner_opt_out:false, participant_only:false,
 *    internet_entire_listing_display_yn:true }) and must stay in sync with it. They are a HARD
 * public-dissemination block; agent/internal viewing is governed by resolveVisibility, not these.
 *
 * FAIL-CLOSED: unknown/ambiguous public case → 'suppressed'.
 * NOT WIRED: no reader imports this in Backend-Search-1.
 */

import {
  resolveVisibility,
  type Audience,
  type LifecycleStatus,
  type Source,
  type TransactionType,
} from '../visibility-contract';
import { affirmPermission } from '../../compliance/gates';

export type DisplayGate = 'public_displayable' | 'internal_only' | 'seller_report_only' | 'suppressed';

export interface GateColumns {
  idxDisplayYn?: boolean | null;                    // must be explicitly true to display publicly
  ownerOptOut?: boolean | null;                     // Gate 1 — compliance; true ⇒ never public
  participantOnly?: boolean | null;                 // Gate 2 — compliance; true ⇒ never public
  internetEntireListingDisplayYn?: boolean | null;  // Gate 3 — must be true at READ gate ⇒ else never public
}

export interface DisplayGateInput {
  audience: Audience;
  status: LifecycleStatus;
  source: Source;
  transactionType: TransactionType;
  gates: GateColumns;
}

/**
 * Public-dissemination compliance block. Composes `affirmPermission` (the canonical compliance
 * primitive) — mirrors listing-access-decision.ts SEARCH_DISPLAY_GATE. Fail-closed on nullish.
 */
function compliancePublicBlocked(g: GateColumns): boolean {
  if (g.ownerOptOut === true) return true;
  if (g.participantOnly === true) return true;
  if (!affirmPermission(g.idxDisplayYn)) return true;                    // must be explicitly true
  if (!affirmPermission(g.internetEntireListingDisplayYn)) return true;  // READ gate requires true
  return false;
}

/**
 * Resolve the canonical display gate. PURE. Agent/internal → full access (resolveVisibility);
 * client → curated/labeled; public → resolveVisibility AND compliance columns, fail-closed.
 */
export function displayGate(input: DisplayGateInput): DisplayGate {
  const { audience, status, source, transactionType, gates } = input;
  const vis = resolveVisibility({ audience, status, source, transactionType, usage: 'search' });

  // Agent / internal report: real-inventory access (app auth enforced elsewhere).
  if (audience === 'agent' || audience === 'internal_report') {
    return vis.allowed ? 'internal_only' : 'suppressed';
  }
  // Client (portal / agent-curated report): curated, labeled.
  if (audience === 'client') {
    return vis.allowed ? 'seller_report_only' : 'suppressed';
  }
  // Public — fail-closed: needs BOTH the visibility decision AND the compliance columns.
  if (!vis.allowed) return 'suppressed';
  if (compliancePublicBlocked(gates)) return 'suppressed';
  return 'public_displayable';
}
