/**
 * Mallan-exclusive listing-agent assignment.
 *
 * When a listing is created/updated in the CRM as a Mallan EXCLUSIVE
 * (listing_id prefix `SL-`/`RL-`, or `rls_eligible === false` website-only,
 * i.e. a listing Mallan itself authored), the listing's agent identity must
 * be stamped onto the row so the public surfaces (FeaturedListings, the
 * listing detail contact card, attribution lines) can render the ACTUAL
 * listing agent + brokerage.
 *
 * This module is the single source of truth for that mapping. It is a PURE
 * function: it takes the agent identity the app already holds (from the
 * authenticated session / request — `auth.userId` resolved to an Agent row)
 * and returns the four fields to persist. It does NOT hardcode a person and
 * it does NOT read env vars.
 *
 * The four assigned fields
 * ------------------------
 *   1. `agent_id`              → Listing.agent_id column (BigInt FK → Agent)
 *   2. `list_agent_full_name`  → agent_info.ListAgentFullName
 *   3. `list_office_name`      → agent_info.ListOfficeName
 *   4. `agent_info`            → the enriched REBNY-shaped JSON blob carrying
 *                                the display name, office, and Mallan's own
 *                                contact for this exclusive.
 *
 * Compliance
 * ----------
 *   - UCBA Art. III §2(C): attribution must identify the ACTUAL listing
 *     broker. For a Mallan exclusive, Mallan IS the listing broker — so
 *     stamping the named Mallan agent + "Mallan Real Estate Inc." is the
 *     correct, required attribution.
 *   - 19 NYCRR §175.25: advertising must name the brokerage; `ListOfficeName`
 *     carries it.
 *   - The agent email/phone we surface here are Mallan's OWN contact for OUR
 *     OWN listing — this is not the third-party-agent PII that the NAR
 *     settlement / REBNY rules strip from IDX display. It is published only
 *     for the exclusive path; third-party IDX rows never reach this helper.
 *   - Manual typed values always win: this helper FILLS only blank
 *     agent_info keys (see `mergeBlankOnly`), so any name/office/contact the
 *     form already carried is preserved.
 *
 * @module lib/listings/exclusive-agent-assignment
 */

import { MALLAN_BROKERAGE_NAME } from '@/lib/syndication/mallan-identity';
import { typedAgentColumnsFromJson } from '@/lib/listings/agent-info-typed-columns';

/**
 * Canonical Mallan-authored listing_id prefixes (CRM-created exclusives).
 * Exported (R2-1) so DB-side `Prisma.ListingWhereInput` builders (e.g. the
 * R2 mirror-admission policy in `lib/idx/media-sync.ts`) can derive their
 * `startsWith` branches from the SAME source of truth as
 * `isMallanExclusiveListing()` — no divergent duplicate of the prefix list.
 */
export const MALLAN_EXCLUSIVE_LISTING_ID_PREFIXES = ['SL-', 'RL-'] as const;

const CRM_PREFIXES = MALLAN_EXCLUSIVE_LISTING_ID_PREFIXES;

/**
 * The agent identity the app already holds — sourced from the authenticated
 * session (the Agent row keyed by `auth.userId`). Structural shape so callers
 * can pass a Prisma Agent row or a session-derived object without importing
 * `@prisma/client`.
 */
export interface AssigningAgentIdentity {
  id: bigint | number | string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  /** Brokerage trade name override. Defaults to Mallan's canonical name. */
  office_name?: string | null;
}

/** Minimal listing shape needed to decide whether this is a Mallan exclusive. */
export interface ExclusiveAssignmentListing {
  /** The listing_id (used to detect the SL-/RL- CRM prefix). */
  listing_id?: string | null;
  /** false = website-only (commercial / off-RLS) — also Mallan-authored. */
  rls_eligible?: boolean | null;
}

/** The persisted result of an exclusive agent assignment. */
export interface ExclusiveAgentAssignment {
  agent_id: bigint;
  list_agent_full_name: string;
  list_office_name: string;
  /** REBNY-shaped agent_info JSON (merged blank-only over the existing one). */
  agent_info: Record<string, unknown>;
  /**
   * Phase A: the 6 NET-NEW typed agent columns derived from `agent_info` (the 2
   * display columns above are kept verbatim for backwards-compat). PII boundary:
   * email/direct-phone are stored but exposure stays gated by the read layer.
   */
  list_agent_email: string | null;
  list_agent_direct_phone: string | null;
  list_office_mls_id: string | null;
  list_agent_mls_id: string | null;
  co_list_office_mls_id: string | null;
  co_list_agent_mls_id: string | null;
}

