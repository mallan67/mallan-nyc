/// <reference types="jest" />
/**
 * ABSENT IS NOT ACTIVE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS NOW
 *
 * `normalizeStandardStatus` is the canonical status normalizer — the one place
 * case, whitespace and alias variants are folded to the Cotality spelling. Its
 * documented contract included one line that was never a decision, only an
 * inherited default:
 *
 *     Empty / null / non-string input → "Active"
 *
 * That was invisible while `listings.status` was `NOT NULL DEFAULT 'Active'`,
 * because no real row could reach it. Making the column nullable makes it
 * reachable from every row that has no market status yet — and it is fail-OPEN
 * in the worst possible direction:
 *
 *   - `app/api/idx/ensure-listing` writes `status: normalizeStandardStatus(
 *     body.status)` AND derives `idx_display_yn` from the same value, so a
 *     request omitting the status created a PUBLICLY DISPLAYABLE row asserting
 *     a market status the provider never sent.
 *   - `lib/crm/listing-publish-contract` reports Featured/Exclusive eligibility
 *     from it, so an unpublished draft would report itself Featured-eligible.
 *   - `lib/compliance/campaign-distribution-gate` decides distribution from it.
 *   - `lib/idx/trestle-mapper.computeGateColumns` derives `idx_display_yn`.
 *
 * This is the same defect class as the mapper's old
 * `raw.StandardStatus || raw.MlsStatus || "Active"`: inventing a provider fact
 * where none was received.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE NEW CONTRACT
 *
 * Absent input normalizes to the EMPTY STRING — a value that is a member of no
 * status set, so every allow-list gate downstream fails closed with no caller
 * change. Present input is unaffected: case-folding, trimming, aliasing and
 * unknown-value preservation all behave exactly as before.
 *
 * The empty string is the normalizer's "I was given nothing" token. The DB
 * column stores NULL for the same condition; writers convert at the boundary.
 */
import {
  normalizeStandardStatus,
  TERMINAL_STATUSES,
  computeGateColumns,
} from '@/lib/idx/trestle-mapper';
import { buildPublishContract } from '@/lib/crm/listing-publish-contract';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');

describe('the normalizer never invents a market status', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
    ['whitespace only', '   '],
    ['a number', 42],
    ['an object', {}],
  ])('%s normalizes to the empty token, not "Active"', (_label, input) => {
    expect(normalizeStandardStatus(input)).toBe('');
  });

  it('and the empty token is a member of no status set', () => {
    // This is the whole mechanism: every gate downstream is an allow-list
    // membership test, so a value in no set fails closed everywhere at once
    // without a single caller having to change.
    expect(TERMINAL_STATUSES.has('')).toBe(false);
    expect(computeGateColumns({ status: '' }).idx_display_yn).toBe(false);
  });

  it('present input is completely unaffected', () => {
    expect(normalizeStandardStatus('Active')).toBe('Active');
    expect(normalizeStandardStatus('  closed ')).toBe('Closed');
    expect(normalizeStandardStatus('Cancelled')).toBe('Canceled');
    expect(normalizeStandardStatus('SomethingNew')).toBe('SomethingNew');
  });
});

describe('the fail-open consequences are actually closed', () => {
  it('an unpublished listing does not report itself Featured-eligible', () => {
    const contract = buildPublishContract({
      status: null,
      rlsReason: 'CRM exclusive',
      internetAddressDisplayYN: true,
    });
    expect(contract.featuredEligible).toBe(false);
  });

  it('ensure-listing stores NULL rather than an empty string when no status was sent', () => {
    // The normalizer's empty token is an in-memory signal; the column's way of
    // saying the same thing is NULL. Writing '' would create a third spelling
    // of "no status" that no gate knows about.
    const src = read('app/api/idx/ensure-listing/route.ts');
    expect(src).toMatch(/status: canonicalStatus \|\| null,/);
  });
});
