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
const CARD = readFileSync(resolve(__dirname, '../../app/components/OpenHousesList.tsx'), 'utf8');
const SIDEBAR = readFileSync(resolve(__dirname, '../../app/components/ListingOpenHouseRSVP.tsx'), 'utf8');

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
  it('website-only bypass uses the eligible set that EXCLUDES ComingSoon (defined in the resolver lib)', () => {
    // OPEN_HOUSE_ELIGIBLE_STATUSES (ComingSoon-excluded) now lives in the resolver lib and is asserted
    // there; the route imports it and uses it for the website-only status gate.
    expect(ROUTE).toMatch(/import\s*\{[\s\S]*?OPEN_HOUSE_ELIGIBLE_STATUSES[\s\S]*?\}\s*from\s*['"]@\/lib\/open-houses\/upcoming-open-houses['"]/);
    // The `l.status != null` guard is not decoration: `listings.status` is
    // nullable, and `.includes(null)` on a string[] is a type error that a cast
    // would have silenced into a false negative. A listing with no market
    // status cannot hold a public open house.
    expect(ROUTE).toMatch(
      /displayable:\s*l\.status != null &&\s*OPEN_HOUSE_ELIGIBLE_STATUSES\.includes\(l\.status\)/,
    );
    // the bypass must NOT reference the broad DISPLAYABLE_STATUSES.includes for status gating
    expect(ROUTE).not.toMatch(/displayable:\s*DISPLAYABLE_STATUSES\.includes\(l\.status\)/);
  });
});

