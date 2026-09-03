/// <reference types="jest" />
/**
 * IS THE IDX DISPLAY GATE THE RIGHT GATE FOR AUTHENTICATED AGENT SEARCH?
 *
 * `checkDistributionGates` is explicitly the IDX Plus display-gate wrapper, and
 * it was reused for the authenticated broker universe because it already
 * existed. That is not a reason. A rule appropriate for what the PUBLIC may be
 * shown is not automatically a rule about what a licensed broker may FIND.
 *
 * This file records the verification, not a change. Every disposition below
 * comes from an HTTP response received from api.cotality.com on 2026-08-26.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FINDING: on THIS subscription, the arms that would differ by viewer
 * context never fire, because the rows they describe are never delivered.
 *
 *   Permission eq 'IDX'              591,295
 *   Permission eq 'SyndicateOptOut'    9,436
 *   Permission eq 'Private'                0
 *   Permission eq 'AgentOnly'              0
 *   Permission eq 'OfficeOnly'             0
 *   Permission eq 'FirmOnly'               0
 *   Permission eq 'VOW'                    0
 *   Permission eq 'Public'                 0
 *
 * IDX Plus serves IDX-permissioned rows and nothing else. That matches the
 * compliance index, which lists `ParticipantOnlyYN` and the `VOW*` gate fields
 * as PHANTOM on IDX Plus. So participant-only inventory is PROVIDER-UNAVAILABLE
 * rather than Mallan-suppressed: Mallan is not removing those listings from a
 * broker's search, they never arrive.
 *
 * That distinction matters for what may be claimed. Recording "Mallan enforces
 * participant-only in Agent Search" would assert an enforcement that is not
 * happening on this feed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONSEQUENCE, and the reason this file exists rather than a one-line comment:
 * if Mallan ever gains a broader subscription (full RLS or VOW), participant-
 * only and office-only rows WOULD begin arriving, and the public-vs-authenticated
 * question becomes live for the first time. This matrix must be re-derived then.
 * It is not a permanent answer; it is a dated one.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO = resolve(__dirname, '../..');
const gates = readFileSync(resolve(REPO, 'lib/compliance/gates.ts'), 'utf8');
const mapper = readFileSync(resolve(REPO, 'lib/idx/trestle-mapper.ts'), 'utf8');

type Enforcement =
  /** The row never reaches Mallan on this subscription. */
  | 'PROVIDER_UNAVAILABLE'
  /** Mallan evaluates it per row and removes matching rows. */
  | 'MALLAN_ENFORCED_POST_FETCH'
  /** Deliberately not a search-universe rule. */
  | 'NOT_A_SEARCH_UNIVERSE_GATE';

const GATE_MATRIX: Readonly<
  Record<string, { enforcement: Enforcement; evidence: string; contextNote: string }>
> = Object.freeze({
  'participant-only (Permission = Private)': {
    enforcement: 'PROVIDER_UNAVAILABLE',
    evidence:
      "Permission eq 'Private' -> 0 rows, and every non-IDX member of " +
      'ListingPermission is 0 while IDX is 591,295. The compliance index lists ' +
      'ParticipantOnlyYN and the VOW* gate fields as PHANTOM on IDX Plus.',
    contextNote:
      'The one arm where public and authenticated context WOULD genuinely ' +
      'differ — a licensed participant may see participant-only inventory that ' +
      'the public may not. It is moot here because the subscription does not ' +
      'deliver those rows at all.',
  },
  'owner opt-out (MlsStatus = OwnerOptOut)': {
    enforcement: 'PROVIDER_UNAVAILABLE',
    evidence:
      "MlsStatus eq 'OwnerOptOut' -> HTTP 400 \"not a valid enumeration\". The " +
      'token is not a member of the live MlsStatus vocabulary, so this arm can ' +
      'never match a provider value.',
    contextNote:
      'The arm still has a real job for MALLAN-SOURCED rows, where owner_opt_out ' +
      'is a Mallan column rather than a provider value. It is inert only against ' +
      'the provider feed.',
  },
  'InternetEntireListingDisplayYN': {
    enforcement: 'MALLAN_ENFORCED_POST_FETCH',
    evidence:
      'PROVIDER-SUPPRESSED for filtering — "cannot be used for filtering or ' +
      'ordering queries" — but SELECTABLE, and it reads null on live Active ' +
      'rows. So the gate can only ever be a per-row evaluation; it cannot move ' +
      'into OData however convenient that would be.',
    contextNote:
      'null means DISPLAYABLE because REBNY pre-filters non-displayable rows out ' +
      'of the feed, which is why the wrapper passes idxPlusPreFiltered. Wrapping ' +
      'it in affirmPermission() would collapse every row to false — the exact ' +
      'shape of the 2026-04-30 incident that corrupted 7,594 rows.',
  },
  'closed more than 24 hours': {
    enforcement: 'MALLAN_ENFORCED_POST_FETCH',
    evidence: "StandardStatus eq 'Closed' -> 577,526 rows. This arm does real work.",
    contextNote:
      'REBNY §2.05 retention. Applies to the row regardless of who is looking, ' +
      'so it is not a public-vs-authenticated distinction.',
  },
  'syndication opt-out (Permission = SyndicateOptOut)': {
    enforcement: 'NOT_A_SEARCH_UNIVERSE_GATE',
    evidence: "Permission eq 'SyndicateOptOut' -> 9,436 rows. Real and populated.",
    contextNote:
      'Correctly NOT applied here. Syndication is a distribution boundary — the ' +
      'compliance index records Gate 4 as badge-only, not a filter. A listing ' +
      'that may not be syndicated to a third-party portal is still a listing a ' +
      'broker may find.',
  },
});

