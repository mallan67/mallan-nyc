/**
 * BATHROOMS MEAN full + half x 0.5 ON EVERY PATH.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT
 *
 * Both public paths hand-wrote the rule instead of sharing the contract, and
 * both wrote it wrong in the same way:
 *
 *     minBaths=1.5  ->  BathroomsFull >= 1 AND BathroomsHalf >= 1
 *
 * That demands a half-bath. A 2-full/0-half apartment holds 2.0 baths and is
 * excluded. Measured on the live Preview at 1a05ab84: `minBaths=1.5` returned
 * 1,896 results and `minBaths=2` returned 3,674 — a STRICTER minimum returning
 * 1,778 MORE listings.
 *
 * `maxBaths` was wrong in the other direction: it capped only the full count, so
 * a 1-full/3-half listing (2.5 baths) satisfied `maxBaths=1.5`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THESE TESTS ARE EXHAUSTIVE RATHER THAN ANECDOTAL
 *
 * The named cases below are required and are asserted. But a rule about a
 * numeric threshold should be proven over its whole domain, not at four points —
 * the original rule would have passed several plausible spot-checks (it gets
 * 1-full/1-half right, and every whole-number threshold right). What it could
 * not survive is being compared against `bathTotal` at every combination.
 */
import {
  bathTotal,
  minBathsAlternatives,
  maxBathsAlternatives,
  minBathsPrisma,
  maxBathsPrisma,
  minBathsOData,
  maxBathsOData,
} from '../canonical/bath-contract';

type Half = number | null;
type Full = number | null;

/** Does a row satisfy one rendered alternative set? Mirrors the SQL/OData semantics. */
function matchesMinAlternatives(full: Full, half: Half, min: number): boolean {
  return minBathsAlternatives(min).some((a) =>
    a.fullAtLeast !== undefined
      ? (full ?? -1) >= a.fullAtLeast // NULL full cannot satisfy a floor
      : (full ?? 0) === a.fullExactly && (half ?? 0) >= (a.halfAtLeast as number),
  );
}

function matchesMaxAlternatives(full: Full, half: Half, max: number): boolean {
  return maxBathsAlternatives(max).some(
    (a) => (full ?? 0) === a.fullExactly && (half ?? 0) <= a.halfAtMost,
  );
}

/**
 * A minimal evaluator for the exact Prisma shape the renderer emits: OR / AND /
 * { field: n } / { gte } / { lte } / { field: null }. Deliberately supports
 * nothing else, so a renderer that started emitting something richer would throw
 * here rather than being silently mis-evaluated.
 */
function evalPrisma(node: Record<string, unknown>, row: { full: Full; half: Half }): boolean {
  if ('OR' in node) return (node.OR as Record<string, unknown>[]).some((n) => evalPrisma(n, row));
  if ('AND' in node) return (node.AND as Record<string, unknown>[]).every((n) => evalPrisma(n, row));
  const entries = Object.entries(node);
  if (entries.length !== 1) throw new Error(`unsupported node: ${JSON.stringify(node)}`);
  const [field, cond] = entries[0];
  const value = field === 'bathrooms_full' ? row.full : row.half;
  if (cond === null) return value === null || value === undefined;
  if (typeof cond === 'number') return value === cond;
  const c = cond as Record<string, number>;
  if ('gte' in c) return value !== null && value !== undefined && value >= c.gte;
  if ('lte' in c) return value !== null && value !== undefined && value <= c.lte;
  if ('lt' in c) return value !== null && value !== undefined && value < c.lt;
  throw new Error(`unsupported condition: ${JSON.stringify(cond)}`);
}

const FULLS = [0, 1, 2, 3, 4, 5, 6];
const HALVES = [0, 1, 2, 3, 4];
const THRESHOLDS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];

describe('the canonical value is full + half x 0.5', () => {
  it('computes the numeric truth, counting a blank component as zero', () => {
    expect(bathTotal(2, 0)).toBe(2);
    expect(bathTotal(1, 1)).toBe(1.5);
    expect(bathTotal(2, 1)).toBe(2.5); // required case
    expect(bathTotal(1, 0)).toBe(1);
    expect(bathTotal(0, 3)).toBe(1.5);
    expect(bathTotal(null, null)).toBe(0);
    expect(bathTotal(2, null)).toBe(2);
  });
});

describe('the required cases, named exactly as ruled', () => {
  const min = (f: Full, h: Half, t: number) => matchesMinAlternatives(f, h, t);
  const max = (f: Full, h: Half, t: number) => matchesMaxAlternatives(f, h, t);

  it('2 full + 0 half: passes min 1.5, passes min 2, fails max 1.5', () => {
    // THE DEFECT'S VICTIM. 2.0 baths, previously rejected by `minBaths=1.5`
    // because the old rule demanded a half-bath.
    expect(min(2, 0, 1.5)).toBe(true);
    expect(min(2, 0, 2)).toBe(true);
    expect(max(2, 0, 1.5)).toBe(false);
  });

  it('1 full + 1 half: passes min 1.5, fails min 2, passes max 1.5', () => {
    expect(min(1, 1, 1.5)).toBe(true);
    expect(min(1, 1, 2)).toBe(false);
    expect(max(1, 1, 1.5)).toBe(true);
  });

  it('1 full + 0 half: fails min 1.5, passes max 1.5', () => {
    expect(min(1, 0, 1.5)).toBe(false);
    expect(max(1, 0, 1.5)).toBe(true);
  });

  it('2 full + 1 half: numeric truth is 2.5 and behaves like it', () => {
    expect(bathTotal(2, 1)).toBe(2.5);
    expect(min(2, 1, 2.5)).toBe(true);
    expect(min(2, 1, 3)).toBe(false);
    expect(max(2, 1, 2.5)).toBe(true);
    expect(max(2, 1, 2)).toBe(false);
  });

  it('1 full + 3 half is 2.5 and must FAIL max 1.5 — the old rule let it through', () => {
    // The old max capped `BathroomsFull <= 1` only, so this passed.
    expect(bathTotal(1, 3)).toBe(2.5);
    expect(max(1, 3, 1.5)).toBe(false);
  });

  it('min and max together select the band, not one end of it', () => {
    const band = (f: number, h: number) => min(f, h, 1.5) && max(f, h, 2);
    expect(band(1, 1)).toBe(true);  // 1.5
    expect(band(2, 0)).toBe(true);  // 2.0
    expect(band(1, 0)).toBe(false); // 1.0 — below
    expect(band(2, 1)).toBe(false); // 2.5 — above
  });
});

