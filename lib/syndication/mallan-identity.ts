// lib/syndication/mallan-identity.ts
//
// Canonical Mallan listing-side identifier configuration for the
// syndication eligibility gate.
//
// Per the corrected v2 plan (docs/architecture/MALLAN-EXCLUSIVES-
// SYNDICATION-PLAN-2026-05-18.md), syndication eligibility is driven by
// CANONICAL MLS IDS matched on the row, NOT by `source` and NOT by
// free-text brokerage names.
//
// === Operator instructions (Maya) ===
//
// Before ANY syndication eligibility check can pass on a Trestle row,
// MAYA must populate one or both of these arrays with the values that
// REBNY / Cotality (Trestle) issued to Mallan Real Estate Inc. and to
// each licensed Mallan agent.
//
// Sources to consult when filling these in:
//   1. The "MLS Office ID" / "Office Key" assigned by REBNY when Mallan
//      registered as an LMP / IDX-Plus participant. This is the SAME
//      value Trestle returns in the Property resource as
//      `ListOfficeMlsId`. Maya should be able to confirm the office ID
//      via the REBNY RLS submission channel, or by
//      asking rlssupport@rebny.com / 212-616-5270.
//
//   2. Per-agent MLS IDs are stored on the `Agent.trestle_mls_id`
//      column in the DB (see prisma/schema.prisma:37). The eligibility
//      gate reads those at runtime via `loadMallanAgentMlsIds()`.
//      Maya should ensure every active Mallan agent row has its
//      trestle_mls_id populated before the gate can match agent-side.
//      Schema PR not required — column already exists.
//
// === Invariants enforced (from the v2 plan §C.0) ===
//
//  I.1  Manual listings are NOT automatically eligible. `source='manual'`
//       alone never passes Layer 1.
//
//  I.2  Trestle listings are NOT automatically excluded. A Trestle row
//       with a Mallan office or agent MLS ID match CAN be eligible.
//
//  I.3  `source` alone never proves Mallan control. The eligibility
//       decision is driven exclusively by canonical IDs match OR an
//       explicit broker-approved manual-control verification flag in
//       the row's compliance JSON.
//
//  I.4  Free-text brokerage / agent name matching is NEVER sufficient
//       for eligibility. Substrings like "mallan" in `list_office_name`
//       are a UI hint at most.
//
//  I.5  If MALLAN_OFFICE_MLS_IDS AND the runtime-loaded agent MLS ID
//       set are both empty, ALL listings are blocked at Layer 1.
//
//  I.6  A manual listing may become eligible only when (a) canonical
//       Mallan IDs match the row's listing-side fields, OR (b) a
//       broker-approved explicit manual-control verification flag is
//       set on `Listing.compliance.mallan_control_verification` after
//       a deliberate human review action.
//
//  I.7  The manual-control verification flag MUST NEVER be auto-created
//       by the audit script (which is read-only / dry-run only).
//
//  I.8  Ambiguity = block. Every Layer fails-closed; no fallback.
//
// === Environment / config policy ===
//
// This file does NOT read any env vars. The empty defaults below are
// the correct fail-closed state. Maya populates the values by editing
// this file directly (a normal commit) and shipping a follow-on PR.
// We deliberately do NOT key off process.env so the config is
// reviewable in git history, auditable, and consistent across local /
// CI / preview / production.

/**
 * REBNY / Trestle `ListOfficeMlsId` values that count as Mallan Real
 * Estate Inc. as the listing brokerage.
 *
 * EMPTY by default. Maya MUST populate before the office-level branch
 * of the eligibility gate (Layer 1a) can match anything.
 *
 * Multiple values are supported because:
 *   - A brokerage may be assigned more than one office ID over time
 *     (e.g. office restructure, license transfer).
 *   - During a verification period Maya may want to add observed
 *     candidate values and confirm one at a time.
 *
 * If this stays empty AND the runtime-loaded agent MLS ID set is also
 * empty, the gate blocks every row by design (invariant I.5).
 */
export const MALLAN_OFFICE_MLS_IDS: readonly string[] = [
  // EXAMPLES (do not uncomment — Maya populates with the verified value):
  // "39361",
  // "<additional-office-id>",
];

/**
 * Mallan's NY DOS-issued brokerage license number — used for required
 * advertising attribution per 19 NYCRR §175.25. This is a brokerage
 * identifier on the public NY DOS registry; safe to commit as a
 * constant.
 */
export const MALLAN_BROKERAGE_LICENSE = "10991205323";

/**
 * Mallan's brokerage trade name — used in payload attribution.
 */
export const MALLAN_BROKERAGE_NAME = "Mallan Real Estate Inc.";

/**
 * Mallan's principal broker name — for advertising attribution where
 * §175.25 demands a named licensed individual.
 */
export const MALLAN_PRINCIPAL_BROKER_NAME = "Maya Allan";

/**
 * Returns true when ALL canonical Mallan listing-side identifier sets
 * passed in are empty. Eligibility Layer 1 uses this to short-circuit
 * to "block every row" — the correct fail-closed default until Maya
 * populates one of the sets.
 *
 * The gate caller composes the office set from the in-file constant
 * above + the runtime-loaded agent set, then calls this helper.
 */
export function isIdentityConfigEmpty(
  officeMlsIds: ReadonlySet<string>,
  agentMlsIds: ReadonlySet<string>,
): boolean {
  // Helper restricted to `ReadonlySet<string>` to keep this function
  // strict-mode safe. Callers that hold a `readonly string[]` (e.g. the
  // exported MALLAN_OFFICE_MLS_IDS constant) construct the Set at the
  // call site: `new Set(MALLAN_OFFICE_MLS_IDS)`. This matches how
  // `evaluateMallanSyndicationEligibility()` already shapes its config
  // argument in `lib/syndication/eligibility.ts`.
  return officeMlsIds.size === 0 && agentMlsIds.size === 0;
}

/**
 * Loads the canonical agent MLS ID set from the `Agent.trestle_mls_id`
 * column for active agents.
 *
 * Read-only. No writes. No side effects.
 *
 * The argument type is a structural shape so the function can be
 * called against either the real Prisma client OR a mock in tests
 * without importing `@prisma/client` (which would create a cycle
 * with the test runner's Prisma mocks).
 */
export interface AgentTrestleMlsIdReader {
  agent: {
    findMany: (args: {
      where: { status: string; trestle_mls_id: { not: null } };
      select: { trestle_mls_id: true };
    }) => Promise<Array<{ trestle_mls_id: string | null }>>;
  };
}

export async function loadMallanAgentMlsIds(
  reader: AgentTrestleMlsIdReader,
): Promise<Set<string>> {
  const rows = await reader.agent.findMany({
    where: {
      status: "active",
      trestle_mls_id: { not: null },
    },
    select: { trestle_mls_id: true },
  });
  const set = new Set<string>();
  for (const row of rows) {
    const id = (row.trestle_mls_id ?? "").trim();
    if (id) set.add(id);
  }
  return set;
}
