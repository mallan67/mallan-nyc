/// <reference types="jest" />
/**
 * A GATE CANNOT ENFORCE WHAT IT WAS NEVER SHOWN.
 *
 * `checkDistributionGates` runs on every row the authenticated Agent Search
 * returns, and it decides displayability from four rules. Two of them read the
 * provider's `Permission` field:
 *
 *   isParticipantOnly    Permission carries "Private"  -> not displayable
 *   isOwnerOptOut        Permission carries an opt-out -> not displayable
 *
 * `Permission` was not in SEARCH_SELECT_FIELDS. The gate ran, read `undefined`,
 * and returned displayable. It did not fail, it did not warn, and it produced
 * exactly the output of a gate that had checked and approved.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS AND IS NOT. Live 2026-08-26: `Permission eq 'Private'` returns
 * ZERO rows, and `Permission eq 'AgentOnly'` returns zero. So this was a LATENT
 * fail-open, not an active breach — there was nothing for the blind gate to
 * miss. Saying otherwise would overstate it.
 *
 * It still has to be closed, and before the result universe is counted rather
 * than after. A count is a claim about which rows a broker may see; a gate that
 * cannot read its own input makes that claim unverifiable. The day REBNY marks
 * one listing Private, it would arrive in Agent Search results with no gate
 * standing between it and the broker, and nothing in the system would report a
 * change.
 *
 * `Permission` is a live multi-enum (ListingPermission) on Property with 18
 * members: AgentOnly, ComingSoon, CompSold, DownPaymentResourceNo,
 * DownPaymentResourceYes, FirmOnly, History, IDX, MemberInactive,
 * Officeidxoptout, OfficeInactive, OfficeOnly, OfficeSuspended, PhotoOptedOut,
 * Private, Public, SyndicateOptOut, VOW. IDX alone carries 591,292 rows, so the
 * field is populated and filterable — it simply was not being asked for.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO = resolve(__dirname, '../..');
const route = readFileSync(resolve(REPO, 'app/api/idx/search/route.ts'), 'utf8');

/**
 * Provider fields the four distribution-gate predicates read, with the rule
 * that needs each one. Sourced from lib/compliance/gates.ts.
 */
const GATE_INPUTS: Readonly<Record<string, string>> = Object.freeze({
  Permission: 'isParticipantOnly ("Private") and isOwnerOptOut (opt-out tokens)',
  MlsStatus: 'isOwnerOptOut, via MlsStatus === "OwnerOptOut"',
  InternetEntireListingDisplayYN:
    'isInternetEntireListingDisplayable — under idxPlusPreFiltered only an ' +
    'EXPLICIT false blocks, because REBNY pre-filters the feed and survivors ' +
    'carry null. Reading null as "not permitted" is the 7,594-row incident.',
  StandardStatus: 'isClosedPast24Hours — Closed/Expired arm',
  CloseDate: 'isClosedPast24Hours — the 24-hour arm',
});

describe('every distribution-gate input is actually fetched', () => {
  it.each(Object.entries(GATE_INPUTS))(
    '%s is selected — %s',
    (field) => {
      // Fails BY FIELD. A gate rule whose input is not selected is a rule that
      // silently approves every row.
      expect(route).toMatch(new RegExp(`"${field}"`));
    },
  );

  it('the select list is the one the search query actually uses', () => {
    // Guards against the fields being present somewhere else in the file while
    // the query is built from a different list.
    expect(route).toMatch(/select:\s*SEARCH_SELECT_FIELDS/);
    const start = route.indexOf('SEARCH_SELECT_FIELDS');
    const block = route.slice(start, route.indexOf('];', start));
    for (const field of Object.keys(GATE_INPUTS)) {
      expect(block).toContain(`"${field}"`);
    }
  });
});

describe('the gate is wired to the rows before they are counted', () => {
  it('gating happens before the response is assembled', () => {
    // Order matters for the universe contract: a row excluded by a gate must
    // never have been counted as a result in the first place.
    const gateAt = route.lastIndexOf('checkDistributionGates');
    const responseAt = route.indexOf('const response = {');
    expect(gateAt).toBeGreaterThan(-1);
    expect(responseAt).toBeGreaterThan(gateAt);
  });

  it('identity integrity is enforced before gating', () => {
    // A row with no ListingKey cannot be gated, deduped, or addressed later.
    // lastIndexOf, not indexOf: both names appear first in the IMPORT block,
    // where their order says nothing about execution order.
    const identityAt = route.lastIndexOf('partitionByListingIdentity');
    const gateAt = route.lastIndexOf('checkDistributionGates');
    expect(identityAt).toBeGreaterThan(-1);
    expect(gateAt).toBeGreaterThan(identityAt);
  });
});