describe('every rendering agrees with the canonical value, at every combination', () => {
  it('the alternatives are EXACT for min, across the whole grid', () => {
    const wrong: string[] = [];
    for (const t of THRESHOLDS) {
      for (const f of FULLS) {
        for (const h of HALVES) {
          const expected = bathTotal(f, h) >= t;
          if (matchesMinAlternatives(f, h, t) !== expected) wrong.push(`min ${t}: ${f}f/${h}h`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('the alternatives are EXACT for max, across the whole grid', () => {
    const wrong: string[] = [];
    for (const t of THRESHOLDS) {
      for (const f of FULLS) {
        for (const h of HALVES) {
          const expected = bathTotal(f, h) <= t;
          if (matchesMaxAlternatives(f, h, t) !== expected) wrong.push(`max ${t}: ${f}f/${h}h`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('the PRISMA rendering agrees with the canonical value, blanks included', () => {
    const wrong: string[] = [];
    for (const t of THRESHOLDS) {
      for (const f of [...FULLS, null] as Full[]) {
        for (const h of [...HALVES, null] as Half[]) {
          const total = bathTotal(f, h);
          if (evalPrisma(minBathsPrisma(t), { full: f, half: h }) !== total >= t) {
            wrong.push(`prisma min ${t}: ${f}f/${h}h (total ${total})`);
          }
          if (evalPrisma(maxBathsPrisma(t), { full: f, half: h }) !== total <= t) {
            wrong.push(`prisma max ${t}: ${f}f/${h}h (total ${total})`);
          }
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('guard the guard — the evaluator rejects a shape it does not understand', () => {
    // If evalPrisma silently returned false for an unknown node, every
    // assertion above could pass against a renderer that had drifted.
    expect(() => evalPrisma({ bathrooms_full: { contains: 2 } } as never, { full: 2, half: 0 }))
      .toThrow(/unsupported condition/);
  });

  it('the ODATA rendering uses only permitted operators and never arithmetic', () => {
    // `div` and `mul` are PROVIDER_REJECTED, which is why the rule is expanded
    // into a disjunction rather than computed on the provider.
    for (const t of THRESHOLDS) {
      for (const s of [minBathsOData(t), maxBathsOData(t)]) {
        expect(s).not.toMatch(/\b(div|mul|add|sub)\b/);
        expect(s).toMatch(/BathroomsFull/);
        expect(s.replace(/BathroomsFull|BathroomsHalf|\d|[()\s.]/g, '').replace(/eq|ge|le|or|and|lt/g, ''))
          .toBe('');
      }
    }
  });

  it('the min-1.5 OData is exactly the disjunction verified live', () => {
    // Live-probed 2026-09-01 against api.cotality.com: 4,182 Active rows, and
    // 3,781 for `BathroomsFull ge 2` — the correct direction.
    expect(minBathsOData(1.5)).toBe(
      '(BathroomsFull ge 2 or (BathroomsFull eq 0 and BathroomsHalf ge 3) or (BathroomsFull eq 1 and BathroomsHalf ge 1))',
    );
  });
});

describe('monotonicity — behavioural, over a modelled universe', () => {
  /** Every (full, half) combination, standing in for a universe of listings. */
  const UNIVERSE = FULLS.flatMap((f) => HALVES.map((h) => ({ full: f as Full, half: h as Half })));

  const countMin = (t: number) =>
    UNIVERSE.filter((r) => evalPrisma(minBathsPrisma(t), r)).length;
  const countMax = (t: number) =>
    UNIVERSE.filter((r) => evalPrisma(maxBathsPrisma(t), r)).length;

  it('a stricter minimum can never return more listings', () => {
    // THE DEFECT'S SIGNATURE. On the live Preview the old rule gave
    // min1.5=1,896 < min2=3,674 — impossible for a real minimum.
    const counts = [1, 1.5, 2, 3].map(countMin);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    }
    // And it must actually discriminate, or the chain is trivially satisfied.
    expect(counts[0]).toBeGreaterThan(counts[counts.length - 1]);
  });

  it('a looser maximum can never return fewer listings', () => {
    const counts = [1, 1.5, 2, 3].map(countMax);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    }
    expect(counts[counts.length - 1]).toBeGreaterThan(counts[0]);
  });

  it('the OLD rule fails this monotonicity check — proving the test can detect it', () => {
    // Reinstating the removed predicate must break the chain, or these guards
    // would pass against the very bug they exist to catch.
    const oldMin = (r: { full: Full; half: Half }, t: number) =>
      (r.full ?? 0) >= Math.floor(t) && (t % 1 >= 0.5 ? (r.half ?? 0) >= 1 : true);
    const counts = [1, 1.5, 2, 3].map((t) => UNIVERSE.filter((r) => oldMin(r, t)).length);
    const monotone = counts.every((c, i) => i === 0 || c <= counts[i - 1]);
    expect(monotone).toBe(false);
  });
});
