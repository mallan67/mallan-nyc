/**
 * Campaign distribution gate — ONE pure, testable decision.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * `app/api/crm/listing-campaigns/route.ts` decided RLS redistribution
 * eligibility inline, keyed off the listing-id PREFIX:
 *
 *   const isCrmExclusive =
 *     listing_id.startsWith("SL-") || listing_id.startsWith("RL-");
 *   ...
 *   if (!isCrmExclusive) {
 *     if (!affirmPermission(row.idx_display_yn))                     block
 *     if (!affirmPermission(row.internet_entire_listing_display_yn)) block
 *   }
 *
 * A prefix identifies PROVENANCE / OWNERSHIP CLASS. It is not permission to
 * ignore an RLS display restriction. An RLS-ELIGIBLE `SL-`/`RL-` listing
 * therefore skipped BOTH IDX display gates before distribution — the identical
 * "prefix as permission" fault already corrected for address suppression in
 * `lib/idx/db-to-public-dto.ts`.
 *
 * This was a deliberate policy assumption in the route, not a typo, so the
 * correction is expressed as a pure decision with its own tests rather than an
 * unexplained boolean swap.
 *
 * THE BOUNDARY
 * ------------
 * WEBSITE-ONLY  (`rls_eligible === false`)
 *   Mallan's own non-RLS inventory. Not RLS redistribution content, so the two
 *   IDX display flags do not bind. Every other control still applies.
 *
 * RLS-BACKED    (`rls_eligible !== false`) — INCLUDING RLS-eligible SL-/RL-
 *   Must satisfy `idx_display_yn` AND `internet_entire_listing_display_yn`.
 *
 * Only an EXPLICIT `false` exempts a listing. `null`/`undefined` is treated as
 * RLS-backed, so an unknown provenance fails closed.
 *
 * TERMINAL STATUS — deliberately stricter than the public display gate.
 * `isListingDisplayable()` carries closed-within-24-hours semantics that are
 * appropriate for rendering a page but NOT for pushing a campaign. This gate
 * blocks terminal statuses outright, preserving the route's original stricter
 * rule. Do not swap in the general display gate.
 */

import { affirmPermission } from './gates';
import { TERMINAL_STATUSES, normalizeStandardStatus } from '@/lib/idx/trestle-mapper';

export interface CampaignGateInput {
  /** Listing id. Used for provenance labelling ONLY — never as a permission. */
  listing_id: string;
  /** `false` = website-only (non-RLS). Anything else is treated as RLS-backed. */
  rls_eligible?: boolean | null;
  idx_display_yn?: boolean | null;
  internet_entire_listing_display_yn?: boolean | null;
  owner_opt_out?: boolean | null;
  participant_only?: boolean | null;
  status?: string | null;
}

export interface CampaignGateResult {
  allowed: boolean;
  /** Every violated gate, not just the first — callers surface the full list. */
  blocks: string[];
}

/**
 * Is this listing RLS redistribution inventory?
 *
 * Only an explicit `false` exempts. The listing-id prefix is NOT consulted:
 * an `SL-`/`RL-` listing that is RLS-eligible is RLS-backed.
 */
export function isRlsBackedForCampaign(
  input: Pick<CampaignGateInput, 'rls_eligible'>,
): boolean {
  return input.rls_eligible !== false;
}

/** Evaluate every campaign distribution gate. Pure — no I/O, no side effects. */
export function evaluateCampaignDistributionGate(
  input: CampaignGateInput,
): CampaignGateResult {
  const blocks: string[] = [];

  // ── Gates that bind on EVERY class, website-only included ────────────────
  if (input.owner_opt_out === true) blocks.push('owner_opt_out');
  if (input.participant_only === true) blocks.push('participant_only');

  const normalizedStatus = normalizeStandardStatus(input.status ?? '');
  if (TERMINAL_STATUSES.has(normalizedStatus)) {
    blocks.push(`terminal_status:${normalizedStatus}`);
  }

  // ── RLS redistribution gates — only for RLS-backed inventory ─────────────
  if (isRlsBackedForCampaign(input)) {
    if (!affirmPermission(input.idx_display_yn)) blocks.push('idx_display_yn');
    if (!affirmPermission(input.internet_entire_listing_display_yn)) {
      blocks.push('internet_entire_listing_display_yn');
    }
  }

  return { allowed: blocks.length === 0, blocks };
}
