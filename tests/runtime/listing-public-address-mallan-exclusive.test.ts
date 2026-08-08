/// <reference types="jest" />
/**
 * Public address display for Mallan exclusives — gate-4 fix.
 *
 * Root cause (verified via read-only prod diagnostic 2026-05-29):
 *   SL-0004 (Maya's first exclusive, rls_eligible=false website-only) had
 *   internet_address_display_yn=false. The detail page built the slug from the
 *   RAW column → suppressed slug `listing-sl-0004`, while dbListingToPublicDTO
 *   (CRM-exclusive-aware) built the ADDRESS slug → the agent card emitted the
 *   address URL the detail page's canonical didn't match → "Listing Not
 *   Available". Maya confirmed the address should be PUBLIC.
 *
 * Fix: detail-page suppression is now CRM-exclusive-aware (matches
 * dbListingToPublicDTO) and the slug derives from !suppressAddress, not the raw
 * column. Plus a data correction (scripts/correct-sl-0004-address-display.mjs).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateListingSlug } from '@/lib/listing-slug';
import { buildCanonicalListingPath } from '@/lib/listing-canonical-url';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const SL_0004_ADDR = {
  streetNumber: '333', streetDirPrefix: 'E', streetName: '46th Street',
  unitNumber: '2G', city: 'New York', stateOrProvince: 'NY', postalCode: '10017',
};

// ── RUNTIME: public address → address canonical; suppressed → id-only canonical ──
describe('canonical URL by address-display flag', () => {
  it('Mallan exclusive with PUBLIC address emits /listing/{address-slug}/{id}', () => {
    const slug = generateListingSlug({ address: SL_0004_ADDR, id: 'SL-0004', internetAddressDisplayYN: true });
    expect(buildCanonicalListingPath({ slug, id: 'SL-0004' }))
      .toBe('/listing/333-e-46th-street-apt-2g-new-york-ny-10017/sl-0004');
  });

  it('Mallan exclusive with SUPPRESSED address emits /listing/listing-{id} (no address leak)', () => {
    const slug = generateListingSlug({ address: SL_0004_ADDR, id: 'SL-0004', mlsId: 'SL-0004', internetAddressDisplayYN: false });
    expect(slug).toBe('listing-sl-0004');
    expect(buildCanonicalListingPath({ slug, id: 'SL-0004' })).toBe('/listing/listing-sl-0004');
    // No address atoms leak into the suppressed slug.
    expect(slug).not.toMatch(/46th|333|2g|new-york/i);
  });

  it('the address canonical for SL-0004 is a clean two-segment path (no hybrid, no ?key)', () => {
    const slug = generateListingSlug({ address: SL_0004_ADDR, id: 'SL-0004', internetAddressDisplayYN: true });
    const url = buildCanonicalListingPath({ slug, id: 'SL-0004' });
    expect(url).not.toContain('?key=');
    expect(url).not.toMatch(/-sl-0004$/);
    expect(url.split('/').filter(Boolean)).toEqual(['listing', '333-e-46th-street-apt-2g-new-york-ny-10017', 'sl-0004']);
  });
});

// ── SOURCE: detail page suppression respects seller opt-outs (Codex PR #274) ──
describe('detail page — address suppression respects opt-outs, slug from the same decision', () => {
  const page = read('app/listing/[...slug]/page.tsx');

  it('suppresses address ONLY for RLS-backed rows failing the address gate (respects opt-outs)', () => {
    expect(page).toMatch(/const suppressAddress = isRlsBacked && !canDisplayListingAddress\(dbListing\)/);
    // The earlier unconditional SL-/RL- prefix bypass (which would expose
    // RLS-eligible opt-out addresses) must be gone.
    expect(page).not.toMatch(/isCrmExclusiveListing/);
  });

  it('isRlsBacked is rls_eligible !== false → website-only (SL-0004) is NOT RLS-backed → address shown', () => {
    expect(page).toMatch(/const isRlsBacked = dbListing\.rls_eligible !== false/);
  });

  it('slug derives from the suppression DECISION, NOT the raw column (canonical owner)', () => {
    // CONTRACT MOVED (DTO collapse). The page no longer builds its own slug; it
    // delegates to dbListingToPublicDTO, which derives the slug from the same
    // suppression decision it uses for the address text. The invariant is
    // unchanged and now asserted where it lives — plus the page must not have
    // regrown a slug build, and must never key the slug off the raw column.
    const dtoSrc = read('lib/idx/db-to-public-dto.ts');
    expect(dtoSrc).toMatch(/internetAddressDisplayYN:\s*!suppressAddress/);
    expect(dtoSrc).not.toMatch(/internetAddressDisplayYN:\s*listing\.internet_address_display_yn/);
    expect(page).toMatch(/dbListingToPublicDTO\(dbListing\)/);
    expect(page).not.toMatch(/internetAddressDisplayYN:\s*dbListing\.internet_address_display_yn/);
  });
});

// ── SOURCE: form public-path default is TRUE; explicit suppression saves FALSE ──
describe('sales form — address-display default does not become false on null/missing', () => {
  const form = read('public/crm/SALE-FORM-REDESIGN.html');

  it('public (non-opt-out / non-participant / non-in-house) path defaults InternetAddressDisplayYN to true', () => {
    // `!== false` means null/undefined/missing checkbox → true. Only an explicit
    // unchecked (false) yields false.
    expect(form).toMatch(/data\.InternetAddressDisplayYN\s*=\s*data\.saleInternetAddressDisplayYN\s*!==\s*false/);
  });

  it('the address-display checkbox is checked by default (public unless explicitly suppressed)', () => {
    expect(form).toMatch(/id="saleInternetAddressDisplayYN"[^>]*checked/);
  });

  it('explicit suppression branches (owner opt-out / participant / in-house) still set false', () => {
    // In-house web-only still shows the address; internal-only suppresses.
    expect(form).toMatch(/data\.InternetAddressDisplayYN\s*=\s*isInHouseWebOnly\s*\?\s*true\s*:\s*false/);
  });
});

// ── SOURCE: data-correction script is safe (dry-run default, only false→true) ──
describe('SL-0004 address-display correction script — controlled', () => {
  const s = read('scripts/correct-sl-0004-address-display.mjs');
  it('defaults to dry run (writes only with --apply)', () => {
    expect(s).toMatch(/const APPLY = process\.argv\.includes\('--apply'\)/);
    expect(s).toMatch(/if \(APPLY\)/);
  });
  it('only flips blank/false → true, never true → false', () => {
    expect(s).toMatch(/internet_address_display_yn !== true/);
    expect(s).toMatch(/data\.internet_address_display_yn = true/);
  });
  it('targets ONLY SL-0004', () => {
    expect(s).toMatch(/const TARGET = 'SL-0004'/);
    expect(s).toMatch(/where: \{ listing_id: TARGET \}/);
  });
});
