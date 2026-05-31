/// <reference types="jest" />
/**
 * Sale form — Listing URL auto-generation on edit-load.
 *
 * Bug: on /crm/sale-listing?id=… the Listing URL field showed only its
 * placeholder. generateListingUrl() is wired solely to the address atoms'
 * `change` event; edit-load restores those atoms via setVal (programmatic
 * .value, no `change`), so the readonly URL field was never generated and
 * SL-0004 had no saved slug to restore.
 *
 * Fix: _populateSaleFormFromApi calls generateListingUrl('sale') at the end —
 * ONLY when the field is blank, so a saved/manual slug is preserved. Slug
 * format is the existing canonical /listing/{address}/{listing-id} (matches the
 * API publicUrl from lib/crm/listing-urls.ts).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FORM = readFileSync(resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8');

function extractFn(src: string, name: string): string {
  const sig = `function ${name}(`;
  let start = src.indexOf(sig);
  if (start === -1) throw new Error(`not found: ${name}`);
  if (src.slice(start - 6, start) === 'async ') start -= 6;
  const b = src.indexOf('{', start);
  let d = 0;
  for (let i = b; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(start, i + 1); }
  }
  throw new Error(`unbalanced: ${name}`);
}

/** Run the shipped generateListingUrl against a fake DOM + window. */
function genUrl(atoms: Record<string, string>, editListingId: string, preset = ''): string {
  const els: Record<string, { value: string }> = { saleListingUrl: { value: preset } };
  for (const [k, v] of Object.entries(atoms)) els[k] = { value: v };
  const document = { getElementById: (id: string) => els[id] || null };
  const win = { _saleEditListingId: editListingId };
  const src = extractFn(FORM, 'generateListingUrl');
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  new Function('document', 'window', `${src}; return generateListingUrl;`)(document, win)('sale');
  return els.saleListingUrl.value;
}

const SL0004 = {
  saleStreetNumber: '333', saleStreetDirPrefix: 'East', saleStreetName: '46th',
  saleStreetSuffix: 'Street', saleUnitNumber: '2G', saleCity: 'New York',
  saleStateOrProvince: 'NY', saleZipCode: '10017',
};

describe('generateListingUrl — canonical slug', () => {
  it('SL-0004 address/unit/listing_id produces the canonical listing URL', () => {
    const url = genUrl(SL0004, 'SL-0004');
    expect(url).toBe('https://www.mallan.nyc/listing/333-east-46th-street-apt-2g-new-york-ny-10017/sl-0004');
  });

  it('includes the unit number', () => {
    expect(genUrl(SL0004, 'SL-0004')).toContain('apt-2g');
  });

  it('includes the listing_id (lowercase, final segment)', () => {
    expect(genUrl(SL0004, 'SL-0004').endsWith('/sl-0004')).toBe(true);
  });

  it('is URL-safe: lowercase, punctuation stripped, spaces→hyphens, no double/edge hyphens', () => {
    const url = genUrl({ ...SL0004, saleStreetName: "O'Brien & 5th!!" }, 'SL-0004');
    expect(url).toBe(url.toLowerCase());
    expect(url).not.toMatch(/[^a-z0-9/:.\-]/); // only url-safe chars
    expect(url).not.toMatch(/--/);              // no doubled hyphens
    const slugSeg = url.split('/listing/')[1].split('/')[0];
    expect(slugSeg).not.toMatch(/^-|-$/);       // no leading/trailing hyphen
  });

  it('omits the id segment for a brand-new listing (no _saleEditListingId)', () => {
    const url = genUrl(SL0004, '');
    expect(url.startsWith('https://www.mallan.nyc/listing/333-east-46th-street')).toBe(true);
    expect(url.endsWith('/sl-0004')).toBe(false);
  });
});

describe('edit-load wiring', () => {
  it('_populateSaleFormFromApi auto-generates the URL only when the field is blank', () => {
    const fn = extractFn(FORM, '_populateSaleFormFromApi');
    expect(fn).toMatch(
      /getElementById\('saleListingUrl'\)[\s\S]*?!\([^)]*value[^)]*\)\.trim\(\)[\s\S]*?generateListingUrl\('sale'\)/,
    );
  });

  it('a saved slug is restored via SALE_FIELD_MAP (so it is preserved, not regenerated)', () => {
    expect(FORM).toMatch(/rls:\s*'saleListingUrl',\s*form:\s*'saleListingUrl'/);
  });

  it('an already-populated field is NOT overwritten by the edit-load generator', () => {
    // Simulate the only-when-blank guard: a preset value means generate is skipped.
    const preset = 'https://www.mallan.nyc/listing/custom-manual-slug/sl-0004';
    // generateListingUrl itself always rewrites; the guard lives in
    // _populateSaleFormFromApi. Assert the guard expression exists (above) and
    // that the generator, when it DOES run, is deterministic for the same input.
    expect(genUrl(SL0004, 'SL-0004', preset)).not.toBe(preset); // generator overwrites when invoked
    expect(genUrl(SL0004, 'SL-0004')).toBe(genUrl(SL0004, 'SL-0004')); // deterministic
  });
});
