/// <reference types="jest" />
/**
 * MAPPED_BUT_RENDERER_UNSAFE — the mapper's honesty undone at the last inch.
 *
 * The mapper was deliberately stripped of invented defaults: an unknown fee must
 * stay unknown rather than become $0, an unknown borough must stay unknown
 * rather than become Manhattan, an unknown status must stay unknown rather than
 * become Active. That was a real fix, and it is worth nothing if a renderer
 * re-invents the same values one layer later.
 *
 * `Utils.formatMoney` did exactly that:
 *
 *     if (amount == null || isNaN(amount)) return '$0';
 *
 * An unknown amount rendered as $0. A broker reading "$0 maintenance" on a
 * listing whose maintenance is simply not published will quote that to a client.
 * "Unknown" and "free" are opposite facts and the renderer was collapsing them.
 *
 * THE DISTINCTION THAT MUST SURVIVE: a REAL zero is a real fact and still
 * renders $0. Only absence renders as unknown. A guard that turned 0 into "—"
 * would be the same defect pointed the other way.
 *
 * Note the codebase already had the right shape elsewhere — the compliance
 * renderer's formatCurrency returns '—' for null — so the two money renderers
 * disagreed about null, which is how one of them stayed wrong.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { runInNewContext } from 'vm';

const REPO = resolve(__dirname, '../..');
const utils = readFileSync(resolve(REPO, 'public/crm/js/dashboard/utils.js'), 'utf8');
const app = readFileSync(resolve(REPO, 'public/crm/js/dashboard/app.js'), 'utf8');

/** Execute the real formatMoney rather than asserting on its source. */
function money(value: unknown): string {
  const start = utils.indexOf('function formatMoney(');
  const end = utils.indexOf('\n  }', start) + '\n  }'.length;
  const body = utils.slice(start, end);
  const sandbox: Record<string, unknown> = { Number, isNaN, String };
  sandbox.globalThis = sandbox;
  return runInNewContext(body + ';formatMoney(V);', { ...sandbox, V: value }) as string;
}

describe('an unknown amount is never rendered as a number', () => {
  const UNKNOWNS: Array<[unknown, string]> = [
    [null, 'null — the mapper says "not published"'],
    [undefined, 'undefined — the field never arrived'],
    ['', 'empty string'],
    [NaN, 'a value that failed to parse'],
  ];
  it.each(UNKNOWNS)('%p renders as unknown (%s)', (value) => {
    expect(money(value)).toBe('—');
  });

  it('does not render unknown as $0', () => {
    // The exact defect: "unknown" and "free" are opposite facts.
    expect(money(null)).not.toBe('$0');
    expect(money(undefined)).not.toBe('$0');
  });
});

describe('a real zero is still a real fact', () => {
  it('0 renders as $0', () => {
    // A guard that turned 0 into "—" would be the same defect reversed. A $0
    // common charge is a genuine and meaningful value.
    expect(money(0)).toBe('$0');
  });

  it("the string '0' renders as $0 too", () => {
    expect(money('0')).toBe('$0');
  });

  it('ordinary amounts are unaffected', () => {
    expect(money(1_250_000)).toBe('$1,250,000');
    expect(money('4500')).toBe('$4,500');
  });
});

describe('the price fallback does not swallow a legitimate zero', () => {
  it('listing price is not read with a || fallback', () => {
    // `l.ListPrice || l.price` treats a real 0 as absent and falls through to a
    // different field — the `||`-swallows-zero bug this codebase names
    // explicitly in its own contributor rules.
    const code = app
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    expect(code).not.toMatch(/l\.ListPrice \|\| l\.price/);
  });

  it('it uses nullish coalescing instead', () => {
    expect(app).toMatch(/l\.ListPrice \?\? l\.price/);
  });
});

describe('the two money renderers agree about unknown', () => {
  it('the compliance renderer already returned an em dash', () => {
    // It was right all along; formatMoney was the odd one out, which is how the
    // disagreement survived.
    const compliance = readFileSync(
      resolve(REPO, 'public/crm/js/compliance/compliance-gates-and-output.js'),
      'utf8',
    );
    const start = compliance.indexOf('function formatCurrency(');
    expect(compliance.slice(start, start + 220)).toMatch(/return '—'/);
  });
});

/**
 * THE SAME RULE, FOR THE OTHER FACTS THE MAPPER REFUSES TO INVENT.
 *
 * Money is not special. An unknown BOROUGH must not become Manhattan and an
 * unknown STATUS must not become Active — the first is wrong on the card, the
 * map, the report and every saved search; the second is a misstatement in an
 * advertisement, because a closed or expired listing presented as Active is
 * exactly what NY DOS advertising rules exist to prevent.
 *
 * The distinction that keeps this honest: these are PROVIDER facts about
 * someone else's listing. Mallan's own workflow objects — a showing that
 * defaults to 'Scheduled', a document that defaults to 'uploaded', a client
 * pipeline stage that defaults to 'new' — are Mallan-authored and defaulting
 * them is legitimate. Only provider facts are covered here.
 */
