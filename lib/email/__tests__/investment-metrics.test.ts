import { computeInvestmentMetrics, parseMoney } from '../investment-metrics';

describe('parseMoney', () => {
  it('extracts a number from money-ish strings', () => {
    expect(parseMoney('$4,305 / mo')).toBe(4305);
    expect(parseMoney('1,748.65')).toBe(1748.65);
    expect(parseMoney(765000)).toBe(765000);
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('n/a')).toBeNull();
  });
});

describe('computeInvestmentMetrics — 333 E 46th figures', () => {
  const m = computeInvestmentMetrics({ price: 765000, monthlyRent: 4305, monthlyMaintenance: 1748.65, sqft: 640 });

  it('computes NOI, cap rate, price/SF, cash flow and GRM', () => {
    expect(m.noiAnnual).toBeCloseTo(30676.2, 1);     // (4305-1748.65)*12
    expect(m.capRatePct).toBeCloseTo(4.01, 2);        // NOI / price
    expect(m.pricePerSqft).toBeCloseTo(1195.31, 2);   // 765000 / 640
    expect(m.monthlyCashFlow).toBeCloseTo(2556.35, 2);
  });

  it('produces a headline band and snapshot rows with the key figures', () => {
    const flat = [...m.headline, ...m.rows].map((r) => `${r.label}=${r.value}`).join('|');
    expect(flat).toContain('Asking Price=$765,000');
    expect(flat).toContain('Est. Cap Rate=4.0%');
    expect(flat).toContain('$30,676');   // NOI
    expect(flat).toContain('$1,195');    // price / SF
  });
});

describe('computeInvestmentMetrics — graceful when data is missing', () => {
  it('omits rent-derived metrics when no rent is given', () => {
    const m = computeInvestmentMetrics({ price: 765000, sqft: 640 });
    expect(m.capRatePct).toBeNull();
    expect(m.noiAnnual).toBeNull();
    expect(m.pricePerSqft).toBeCloseTo(1195.31, 2); // still computable from sqft
    expect(m.headline.some((r) => r.label === 'Asking Price')).toBe(true);
  });

  it('omits price/SF when square footage is unknown', () => {
    const m = computeInvestmentMetrics({ price: 765000, monthlyRent: 4305, monthlyMaintenance: 1748.65 });
    expect(m.pricePerSqft).toBeNull();
    expect(m.capRatePct).toBeCloseTo(4.01, 2);
  });
});
