/**
 * `toDisplayListing`'s LOCAL FALLBACK branch is a legacy/dead path.
 *
 * WHY THIS MATTERS
 * ----------------
 * `lib/idx/display-adapter.ts:197` hard-codes, inside that fallback:
 *
 *     internetAddressDisplayYN: true
 *
 * with the comment "Local listings don't have this flag — default to true".
 * If that branch could receive RLS-backed or seller-suppressed inventory, a
 * hard-coded `true` would be a genuine FAIL-OPEN defect: it would build an
 * address-bearing slug for a listing whose address must be withheld.
 *
 * REACHABILITY PROOF (2026-08-07)
 * -------------------------------
 * `toDisplayListing` branches on shape:
 *
 *     if (typeof raw.listPrice === 'number') return fromPublicDTO(raw);
 *     // ...otherwise the nested-`Listing` local fallback
 *
 * Its ONLY production callers are `lib/hooks/useListings.ts:217` and `:263`,
 * and both map `data.listings` from `fetch('/api/listings?…')`. That endpoint
 * returns `PublicListingDTO`, which carries `listPrice` as a TOP-LEVEL number
 * (`lib/idx/public-dto.ts:170,435`) — verified live on production 2026-08-07:
 *
 *     top-level listPrice: 128000000
 *     nested price object: absent
 *
 * So the guard is always true for real data and the fallback never executes.
 *
 * CLASSIFICATION: UNREACHABLE — legacy/dead path. NOT corrected, because
 * changing an unexecuted branch's semantics is risk without benefit. These
 * tests pin the reachability facts so that if the shape contract ever changes,
 * this fails and the hard-coded `true` gets revisited BEFORE it can leak.
 *
 * "Local" is not a synonym for "permission granted." If a future caller feeds
 * the nested shape, route it through `decideDbPublicAddress` first.
 */

import fs from 'fs';
import path from 'path';
import { toDisplayListing } from '../../lib/idx/display-adapter';

const ROOT = path.resolve(__dirname, '../..');
const readSrc = (p: string) =>
  fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n?/g, '\n');

describe('the only production callers feed PublicListingDTO', () => {
  const hook = readSrc('lib/hooks/useListings.ts');

  it('useListings fetches /api/listings', () => {
    expect(hook).toContain("fetch(`/api/listings?");
  });

  it('both call sites map the API response through toDisplayListing', () => {
    const uses = hook.match(/\.map\(toDisplayListing\)/g) || [];
    expect(uses.length).toBe(2);
  });

  it('no OTHER production module calls toDisplayListing', () => {
    // If this fails, a new caller exists and the reachability proof must be
    // redone before trusting the hard-coded `internetAddressDisplayYN: true`.
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', '.next', '.git'].includes(e.name)) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name)) {
          const rel = path.relative(ROOT, full).split(path.sep).join('/');
          if (rel === 'lib/idx/display-adapter.ts') continue;
          if (fs.readFileSync(full, 'utf8').includes('toDisplayListing')) hits.push(rel);
        }
      }
    };
    for (const d of ['app', 'lib']) walk(path.join(ROOT, d));
    expect(hits).toEqual(['lib/hooks/useListings.ts']);
  });
});

describe('the DTO shape keeps the fallback unreachable', () => {
  it('PublicListingDTO declares listPrice as a top-level number', () => {
    const dto = readSrc('lib/idx/public-dto.ts');
    expect(dto).toMatch(/^\s*listPrice: number;/m);
  });

  it('a flat PublicListingDTO takes the fromPublicDTO branch, not the fallback', () => {
    const out = toDisplayListing({
      id: 'RLS20059088',
      listPrice: 128000000,            // top-level number -> guard is true
      slug: '217-w-57th-street',
      address: { streetNumber: '217', streetName: 'W 57th Street', city: 'New York City', county: 'New York', postalCode: '10019', unitNumber: null },
      media: [],
    });
    // fromPublicDTO passes the DTO's own slug straight through; the fallback
    // would instead RE-GENERATE one via generateListingSlug.
    expect(out.slug).toBe('217-w-57th-street');
  });

  it('a zero price is still a number — the guard does not fall through on 0', () => {
    const out = toDisplayListing({
      id: 'RLS0',
      listPrice: 0,
      slug: 'zero-price-listing',
      address: { streetNumber: '1', streetName: 'Test St', city: 'New York City', county: 'New York', postalCode: '10019', unitNumber: null },
      media: [],
    });
    expect(out.slug).toBe('zero-price-listing');
  });
});

describe('the fallback still carries its unreviewed hard-coded permission', () => {
  it('documents that the branch hard-codes internetAddressDisplayYN: true', () => {
    // Deliberately asserting the CURRENT state. This is not an endorsement —
    // it is a tripwire. If someone makes the branch reachable, the reachability
    // tests above fail first; if someone edits this line, they must revisit
    // whether the branch is still unreachable.
    const adapter = readSrc('lib/idx/display-adapter.ts');
    expect(adapter).toContain('internetAddressDisplayYN: true');
  });
});
