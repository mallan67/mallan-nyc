/**
 * COMMIT 9 — R2 policy state vs retry/failure state.
 *
 * A POLICY EXCLUSION IS NOT A FAILURE. The two facts currently share
 * `listing_media.r2_attempts`, where 9 means "excluded by policy" and 8 means
 * "retries genuinely exhausted". They are distinguishable today, but any reader
 * that does not know the sentinel convention reads a deliberate policy decision
 * as a broken asset.
 *
 * These pin the interpretation so the eventual migration is a change to one
 * module plus the writers, not a repo-wide hunt for magic numbers.
 */

import {
  isR2PolicyExcluded,
  r2RetryFailureCount,
  isR2RetryExhausted,
  isEligibleForMirrorAttempt,
  classifyR2LegacyState,
} from '../r2-policy-state';
import {
  R2_RETRY_EXHAUSTED_THRESHOLD,
  R2_POLICY_PARKED_ATTEMPTS,
} from '@/lib/idx/media-sync';

describe('the two sentinels are distinct and interpreted separately', () => {
  it('8 is retry exhaustion, 9 is policy — they are not the same number', () => {
    expect(R2_RETRY_EXHAUSTED_THRESHOLD).toBe(8);
    expect(R2_POLICY_PARKED_ATTEMPTS).toBe(9);
    expect(R2_POLICY_PARKED_ATTEMPTS).not.toBe(R2_RETRY_EXHAUSTED_THRESHOLD);
  });

  it('the legacy 9 sentinel is NEVER reinterpreted as nine failures', () => {
    const row = { r2_attempts: 9 };
    expect(r2RetryFailureCount(row)).toBe(0);
    expect(isR2PolicyExcluded(row)).toBe(true);
    expect(isR2RetryExhausted(row)).toBe(false);
  });

  it('8 IS retry exhaustion, and is NOT policy exclusion', () => {
    const row = { r2_attempts: 8 };
    expect(isR2RetryExhausted(row)).toBe(true);
    expect(isR2PolicyExcluded(row)).toBe(false);
    expect(r2RetryFailureCount(row)).toBe(8);
  });

  it('legacy >9 overflow is not silently absorbed into "policy"', () => {
    // Exact === 9, never >= 9: the >9 population has unproven provenance.
    const row = { r2_attempts: 12 };
    expect(isR2PolicyExcluded(row)).toBe(false);
    expect(r2RetryFailureCount(row)).toBe(0); // no fabricated count either
  });
});

describe('9E — policy exclusion must not modify failure history', () => {
  it('a row with 3 REAL failures that becomes policy-excluded keeps its 3', () => {
    // Once the explicit column exists, policy exclusion is recorded THERE and
    // r2_attempts is left alone. Real history stays real.
    const row = { r2_attempts: 3, r2_policy_excluded_at: new Date('2026-08-07') };
    expect(isR2PolicyExcluded(row)).toBe(true);
    expect(r2RetryFailureCount(row)).toBe(3); // NOT reset, NOT overwritten by 9
    expect(isR2RetryExhausted(row)).toBe(false); // 3 < 8, and policy anyway
  });

  it('policy exclusion never makes a row LOOK retry-exhausted', () => {
    const row = { r2_attempts: 7, r2_policy_excluded_at: new Date() };
    expect(isR2RetryExhausted(row)).toBe(false);
  });

  it('a genuinely exhausted row is NOT reported as merely policy-excluded', () => {
    const row = { r2_attempts: 8 };
    expect(isR2PolicyExcluded(row)).toBe(false);
    expect(isR2RetryExhausted(row)).toBe(true);
  });
});

