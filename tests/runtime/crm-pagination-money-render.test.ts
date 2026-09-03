import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..');
const PAGINATION = join(REPO, 'public', 'crm', 'js', 'search', 'pagination.js');

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DETAIL RENDERER WAS NEVER MOUNTED BY A TEST.
 *
 * `crm-null-money-render-safety` covers the five `render-*` files and proved
 * them safe. It does not load `pagination.js`, which owns the results row, the
 * lux detail panel, the financial breakdown, the print/PDF renderer, the email
 * body and the compare table.
 *
 * So when the null-to-zero coercion was removed — correctly — nothing caught
 * that this file still called `.toLocaleString()` directly on the nulls now
 * being preserved. CI stayed green while the detail panel could throw.
 *
 * THREE STATES, EVERY READER:
 *   null      unknown            -> "Unavailable" / "N/A", never $0, never a throw
 *   0         a real zero        -> "$0", never "unknown"
 *   positive  an amount          -> formatted
 *
 * `$0 maintenance` and `maintenance not supplied` are different statements about
 * a co-op, and a broker reading the wrong one carries it into a client
 * conversation.
 */
const SOURCE = readFileSync(PAGINATION, 'utf8');

/**
 * Evaluate the two money helpers exactly as the file defines them, rather than
 * restating them here — a restated helper proves only that the test agrees with
 * itself.
 */
function helpers() {
  const money = /var money = function\(v\) \{[^}]*\};/.exec(SOURCE)?.[0];
  const moneyMo = /var moneyMo = function\(v\) \{[^}]*\};/.exec(SOURCE)?.[0];
  if (!money || !moneyMo) throw new Error('money helpers not found in pagination.js');
  // eslint-disable-next-line no-new-func
  return new Function(`${money} ${moneyMo} return { money, moneyMo };`)() as {
    money: (v: unknown) => string;
    moneyMo: (v: unknown) => string;
  };
}

describe('the money helpers keep unknown, zero and amount distinct', () => {
  const { money, moneyMo } = helpers();

  it('renders UNKNOWN as Unavailable, not $0', () => {
    expect(money(null)).toBe('Unavailable');
    expect(money(undefined)).toBe('Unavailable');
    expect(moneyMo(null)).toBe('Unavailable');
  });

  it('renders a GENUINE ZERO as $0, not as unknown', () => {
    // The truthiness tests this replaced showed a real 0 as "---" / "N/A",
    // which tells a broker the figure is missing when it was actually stated.
    expect(money(0)).toBe('$0');
    expect(moneyMo(0)).toBe('$0/mo');
  });

  it('renders an amount', () => {
    expect(money(1850)).toBe('$1,850');
    expect(moneyMo(1850)).toBe('$1,850/mo');
  });

  it('never throws on the null that is now preserved', () => {
    expect(() => money(null)).not.toThrow();
    expect(() => moneyMo(null)).not.toThrow();
  });
});

describe('no money reader bypasses the helpers', () => {
  it('calls no bare .toLocaleString() on a money field', () => {
    // The crash path: removing the null-to-zero coercion without tracing every
    // reader left `listing.totalMonthly.toLocaleString()` in the detail panel.
    const bare = [
      ...SOURCE.matchAll(
        /listing\.(maintCC|totalMonthly|reTaxes|originalPrice|price)\.toLocaleString\(\)/g,
      ),
    ].map((m) => m[0]);
    expect(bare).toEqual([]);
  });

  it('uses no truthiness test to CHOOSE a money render', () => {
    // `listing.reTaxes ? '$' + … : '---'` renders a genuine 0 as unknown.
    //
    // Targets the wrong PATTERN — truthiness selecting between a money render
    // and a placeholder — rather than every `?` near a money field. A blanket
    // match flagged `listing.price < listing.originalPrice ? 'Reduced' : …`,
    // which is a comparison inside a block that has already guarded both values,
    // and a guard that cries wolf gets widened until it says nothing.
    const truthy = [
      ...SOURCE.matchAll(/listing\.(maintCC|totalMonthly|reTaxes|originalPrice|price)\s*\?\s*'\$'/g),
      ...SOURCE.matchAll(/\bl\.(maintCC|reTaxes)\s*\?\s*'\$'/g),
    ].map((m) => m[0]);
    expect(truthy).toEqual([]);
  });

  it('never falls back to a literal zero for unknown money', () => {
    // `(listing.originalPrice || listing.price || 0).toLocaleString()` printed
    // "$0" in the timeline for a listing whose price is simply not known.
    expect(SOURCE).not.toMatch(/\|\|\s*0\)\.toLocaleString\(\)/);
  });

  it('no longer coerces unknown money to zero', () => {
    for (const field of ['totalMonthly', 'maintCC', 'reTaxes']) {
      expect(SOURCE).not.toContain(`listing.${field} = 0;`);
    }
  });

  it('found money readers at all — guard the guard', () => {
    // A parse matching nothing would make the three assertions above pass
    // vacuously, which is exactly how the render-safety suite stayed green while
    // this file was unsafe.
    expect((SOURCE.match(/money\(listing\./g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect((SOURCE.match(/moneyMo\(listing\./g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
