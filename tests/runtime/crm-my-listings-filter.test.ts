/// <reference types="jest" />
/**
 * My Listings: local SL/RL rows plus list-office-verified return copies.
 * A Mallan brokerage view must not include every firm's closed IDX deal.
 */
import { readFileSync } from 'fs';
import * as path from 'path';
const src = readFileSync(path.resolve(__dirname, '../../app/api/crm/listings/route.ts'), 'utf-8');
describe('CRM My Listings provider/source separation', () => {
  test('query includes Mallan office return copies and local SL/RL entries', () => {
    expect(src).toMatch(/OR:\s*\[crmCreated,\s*crmCreatedRental,\s*mallanRlsListings\]/);
    expect(src).toContain('list_office_mls_id: { in: [...MALLAN_LIST_OFFICE_MLS_IDS] }');
  });
  test('local listing filters retain their identifiers and exclude withdrawn', () => {
    expect(src).toMatch(/crmCreated\s*=.*mls_id:\s*null.*startsWith:\s*"SL-".*CRM_HIDDEN/s);
    expect(src).toMatch(/crmCreatedRental\s*=.*mls_id:\s*null.*startsWith:\s*"RL-".*CRM_HIDDEN/s);
  });
  test('old unscoped third-party closed-listing query is absent', () => {
    expect(src).not.toContain('TRESTLE_CLOSED');
  });
  test('source-owned return copies are always marked non-editable', () => {
    expect(src).toContain('can_edit: !sourceManaged && caps.mayManageMallanLocalListing');
  });
});
