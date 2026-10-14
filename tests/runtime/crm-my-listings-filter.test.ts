/// <reference types="jest" />
/**
 * "My Listings" is not the citywide Closed RLS corpus. A local SL-/RL-
 * record remains visible to the broker even when an RLS twin exists and
 * the local mls_id has been populated during reconciliation.
 */
import { readFileSync } from 'fs';
import * as path from 'path';
const source = readFileSync(
  path.resolve(__dirname, '../../app/api/crm/listings/route.ts'),
  'utf8',
);
describe('CRM My Listings is an owned-local edit list', () => {
  it('queries SL-/RL- even when the mls_id column is filled', () => {
    expect(source).toContain('listing_id: { startsWith: "SL-" }');
    expect(source).toContain('listing_id: { startsWith: "RL-" }');
    expect(source).not.toContain('mls_id: null');
  });
  it('does not admit all citywide closed / terminal Cotality inventory', () => {
    expect(source).not.toContain('TRESTLE_CLOSED');
    expect(source).not.toMatch(/trestleClosed\s*=/);
  });
  it('does not leak withdrawn listings or provider synced website-only rows', () => {
    expect(source).toContain('status: { notIn: CRM_HIDDEN }');
    expect(source).toContain('rls_eligible: false, last_synced_from_trestle: null');
  });
});