/**
 * ── THE ONE CANONICAL MALLAN SOURCE-OWNERSHIP RULE ────────────────────────────────────────────────────────────
 *
 * "Mallan authored this row" was implemented three separate times — `isMallanExclusiveListing` here,
 * `isMallanLocalListing` in mallan-source-identity.ts, and `buildMallanOwnedListingWhere` in media-sync.ts — and
 * all three said the same wrong thing: `SL-`/`RL-` prefix **OR** `rls_eligible === false`. They now all delegate
 * here so the rule cannot drift again.
 *
 * WHY THE OLD SECOND ARM WAS WRONG (owner review 2026-09-09). `rls_eligible === false` does not mean "Mallan owns
 * this row". It means "commercial / website-only — not RLS inventory", and it is an INPUT to the mapper
 * (`computeGateColumns`, lib/idx/trestle-mapper.ts: `input.rls_eligible !== false`), not a provenance fact the
 * feed asserts. Trestle never serializes it, so a pure feed row defaults to `true` — but nothing structurally
 * stops a third-party COMMERCIAL row from being ingested with `false`, and the moment one is, it would be
 * classified as Mallan-owned. The listing-expiration cron would then write `expiration_date` /
 * `idx_display_yn` / `modification_timestamp` onto another brokerage's listing: a source mutation Mallan has no
 * authority to make, and the exact hazard that cron's own header says it was fixed to prevent.
 *
 * THE FIX. The `SL-`/`RL-` prefix stays definitive on its own — it is assigned by Mallan's own CRM and the feed
 * cannot mint one. The `rls_eligible === false` arm now additionally requires the ABSENCE of provider provenance.
 *
 * VERIFIED READ-ONLY 2026-09-09 against production (27,031 listings): this is a pure future-safety tightening
 * with zero behaviour change on current data. All 7 `rls_eligible = false` rows carry the Mallan prefix, and none
 * of them carries any provenance signal, so the old rule and the new rule select the identical 7 rows today.
 * (Separately: 33 rows have a null `last_synced_from_trestle` without the Mallan prefix, which is why the absence
 * of a sync stamp is NOT sufficient on its own and is only ever read together with `rls_eligible === false`.)
 */

/** The columns that prove a row came from the provider feed rather than Mallan's CRM. */
export interface MallanOwnershipRow {
  listing_id?: string | null;
  rls_eligible?: boolean | null;
  /** Stamped by the Trestle sync. A CRM-authored row never has one. */
  last_synced_from_trestle?: Date | string | null;
  /** Provider list-office identifier. Only a feed row carries one. */
  list_office_mls_id?: string | null;
  /** Provider MLS identifier. */
  mls_id?: string | null;
}

/**
 * TRUE when any provider-provenance column is populated — i.e. this row came from the feed.
 *
 * Deliberately column-only. `raw_data.StandardStatus` is an equally strong signal, but proving a JSON key is
 * ABSENT is awkward in Prisma, and using it here while the SQL form below could not would leave the in-memory
 * predicate and the database predicate disagreeing. The three columns already separate the populations cleanly.
 */
export function hasProviderProvenance(row: MallanOwnershipRow): boolean {
  if (row.last_synced_from_trestle != null) return true;
  if (typeof row.list_office_mls_id === 'string' && row.list_office_mls_id.trim() !== '') return true;
  if (typeof row.mls_id === 'string' && row.mls_id.trim() !== '') return true;
  return false;
}

/** THE canonical rule. Every other ownership predicate in the codebase delegates to this one. */
export function isMallanAuthoredListing(row: MallanOwnershipRow): boolean {
  const id = String(row.listing_id ?? '');
  if (CRM_PREFIXES.some((p) => id.startsWith(p))) return true;
  // Website-only / commercial, AND nothing says the feed sent it.
  return row.rls_eligible === false && !hasProviderProvenance(row);
}

