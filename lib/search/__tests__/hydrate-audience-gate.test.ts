/**
 * Domain 3 (2026-09-08) — the backend Search engine's provider gate knows its audience.
 *
 * STEP3 ledger §13.3: `passesGate` rejected every non-IDX Permission token for every caller, so a
 * `Private` (participants-only) row was excluded from the authenticated agent Search — the one audience
 * it exists for — while the public alert cron shares the same engine and must keep blocking it.
 * Trestle defines `Private` as "private and should have limited distribution" and `IDX` as "okay for IDX
 * use" (metadata/enumerations/P-S). The gate is fail-closed: an unknown audience is the public.
 */
import { providerRowPassesGate } from '@/lib/search/engine/hydrate';

describe('providerRowPassesGate — audience-aware provider permission gate', () => {
  it('IDX rows pass for every audience', () => {
    expect(providerRowPassesGate({ Permission: 'IDX' }, 'public')).toBe(true);
    expect(providerRowPassesGate({ Permission: 'IDX' }, 'member')).toBe(true);
  });
  it('a Private (participants-only) row is blocked for the public and shown to an authenticated member', () => {
    expect(providerRowPassesGate({ Permission: 'Private' }, 'public')).toBe(false);
    expect(providerRowPassesGate({ Permission: 'Private' }, 'member')).toBe(true);
    expect(providerRowPassesGate({ Permission: 'IDX,Private' }, 'public')).toBe(false);
    expect(providerRowPassesGate({ Permission: 'IDX,Private' }, 'member')).toBe(true);
  });
  it('an explicit InternetEntireListingDisplayYN=false blocks every audience', () => {
    expect(providerRowPassesGate({ Permission: 'IDX', InternetEntireListingDisplayYN: false }, 'public')).toBe(false);
    expect(providerRowPassesGate({ Permission: 'IDX', InternetEntireListingDisplayYN: false }, 'member')).toBe(false);
  });
  it('a row without a Permission fact (a Mallan-authored row in provider shape) passes', () => {
    expect(providerRowPassesGate({}, 'public')).toBe(true);
    expect(providerRowPassesGate({}, 'member')).toBe(true);
  });
  it('the audience defaults to the public (fail-closed)', () => {
    expect(providerRowPassesGate({ Permission: 'Private' })).toBe(false);
  });
  it('other non-IDX tokens stay fail-closed for the public until their meaning is proven (no definition on the provider docs)', () => {
    expect(providerRowPassesGate({ Permission: 'IDX,SyndicateOptOut' }, 'public')).toBe(false);
  });
});