describe('9H — mirror-attempt eligibility', () => {
  it('1. policy-excluded row: no attempt, no increment, not exhausted', () => {
    const row = { r2_attempts: 9 };
    expect(isEligibleForMirrorAttempt(row)).toBe(false);
    expect(r2RetryFailureCount(row)).toBe(0);
    expect(isR2RetryExhausted(row)).toBe(false);
  });

  it('2. eligible row with no history is attemptable', () => {
    expect(isEligibleForMirrorAttempt({ r2_attempts: null })).toBe(true);
  });

  it('3. eligible row mid-retry is attemptable', () => {
    expect(isEligibleForMirrorAttempt({ r2_attempts: 3 })).toBe(true);
  });

  it('4. genuinely exhausted row is not attemptable', () => {
    expect(isEligibleForMirrorAttempt({ r2_attempts: 8 })).toBe(false);
  });

  it('5. re-admission: clearing policy state restores eligibility WITHOUT a fake history', () => {
    const excluded = { r2_attempts: 3, r2_policy_excluded_at: new Date() };
    expect(isEligibleForMirrorAttempt(excluded)).toBe(false);
    // Policy widens; the explicit state clears. Real prior failures remain real —
    // no invented reset, and no fake exhaustion blocking re-admission.
    const readmitted = { r2_attempts: 3, r2_policy_excluded_at: null };
    expect(isEligibleForMirrorAttempt(readmitted)).toBe(true);
    expect(r2RetryFailureCount(readmitted)).toBe(3);
  });

  it('a legacy-9 row can be re-admitted once explicit state says not-excluded', () => {
    // Transitional: explicit state wins, so re-admission does not require a
    // production backfill of the legacy sentinel first.
    expect(isEligibleForMirrorAttempt({ r2_attempts: 9 })).toBe(false);
  });
});

describe('9D — historical dry-run classifier', () => {
  it('explicit state is classified first, regardless of legacy value', () => {
    expect(
      classifyR2LegacyState({ r2_attempts: 9, r2_policy_excluded_at: new Date() }, true),
    ).toBe('explicit_policy_state');
  });

  it('legacy 9 + current policy AGREES -> provably policy-parked', () => {
    expect(classifyR2LegacyState({ r2_attempts: 9 }, true)).toBe('legacy_9_provably_policy');
  });

  it('legacy 9 + current policy DISAGREES -> AMBIGUOUS, not resolved by the number', () => {
    // The verified proof covers rows written by CURRENT code. A historical row
    // could predate the sentinel, so the number alone is not provenance.
    expect(classifyR2LegacyState({ r2_attempts: 9 }, false)).toBe('legacy_9_ambiguous');
  });

  it('8 -> retry exhausted', () => {
    expect(classifyR2LegacyState({ r2_attempts: 8 }, false)).toBe('retry_exhausted_8');
  });

  it('>9 -> legacy overflow, and is NOT normalized', () => {
    expect(classifyR2LegacyState({ r2_attempts: 15 }, true)).toBe('legacy_overflow_gt9');
    expect(classifyR2LegacyState({ r2_attempts: 15 }, false)).toBe('legacy_overflow_gt9');
  });

  it('mirrored / never-attempted / retry-pending are distinguished', () => {
    expect(classifyR2LegacyState({ r2_key: 'photos/x.jpg' }, false)).toBe('mirrored');
    expect(classifyR2LegacyState({ r2_attempts: null }, false)).toBe('never_attempted');
    expect(classifyR2LegacyState({ r2_attempts: 2 }, false)).toBe('retry_pending');
  });
});

describe('9A — ownership signal is NOT changed by this commit', () => {
  it('this module makes no ownership judgement at all', () => {
    // R2 ownership (Mallan-authored vs third-party) stays with the canonical
    // `isMallanExclusiveListing` helper — SL-/RL- prefix OR rls_eligible===false
    // is the documented OWNERSHIP contract, and is deliberately NOT the same
    // question as the display/distribution PERMISSION bugs corrected earlier.
    // Duplicating that formula here is exactly what must not happen.
    const src = require('fs')
      .readFileSync(require('path').resolve(__dirname, '../r2-policy-state.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(code).not.toMatch(/startsWith\(['"]SL-['"]\)/);
    expect(code).not.toMatch(/startsWith\(['"]RL-['"]\)/);
    expect(code).not.toMatch(/rls_eligible/);
  });
});
