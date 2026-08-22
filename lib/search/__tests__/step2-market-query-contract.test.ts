/// <reference types="jest" />
/**
 * STEP 2 — the market route was a broken downstream consumer of the status path.
 *
 * Lives under lib/search/__tests__ rather than lib/market/__tests__ because it
 * belongs to the status-path closure and lib/search is a registered jest
 * project; adding a project for one file would be infrastructure churn.
 *
 * Found while tracing the status impact graph, not by looking for it:
 *
 *   1. Its Cotality fallback filtered on `MlsStatus`, which the provider
 *      suppresses for filtering. Both queries returned HTTP 400 every time they
 *      ran, so the fallback never worked and DB-only numbers were reported as
 *      complete.
 *   2. It asked for `Active` only, while the DATABASE branch of the same route
 *      defines the active market as Active + ComingSoon + ActiveUnderContract.
 *      Two branches of one endpoint answering different questions.
 *   3. `type` had two spellings and one reader: MarketSnapshot.tsx sends
 *      `rental`, MarketReportContent.tsx sends `rent`, and the route tested
 *      `=== 'rent'`. Every MarketSnapshot rental request ran the SALE branch.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  normalizeMarketType,
  marketPropertyClass,
  marketActiveStatusFilter,
  marketClosedStatusFilter,
} from '@/lib/market/query-contract';

describe('both spellings of rental mean rental', () => {
  it.each(['rent', 'rental', 'RENTAL', ' Rent '])('%p is rental', (v) => {
    expect(normalizeMarketType(v)).toBe('rental');
  });

  it.each(['sale', '', undefined, null, 'anything'])('%p is sale', (v) => {
    expect(normalizeMarketType(v)).toBe('sale');
  });

  it('a rental request cannot fall through to the sale property class', () => {
    // The concrete bug: MarketSnapshot sends 'rental'.
    expect(marketPropertyClass(normalizeMarketType('rental'))).toBe("PropertyType eq 'ResidentialLease'");
  });
});

describe('the active market matches this route own DB definition', () => {
  it('is Active + ComingSoon + ActiveUnderContract', () => {
    const f = marketActiveStatusFilter();
    expect(f).toContain("StandardStatus eq 'Active'");
    expect(f).toContain("StandardStatus eq 'ComingSoon'");
    expect(f).toContain("StandardStatus eq 'ActiveUnderContract'");
  });

  it('does NOT add Pending', () => {
    // Populated on the feed, but the active market is a Mallan business
    // definition and population is not a reason to change it.
    expect(marketActiveStatusFilter()).not.toContain("StandardStatus eq 'Pending'");
  });

  it('closed is exactly Closed', () => {
    expect(marketClosedStatusFilter()).toBe("StandardStatus eq 'Closed'");
  });
});

describe('no filter touches the suppressed MlsStatus field', () => {
  it('neither rendered filter contains MlsStatus', () => {
    expect(marketActiveStatusFilter()).not.toContain('MlsStatus');
    expect(marketClosedStatusFilter()).not.toContain('MlsStatus');
  });

  it('the route itself builds no MlsStatus predicate', () => {
    const src = readFileSync(join(__dirname, '..', '..', '..', 'app/api/market/route.ts'), 'utf8')
      .split(String.fromCharCode(10))
      .filter((l) => !l.trim().startsWith('//'))
      .join(String.fromCharCode(10));
    expect(src).not.toMatch(/MlsStatus eq/);
  });
});