describe('open-houses — page is scoped to MALLAN only (Cotality feed by office)', () => {
  it('imports the canonical Mallan office-id constant (single source of truth in the resolver lib)', () => {
    // The constant now lives in lib/open-houses/upcoming-open-houses.ts (shared with the card banner);
    // the route imports it rather than redeclaring it (divergence on the office scope is a hazard).
    expect(ROUTE).toMatch(/import\s*\{[\s\S]*?MALLAN_OH_OFFICE_MLS_IDS[\s\S]*?\}\s*from\s*['"]@\/lib\/open-houses\/upcoming-open-houses['"]/);
    // must NOT import the syndication HOLD constant (keeping MALLAN_OFFICE_MLS_IDS empty is load-bearing).
    expect(ROUTE).not.toMatch(/import[\s\S]*?from\s*['"]@\/lib\/syndication/);
  });

  it('resolves Mallan listing ids and scopes BOTH Trestle filters to them (no city-wide feed)', () => {
    expect(ROUTE).toMatch(/fetchMallanListingRefs\(/);
    expect(ROUTE).toMatch(/if \(mallanIds\.length === 0\) return \[\]/);
    const scoped = ROUTE.match(/and \(\$\{listingScope\}\)/g) || [];
    expect(scoped.length).toBe(2); // $expand path + flat fallback
  });

  it('Mallan listing pre-query uses the OH-eligible status set (incl ActiveUnderContract), not just Active', () => {
    // must NOT hard-code only Active (would drop an AUC listing with a live public open house)
    expect(ROUTE).not.toMatch(/\(\$\{officeFilter\}\) and StandardStatus eq 'Active'/);
    expect(ROUTE).toMatch(/OPEN_HOUSE_ELIGIBLE_STATUSES\.map\(\(s\) => `StandardStatus eq '\$\{s\}'`\)/);
  });
});

describe('open-houses — Property unwrapped from the OData expand ARRAY (the hasData=0 bug)', () => {
  it('unwraps r.Property when it is an array (else price/address undefined → every OH dropped)', () => {
    expect(ROUTE).toMatch(/Array\.isArray\(propRaw\)\s*\?\s*propRaw\[0\]\s*:\s*propRaw/);
    // the old object-only read must be gone
    expect(ROUTE).not.toMatch(/const prop = \(r\.Property \|\| \{\}\) as Record/);
  });
});

describe('open-houses card — times render in Eastern (was UTC on Vercel → 4PM instead of noon)', () => {
  it('formatTrestleTime pins timeZone America/New_York', () => {
    expect(ROUTE).toMatch(/toLocaleTimeString\('en-US',\s*\{[^}]*timeZone:\s*'America\/New_York'/);
  });
});

describe('open-houses card — primary photo resolved via the CANONICAL media resolver', () => {
  it('uses resolveListingMedia (DOCUMENT/floor-plan aware + proxies), not a raw getValidPhotoMedia pick', () => {
    expect(ROUTE).toMatch(/async function resolveTrestlePrimaryPhoto\(/);
    // canonical resolver handles /Media/Property/DOCUMENT-* reclassification + proxying (Codex)
    expect(ROUTE).toMatch(/resolveListingMedia\(media\)\.find\(\(m\) => m\.class === 'photo'/);
    // must NOT bypass it with the raw photo-list pick
    expect(ROUTE).not.toMatch(/getValidPhotoMedia\(media\)\[0\]/);
    const used = ROUTE.match(/await resolveTrestlePrimaryPhoto\(r\.ListingKey, r\.ListingId\)/g) || [];
    expect(used.length).toBe(2); // $expand path + flat fallback
    // the hardcoded empty image must be gone from the Trestle DTOs
    expect(ROUTE).not.toMatch(/image: '', \/\/ Will be filled by media proxy/);
  });
});

describe('open-houses card — gold "Mallan Exclusive" badge (page is Mallan-only)', () => {
  it('API flags every open house mallanExclusive: true (all 3 paths)', () => {
    const flagged = ROUTE.match(/mallanExclusive: true/g) || [];
    expect(flagged.length).toBe(3); // $expand, flat, local
  });

  it('card renders the gold badge from mallanExclusive and labels the time pill "Open House"', () => {
    expect(CARD).toMatch(/oh\.mallanExclusive &&/);
    expect(CARD).toMatch(/bg-brand-gold[\s\S]*?Mallan Exclusive/);
    expect(CARD).toMatch(/Open House/);
  });

  it('local path only surfaces/badges genuinely Mallan-owned listings (not any synced showing)', () => {
    // gate the local path on Mallan ownership; the helper is the shared one (asserted in the lib test)
    expect(ROUTE).toMatch(/import\s*\{[\s\S]*?isMallanOwnedLocalListing[\s\S]*?\}\s*from\s*['"]@\/lib\/open-houses\/upcoming-open-houses['"]/);
    // Codex #472 r15: the local filter also requires an open-house-ELIGIBLE status so the
    // feed matches the RSVP-linkage predicate (no shown-but-unlinkable ComingSoon/Pending).
    expect(ROUTE).toMatch(
      /gate\.displayable && l\.status != null && OPEN_HOUSE_ELIGIBLE_STATUSES\.includes\(l\.status\) && isMallanOwnedLocalListing\(l\)/,
    );
  });
});

describe('open-houses card — photo loads via native <img> (next/image optimizer 400 on proxy URL)', () => {
  it('the card uses a native <img>, not next/image, for the proxied photo', () => {
    expect(CARD).not.toMatch(/from 'next\/image'/);
    expect(CARD).toMatch(/<img\b[\s\S]*?src=\{oh\.image \|\| '\/images\/listing-placeholder\.svg'\}/);
  });
});

describe('open-houses — By Appointment designation surfaces (public API + /open-houses card + sidebar)', () => {
  it('API selects the Cotality appointment signal AppointmentRequiredYN (both Trestle paths)', () => {
    const sel = ROUTE.match(/AppointmentRequiredYN/g) || [];
    expect(sel.length).toBeGreaterThanOrEqual(2); // $expand $select + flat $select (+ DTO derivations)
  });
  it('API derives openHouseType from the canonical resolver on all 3 paths, not the raw field', () => {
    const derived = ROUTE.match(/openHouseType:\s*resolvePublicOpenHouseType\(/g) || [];
    expect(derived.length).toBe(3); // $expand, flat, local
    expect(ROUTE).toMatch(/import\s*\{[\s\S]*?resolvePublicOpenHouseType[\s\S]*?\}\s*from\s*['"]@\/lib\/open-houses\/upcoming-open-houses['"]/);
  });
  it('dedupe preserves By Appointment (a Public Trestle twin cannot erase it)', () => {
    expect(ROUTE).toMatch(/oh\.openHouseType === 'By Appointment' && twin\.openHouseType !== 'By Appointment'/);
    expect(ROUTE).toMatch(/twin\.openHouseType = 'By Appointment'/);
  });
  it('/open-houses card appends "· By Appointment" to the existing time badge (format otherwise unchanged)', () => {
    expect(CARD).toMatch(/oh\.openHouseType === 'By Appointment' \? ' · By Appointment' : ''/);
    // the existing "Open House" + start/end time badge is retained
    expect(CARD).toMatch(/<span className="font-semibold mr-1">Open House<\/span>/);
  });
  it('listing-detail sidebar appends "· By Appointment" to the existing time line (RSVP unchanged)', () => {
    expect(SIDEBAR).toMatch(/oh\.openHouseType === 'By Appointment' \? `\$\{timeStr\} · By Appointment` : timeStr/);
    expect(SIDEBAR).toMatch(/<OpenHouseRSVP/); // RSVP button retained
  });
});