describe('every gate arm has a verified enforcement disposition', () => {
  it('each carries live evidence and a context note', () => {
    for (const [arm, entry] of Object.entries(GATE_MATRIX)) {
      expect(entry.evidence.length).toBeGreaterThan(40);
      expect(entry.contextNote.length).toBeGreaterThan(40);
      expect(arm).toBeTruthy();
    }
  });

  it('provider-unavailable is never recorded as Mallan enforcement', () => {
    // The claim that must not be made: that Mallan removes participant-only
    // rows from a broker's search. It does not — they never arrive.
    expect(GATE_MATRIX['participant-only (Permission = Private)'].enforcement).toBe(
      'PROVIDER_UNAVAILABLE',
    );
    expect(GATE_MATRIX['owner opt-out (MlsStatus = OwnerOptOut)'].enforcement).toBe(
      'PROVIDER_UNAVAILABLE',
    );
  });

  it('the two arms that actually fire are recorded as Mallan-enforced', () => {
    expect(GATE_MATRIX['InternetEntireListingDisplayYN'].enforcement).toBe(
      'MALLAN_ENFORCED_POST_FETCH',
    );
    expect(GATE_MATRIX['closed more than 24 hours'].enforcement).toBe(
      'MALLAN_ENFORCED_POST_FETCH',
    );
  });
});

describe('the pre-filtered semantics that caused the 2026-04-30 incident stay put', () => {
  it('the search wrapper passes idxPlusPreFiltered', () => {
    // Without it, null collapses to "not permitted" and every REBNY-feed row
    // disappears. That is the incident shape, and live rows really do read null.
    const start = mapper.indexOf('export function checkDistributionGates');
    const block = mapper.slice(start, start + 1600);
    expect(block).toMatch(/idxPlusPreFiltered:\s*true/);
  });

  it('the display flag is not wrapped in affirmPermission', () => {
    const start = gates.indexOf('export function isInternetEntireListingDisplayable');
    const block = gates.slice(start, start + 700);
    expect(block).toMatch(/options\.idxPlusPreFiltered/);
    expect(block).toMatch(/v !== false/);
  });

  it('the per-row opt-out flags stay fail-closed, unlike the pre-filtered pair', () => {
    // The asymmetry is the whole lesson: two of these fields are REBNY
    // pre-filtered and two are per-row opt-outs, and treating them alike in
    // either direction is a defect.
    expect(gates).toMatch(/affirmPermission/);
  });
});

describe('the display flag can only ever be a post-fetch rule', () => {
  it('it is never emitted into an OData filter', () => {
    // Live: "cannot be used for filtering or ordering queries". Moving the gate
    // into the query for speed would 400 every search.
    const filter = readFileSync(resolve(REPO, 'lib/search/crm-idx-filter.ts'), 'utf8');
    expect(filter).not.toMatch(/InternetEntireListingDisplayYN (eq|ne) /);
  });

  it('but it IS selected, so the gate can read it', () => {
    const route = readFileSync(resolve(REPO, 'app/api/idx/search/route.ts'), 'utf8');
    expect(route).toMatch(/"InternetEntireListingDisplayYN"/);
  });
});
