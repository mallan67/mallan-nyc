/// <reference types="jest" />
/**
 * Open Houses display gates (2026-06-23). The public /api/open-houses page showed nothing even
 * though Cotality had a live Public open house for #4D (ListingId RLS20099289, 2026-06-28).
 *
 * Root causes:
 *  - Trestle feed path gated with evaluateDisplayGate(prop) WITHOUT idxPlusPreFiltered, so the
 *    REBNY-pre-filtered null InternetEntireListingDisplayYN failed CLOSED and every feed open
 *    house was dropped (the 2026-04-30 incident shape).
 *  - Local path didn't select/honor rls_eligible, so a website-only Mallan exclusive's open house
 *    was dropped by the RLS internet-display gate.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { evaluateDisplayGate } from '@/lib/compliance/gates';

const ROUTE = readFileSync(resolve(__dirname, '../../app/api/open-houses/route.ts'), 'utf8');

describe('open-houses — Trestle feed gate uses REBNY fail-OPEN (idxPlusPreFiltered)', () => {
  it('null InternetEntireListingDisplayYN is DISPLAYABLE under idxPlusPreFiltered (REBNY pre-filter)', () => {
    const g = evaluateDisplayGate(
      { StandardStatus: 'Active', InternetEntireListingDisplayYN: null },
      { idxPlusPreFiltered: true },
    );
    expect(g.displayable).toBe(true);
  });

  it('explicit false still blocks even under idxPlusPreFiltered (per-row override)', () => {
    const g = evaluateDisplayGate(
      { StandardStatus: 'Active', InternetEntireListingDisplayYN: false },
      { idxPlusPreFiltered: true },
    );
    expect(g.displayable).toBe(false);
  });

  it('default (no option) fails CLOSED on null — the bug the route had', () => {
    const g = evaluateDisplayGate({ StandardStatus: 'Active', InternetEntireListingDisplayYN: null });
    expect(g.displayable).toBe(false);
  });

  it('both Trestle gate call sites pass { idxPlusPreFiltered: true }', () => {
    const calls = ROUTE.match(/evaluateDisplayGate\(\s*prop[^)]*idxPlusPreFiltered:\s*true/g) || [];
    expect(calls.length).toBe(2);
    // and there is no remaining un-flagged evaluateDisplayGate(prop) on the feed path
    expect(ROUTE).not.toMatch(/evaluateDisplayGate\(prop\)\s*;/);
  });
});

describe('open-houses — local path honors website-only (rls_eligible=false) bypass', () => {
  it('selects rls_eligible and bypasses the RLS gate for website-only Mallan exclusives', () => {
    expect(ROUTE).toMatch(/rls_eligible:\s*true,/);            // selected
    expect(ROUTE).toMatch(/l\.rls_eligible === false[\s\S]*?OPEN_HOUSE_ELIGIBLE_STATUSES\.includes\(l\.status\)/);
  });
});

describe('open-houses — only ACTIVE Cotality open houses display (P1)', () => {
  it('both Trestle feed filters require OpenHouseStatus eq Active (no cancelled OH)', () => {
    const actives = ROUTE.match(/OpenHouseType eq 'Public' and OpenHouseStatus eq 'Active'/g) || [];
    expect(actives.length).toBe(2); // $expand path + flat fallback path
  });
});

describe('open-houses — Coming Soon never publicizes an open house (P2, UCBA Art. I §16)', () => {
  it('website-only bypass uses an eligible set that EXCLUDES ComingSoon', () => {
    expect(ROUTE).toMatch(/OPEN_HOUSE_ELIGIBLE_STATUSES\s*=\s*DISPLAYABLE_STATUSES\.filter\(\(s\)\s*=>\s*s\s*!==\s*'ComingSoon'\)/);
    // the bypass must NOT reference the broad DISPLAYABLE_STATUSES.includes for status gating
    expect(ROUTE).not.toMatch(/displayable:\s*DISPLAYABLE_STATUSES\.includes\(l\.status\)/);
  });
});
