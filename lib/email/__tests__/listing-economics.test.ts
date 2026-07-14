import { resolveListingEconomics } from '../listing-economics';

// Fixed evaluation dates so the temporal rules are deterministic.
const BEFORE_STEPUP = new Date(Date.UTC(2026, 6, 14)); // 2026-07-14 (before 8/15)
const AFTER_STEPUP = new Date(Date.UTC(2026, 8, 1));   // 2026-09-01 (after 8/15)

describe('resolveListingEconomics — temporal rent labeling (SL-0004 step-up)', () => {
  const base = {
    scheduledRent: '$4,305/mo',
    scheduledRentEffective: '2026-08-15',
    maintenance: '$1,748.65/mo',
    leaseExpiration: 'August 14, 2027',
  };

  it('does NOT treat the scheduled rent as current before its effective date', () => {
    const r = resolveListingEconomics({ ...base, currentRent: '', asOf: BEFORE_STEPUP });
    // The $4,305 figure lives ONLY under the scheduled label — current is unset.
    expect(r.currentRentValue).toBeNull();
    expect(r.showScheduledSeparately).toBe(true);
    expect(r.scheduledRent).toBe('$4,305/mo');
    expect(r.scheduledIsEffective).toBe(false);
    expect(r.scheduledEffectiveLabel).toBe('August 15, 2026');
    // Illustrative yield is on the scheduled rent AND labeled as such.
    expect(r.analysisRent).toBe(4305);
    expect(r.analysisRentShort).toBe('Scheduled Rent');
    expect(r.analysisRentBasis).toBe('scheduled rent effective August 15, 2026');
  });

  it('uses a verified current in-place rent as the basis when one is provided', () => {
    const r = resolveListingEconomics({ ...base, currentRent: '$3,900/mo', asOf: BEFORE_STEPUP });
    expect(r.currentRentValue).toBe('$3,900/mo');
    expect(r.showScheduledSeparately).toBe(true);   // future step-up still shown
    expect(r.scheduledRent).toBe('$4,305/mo');
    expect(r.analysisRent).toBe(3900);
    expect(r.analysisRentShort).toBe('In-Place Rent');
    expect(r.analysisRentBasis).toBe('current in-place rent');
  });

  it('once the effective date passes, the scheduled rent becomes the current rent', () => {
    const r = resolveListingEconomics({ ...base, currentRent: '', asOf: AFTER_STEPUP });
    expect(r.scheduledIsEffective).toBe(true);
    expect(r.showScheduledSeparately).toBe(false);
    expect(r.currentRentValue).toBe('$4,305/mo');
    expect(r.analysisRent).toBe(4305);
    expect(r.analysisRentShort).toBe('In-Place Rent');
    expect(r.analysisRentBasis).toBe('current in-place rent');
  });

  it('with no scheduled step-up, the current rent is the sole basis', () => {
    const r = resolveListingEconomics({
      currentRent: '$5,000/mo', maintenance: '$1,000/mo', asOf: BEFORE_STEPUP,
    });
    expect(r.currentRentValue).toBe('$5,000/mo');
    expect(r.showScheduledSeparately).toBe(false);
    expect(r.scheduledRent).toBeNull();
    expect(r.analysisRent).toBe(5000);
  });

  it('never treats an UNDATED scheduled rent as current (fail-closed)', () => {
    const r = resolveListingEconomics({ scheduledRent: '$4,305/mo', scheduledRentEffective: '', currentRent: '', asOf: BEFORE_STEPUP });
    expect(r.currentRentValue).toBeNull();               // NOT promoted to current
    expect(r.showScheduledSeparately).toBe(true);
    expect(r.scheduledRent).toBe('$4,305/mo');
    expect(r.scheduledEffectiveLabel).toBeNull();
    expect(r.analysisRentShort).toBe('Scheduled Rent');
    expect(r.analysisRentBasis).toBe('scheduled rent');
  });

  it('treats an INVALID effective date like undated (still never current)', () => {
    const r = resolveListingEconomics({ scheduledRent: '$4,305/mo', scheduledRentEffective: 'whenever', currentRent: '', asOf: BEFORE_STEPUP });
    expect(r.currentRentValue).toBeNull();
    expect(r.showScheduledSeparately).toBe(true);
    expect(r.analysisRentShort).toBe('Scheduled Rent');
  });

  it('omits rent-derived analysis when neither rent is known', () => {
    const r = resolveListingEconomics({ maintenance: '$900/mo', asOf: BEFORE_STEPUP });
    expect(r.currentRentValue).toBeNull();
    expect(r.analysisRent).toBeNull();
    expect(r.analysisRentShort).toBeNull();
    expect(r.analysisRentBasis).toBeNull();
  });
});