/**
 * Prisma `where` form of {@link isMallanAuthoredListing}. Kept in lockstep with it by
 * tests/runtime/mallan-ownership-authority.test.ts, which drives both forms over the same fixture rows.
 */
export function mallanAuthoredListingWhere(): {
  OR: Array<Record<string, unknown>>;
} {
  return {
    OR: [
      ...MALLAN_EXCLUSIVE_LISTING_ID_PREFIXES.map((p) => ({ listing_id: { startsWith: p } })),
      {
        rls_eligible: false,
        last_synced_from_trestle: null,
        OR: [{ list_office_mls_id: null }, { list_office_mls_id: '' }],
        mls_id: null,
      },
    ],
  };
}

/**
 * True when the listing is a Mallan-authored exclusive — the rows Mallan itself listed, and the only rows that
 * get a Mallan agent stamped. Delegates to the canonical rule above.
 */
export function isMallanExclusiveListing(listing: ExclusiveAssignmentListing): boolean {
  return isMallanAuthoredListing(listing as MallanOwnershipRow);
}

/** Resolve a display full name from whatever name parts the identity carries. */
function resolveFullName(agent: AssigningAgentIdentity): string {
  const explicit = (agent.full_name ?? '').trim();
  if (explicit) return explicit;
  const composed = [agent.first_name, agent.last_name]
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
  return composed;
}

/**
 * Merge `additions` into `base`, writing a key ONLY when `base` does not
 * already have a non-empty value for it. Manual / form-supplied values in
 * `base` always win. Returns a new object; does not mutate `base`.
 */
function mergeBlankOnly(
  base: Record<string, unknown>,
  additions: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(additions)) {
    if (value == null || value === '') continue;
    const existing = out[key];
    const existingBlank = existing == null || (typeof existing === 'string' && existing.trim() === '');
    if (existingBlank) out[key] = value;
  }
  return out;
}

/**
 * Build the four agent-assignment fields for a Mallan exclusive listing.
 *
 * Returns `null` when the listing is NOT a Mallan exclusive (third-party
 * IDX/RLS rows are never stamped — their attribution stays with the actual
 * listing brokerage).
 *
 * `existingAgentInfo` is the listing's current agent_info JSON (from the
 * form/normalizer). Existing non-blank keys are preserved (manual wins);
 * only blank keys are filled from the agent identity.
 */
export function buildExclusiveAgentAssignment(
  agent: AssigningAgentIdentity,
  listing: ExclusiveAssignmentListing,
  existingAgentInfo: Record<string, unknown> = {},
): ExclusiveAgentAssignment | null {
  if (!isMallanExclusiveListing(listing)) return null;

  const fullName = resolveFullName(agent);
  const officeName = (agent.office_name ?? '').trim() || MALLAN_BROKERAGE_NAME;
  const email = (agent.email ?? '').trim();
  const phone = (agent.phone ?? '').trim();

  // Fill ONLY blank keys — any name/office/contact the form already carried
  // is preserved (manual typed values always win).
  const agentInfo = mergeBlankOnly(existingAgentInfo, {
    ListAgentFullName: fullName,
    ListOfficeName: officeName,
    ListAgentEmail: email,
    ListAgentDirectPhone: phone,
  });

  // list_agent_full_name / list_office_name reflect whatever ended up in
  // agent_info after the blank-only merge (manual value wins, else identity).
  const resolvedName = String(agentInfo.ListAgentFullName ?? fullName);
  const resolvedOffice = String(agentInfo.ListOfficeName ?? officeName);

  // Phase A: derive the 6 net-new typed columns from the merged agent_info JSON.
  const typed = typedAgentColumnsFromJson(agentInfo);

  return {
    agent_id: BigInt(agent.id),
    list_agent_full_name: resolvedName,
    list_office_name: resolvedOffice,
    agent_info: agentInfo,
    list_agent_email: typed.list_agent_email,
    list_agent_direct_phone: typed.list_agent_direct_phone,
    list_office_mls_id: typed.list_office_mls_id,
    list_agent_mls_id: typed.list_agent_mls_id,
    co_list_office_mls_id: typed.co_list_office_mls_id,
    co_list_agent_mls_id: typed.co_list_agent_mls_id,
  };
}
