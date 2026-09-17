/// <reference types="jest" />
/**
 * Contract for the canonical client-facing distribution boundary (test group C).
 *
 * The interpretation of the four REBNY flags for a CLIENT-facing send or action is defined exactly once,
 * in lib/compliance/client-distribution.ts. These tests pin the contract itself; the two route tests pin
 * that both consumers actually apply it.
 *
 * The fail behaviour is asymmetric ON PURPOSE and both directions are asserted here, because getting it
 * backwards in either direction is a known incident shape:
 *   - the two internet flags are PROVIDER-GATED / FAIL-OPEN — null must NOT block (commit 55803f87
 *     collapsed null → false and suppressed 7,594 rows);
 *   - owner opt-out and participant-only are PER-ROW / FAIL-CLOSED — only an explicit true blocks.
 */
import {
  evaluateClientDistributionEligibility,
  CLIENT_DISTRIBUTION_REFUSAL,
} from '@/lib/compliance/client-distribution';

const clean = {
  idx_display_yn: true,
  internet_entire_listing_display_yn: true,
  owner_opt_out: false,
  participant_only: false,
};

describe('a fully permissive listing is allowed', () => {
  it('allows, with no reasons', () => {
    expect(evaluateClientDistributionEligibility(clean)).toEqual({ allowed: true, reasons: [] });
  });
});

describe('ONE restrictive flag is enough to block', () => {
  it.each([
    ['idx_display_yn', { ...clean, idx_display_yn: false }],
    ['internet_entire_listing_display_yn', { ...clean, internet_entire_listing_display_yn: false }],
    ['owner_opt_out', { ...clean, owner_opt_out: true }],
    ['participant_only', { ...clean, participant_only: true }],
  ])('%s alone blocks, and names itself', (flag, input) => {
    const r = evaluateClientDistributionEligibility(input);
    expect({ allowed: r.allowed, reasons: r.reasons, why: 'one violated gate is sufficient' })
      .toEqual({ allowed: false, reasons: [flag], why: expect.any(String) });
  });
});

describe('combinations stay blocked, and every reason is reported', () => {
  it('two flags produce two reasons', () => {
    const r = evaluateClientDistributionEligibility({ ...clean, owner_opt_out: true, participant_only: true });
    expect(r.allowed).toBe(false);
    expect(r.reasons).toEqual(['owner_opt_out', 'participant_only']);
  });

  it('all four produce all four — a caller that showed only the first would hide the rest', () => {
    const r = evaluateClientDistributionEligibility({
      idx_display_yn: false,
      internet_entire_listing_display_yn: false,
      owner_opt_out: true,
      participant_only: true,
    });
    expect(r.allowed).toBe(false);
    expect(r.reasons).toEqual([
      'idx_display_yn',
      'internet_entire_listing_display_yn',
      'owner_opt_out',
      'participant_only',
    ]);
  });
});

describe('FAIL-OPEN for the provider-gated flags — the 2026-04-30 shape', () => {
  it.each([null, undefined])('idx_display_yn = %p does NOT block', (v) => {
    expect(evaluateClientDistributionEligibility({ ...clean, idx_display_yn: v }).allowed).toBe(true);
  });

  it.each([null, undefined])('internet_entire_listing_display_yn = %p does NOT block', (v) => {
    expect(evaluateClientDistributionEligibility({ ...clean, internet_entire_listing_display_yn: v }).allowed).toBe(true);
  });

  it('an entirely empty object is allowed — absence is not a restriction', () => {
    // REBNY pre-filters non-displayable rows upstream. Treating absence as a block is what suppressed
    // 7,594 rows. If this test ever flips to expecting false, read the incident report first.
    expect(evaluateClientDistributionEligibility({})).toEqual({ allowed: true, reasons: [] });
  });
});

describe('FAIL-CLOSED for the per-row decisions — only an explicit true blocks', () => {
  it.each([null, undefined, false])('owner_opt_out = %p does not block', (v) => {
    expect(evaluateClientDistributionEligibility({ ...clean, owner_opt_out: v }).allowed).toBe(true);
  });

  it.each([null, undefined, false])('participant_only = %p does not block', (v) => {
    expect(evaluateClientDistributionEligibility({ ...clean, participant_only: v }).allowed).toBe(true);
  });

  it('an explicit true blocks in both cases', () => {
    expect(evaluateClientDistributionEligibility({ ...clean, owner_opt_out: true }).allowed).toBe(false);
    expect(evaluateClientDistributionEligibility({ ...clean, participant_only: true }).allowed).toBe(false);
  });
});

describe('the helper invents nothing', () => {
  it('reads only the four fields, ignoring everything else on the object', () => {
    const r = evaluateClientDistributionEligibility({
      ...clean,
      // Fields that must have NO influence — provenance, status, price, provider tokens.
      ...( { listing_id: 'SL-0001', rls_eligible: false, status: 'Closed', list_price: 0, Permission: 'IDX,Private' } as Record<string, unknown> ),
    });
    expect({ allowed: r.allowed, why: 'a prefix, a status or a provider token is not a client-distribution decision' })
      .toEqual({ allowed: true, why: expect.any(String) });
  });

  it('does not mutate its input', () => {
    const input = { ...clean, owner_opt_out: true };
    const snapshot = JSON.stringify(input);
    evaluateClientDistributionEligibility(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('exports the refusal message verbatim, so both callers say the same thing', () => {
    expect(CLIENT_DISTRIBUTION_REFUSAL).toBe('This listing is not eligible for distribution per REBNY RLS rules.');
  });
});