describe('no renderer invents a borough', () => {
  it.each([
    'public/crm/js/core/data-loader.js',
    'public/crm/js/compliance/compliance-gates-and-output.js',
  ])('%s does not default borough to Manhattan', (file) => {
    const code = readFileSync(resolve(REPO, file), 'utf8')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    expect(code).not.toMatch(/borough\s*\|\|\s*['"]Manhattan['"]/);
  });
});

describe('no renderer invents a listing status', () => {
  it.each([
    'public/crm/js/dashboard/panels.js',
    'public/crm/js/dashboard/portals.js',
    'public/crm/js/dashboard/workspace.js',
    'public/crm/js/output/report-package.js',
  ])('%s does not default a listing status to Active', (file) => {
    const code = readFileSync(resolve(REPO, file), 'utf8')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    expect(code).not.toMatch(/\bl\.status \|\| .*['"]Active['"]/);
    expect(code).not.toMatch(/\(s \|\| ['"]Active['"]\)/);
  });
});

describe('an unknown build year does not become an era', () => {
  it('falls to unknown rather than Pre-War', () => {
    // parseInt(undefined) is NaN, every comparison against NaN is false, and the
    // final ternary branch caught it — so a listing with no YearBuilt was
    // labelled Pre-War on the strength of no information at all.
    const loader = readFileSync(resolve(REPO, 'public/crm/js/core/data-loader.js'), 'utf8');
    const start = loader.indexOf('function _eraFromYearBuilt(');
    expect(start).toBeGreaterThan(-1);
    // Include the closing brace — slicing to its index alone yields a function
    // body that cannot parse.
    const CLOSE = '\n        }';
    const body = loader.slice(start, loader.indexOf(CLOSE, start) + CLOSE.length);

    const sandbox: Record<string, unknown> = { parseInt, isNaN };
    sandbox.globalThis = sandbox;
    const era = (y: unknown) =>
      runInNewContext(body + ';_eraFromYearBuilt(Y);', { ...sandbox, Y: y }) as string;

    expect(era(undefined)).toBe('');
    expect(era(null)).toBe('');
    expect(era('')).toBe('');
    expect(era('not a year')).toBe('');
    // Real years still classify.
    expect(era(1925)).toBe('Pre-War');
    expect(era(1975)).toBe('Post-War');
    expect(era(2020)).toBe('New Construction');
  });
});

describe("Mallan's own workflow defaults are left alone", () => {
  it('a showing status may still default', () => {
    // These are Mallan-authored objects, not provider facts. Banning defaults
    // everywhere would teach the wrong rule and break real workflow UI.
    const rentals = readFileSync(
      resolve(REPO, 'public/crm/js/dashboard/panels/rentals-crm/index.js'),
      'utf8',
    );
    expect(rentals).toMatch(/s\.status \|\| 'Scheduled'/);
  });
});

/**
 * THE FARE ACT DISCLOSURE MAY NOT INVENT A ZERO FEE.
 *
 * `'$' + (f.applicationFee || 0)` printed "App fee: $0" for an ABSENT fee —
 * telling a renter no application fee exists, inside the disclosure that exists
 * to state fees truthfully. The FARE Act attaches penalties to fee-disclosure
 * violations; the amounts are deliberately not restated here.
 *
 * `||` could not tell the two cases apart in either direction: a genuine $0 fee
 * is falsy and took the same branch, so "unknown" and "free" rendered
 * identically and neither could be trusted.
 */
describe('FARE Act fee disclosure separates unknown from zero', () => {
  const BADGES = readFileSync(
    resolve(__dirname, '..', '..', 'public/crm/js/render/shared-badges.js'),
    'utf8',
  );

  it('no longer coerces an absent application fee to 0', () => {
    const fn = BADGES.slice(
      BADGES.indexOf('function fareActDisclosure'),
      BADGES.indexOf('Participant Only Badge Helper'),
    );
    expect(fn).not.toContain('(f.applicationFee || 0)');
    expect(fn).toContain('fareFeeAmount(f.applicationFee)');
  });

  it('the formatter reports unknown as unknown and a real zero as $0', () => {
    // Extracted and executed rather than pattern-matched: the distinction is
    // behavioural, and a comment claiming it proves nothing.
    const src = BADGES.slice(
      BADGES.indexOf('function fareFeeAmount'),
      BADGES.indexOf('// ── FARE Act Fee Disclosure Helper'),
    );
    // eslint-disable-next-line no-new-func
    const fareFeeAmount = new Function(`${src}; return fareFeeAmount;`)() as (v: unknown) => string;

    expect(fareFeeAmount(null)).toBe('Not stated');
    expect(fareFeeAmount(undefined)).toBe('Not stated');
    expect(fareFeeAmount('')).toBe('Not stated');
    expect(fareFeeAmount('not-a-number')).toBe('Not stated');
    // A real zero is a real fact about a rental and must survive.
    expect(fareFeeAmount(0)).toBe('$0');
    expect(fareFeeAmount(50)).toBe('$50');
    expect(fareFeeAmount(1500)).toBe('$1,500');
  });

  it('an unknown broker-fee payer is not labelled with a bare abbreviation', () => {
    expect(BADGES).toContain("f.brokerFeePaidBy || 'Not stated'");
  });
});
