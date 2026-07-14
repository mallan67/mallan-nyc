import {
  economicsFingerprint,
  validateConfirmation,
  buildConfirmationAudit,
  CONFIRMATION_TEXT,
} from '../campaign-confirmation';

const econ = {
  currentRent: '',
  scheduledRent: '$4,305/mo',
  scheduledRentEffective: '2026-08-15',
  maintenance: '$1,748.65/mo',
  leaseExpiration: 'August 14, 2027',
};

describe('economicsFingerprint — change ⇒ confirmation invalidated', () => {
  it('is stable for identical economics', () => {
    expect(economicsFingerprint('SL-0004', econ)).toBe(economicsFingerprint('SL-0004', econ));
  });

  it('changes when the scheduled/current rent changes', () => {
    expect(economicsFingerprint('SL-0004', { ...econ, scheduledRent: '$4,500/mo' }))
      .not.toBe(economicsFingerprint('SL-0004', econ));
  });

  it('changes when maintenance changes', () => {
    expect(economicsFingerprint('SL-0004', { ...econ, maintenance: '$1,800/mo' }))
      .not.toBe(economicsFingerprint('SL-0004', econ));
  });

  it('changes when lease expiration changes', () => {
    expect(economicsFingerprint('SL-0004', { ...econ, leaseExpiration: 'September 1, 2027' }))
      .not.toBe(economicsFingerprint('SL-0004', econ));
  });

  it('is listing-scoped (does not transfer across listings)', () => {
    expect(economicsFingerprint('SL-0004', econ)).not.toBe(economicsFingerprint('SL-0009', econ));
  });
});

describe('validateConfirmation — fail-closed gate', () => {
  const fp = economicsFingerprint('SL-0004', econ);

  it('requires the confirmation flag', () => {
    const r = validateConfirmation({ confirmed: false, fingerprint: fp }, fp);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('confirmation_required');
  });

  it('rejects a stale fingerprint (values edited after confirming)', () => {
    const staleFp = economicsFingerprint('SL-0004', { ...econ, maintenance: '$1,800/mo' });
    const r = validateConfirmation({ confirmed: true, fingerprint: staleFp }, fp);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('confirmation_stale');
  });

  it('accepts a matching, confirmed payload and passes through metadata', () => {
    const r = validateConfirmation(
      { confirmed: true, fingerprint: fp, confirmedAt: '2026-07-14T12:00:00.000Z', sourceRef: 'Lease PDF p.3' },
      fp,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.confirmedAt).toBe('2026-07-14T12:00:00.000Z');
      expect(r.sourceRef).toBe('Lease PDF p.3');
    }
  });
});

describe('buildConfirmationAudit — who/when/what is recorded', () => {
  const fp = economicsFingerprint('SL-0004', econ);
  const common = { listingId: 'SL-0004', economics: econ, fingerprint: fp, confirmedAt: '2026-07-14T12:00:00.000Z', sourceRef: 'Lease p.3' };

  it('records confirmed_by, confirmed_at, values, effective dates, and source', () => {
    const a = buildConfirmationAudit({ userId: 1, ...common });
    expect(a.confirmed_by).toBe(1);
    expect(a.confirmed_at).toBe('2026-07-14T12:00:00.000Z');
    expect(a.values_confirmed.scheduledRent).toBe('$4,305/mo');
    expect(a.values_confirmed.maintenance).toBe('$1,748.65/mo');
    expect(a.effective_dates.scheduledRentEffective).toBe('2026-08-15');
    expect(a.effective_dates.leaseExpiration).toBe('August 14, 2027');
    expect(a.source_reference).toBe('Lease p.3');
    expect(a.confirmation_text).toBe(CONFIRMATION_TEXT);
  });

  it('is tied to the confirming agent — another agent yields a different confirmed_by', () => {
    const a1 = buildConfirmationAudit({ userId: 1, ...common });
    const a2 = buildConfirmationAudit({ userId: 2, ...common });
    expect(a1.confirmed_by).toBe(1);
    expect(a2.confirmed_by).toBe(2);
  });
});
