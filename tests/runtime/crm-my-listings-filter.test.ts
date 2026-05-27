/// <reference types="jest" />
/**
 * CRM My Listings filter (2026-05-27) — CRM-created + closed Trestle only.
 *
 * My Listings shows: (1) CRM-created listings (mls_id null / SL-/RL- prefix),
 * and (2) closed/terminal Trestle-synced deals. Active/Pending Trestle
 * listings are managed via REBNY RLS, not the CRM.
 */

import { readFileSync } from 'fs';
import * as path from 'path';

const ROUTE_PATH = path.resolve(
  __dirname,
  '../../app/api/crm/listings/route.ts'
);
const routeSource = readFileSync(ROUTE_PATH, 'utf-8');

describe('CRM My Listings filter', () => {
  test('GET query uses OR filter for CRM-created vs Trestle-closed', () => {
    expect(routeSource).toMatch(/OR:\s*\[crmCreated,\s*crmCreatedRental,\s*trestleClosed\]/);
  });

  test('CRM-created filter checks mls_id: null + SL-/RL- prefix', () => {
    expect(routeSource).toMatch(/crmCreated\s*=.*mls_id:\s*null.*listing_id.*startsWith.*SL-/s);
    expect(routeSource).toMatch(/crmCreatedRental\s*=.*mls_id:\s*null.*listing_id.*startsWith.*RL-/s);
  });

  test('Trestle-closed filter requires mls_id not null + terminal status', () => {
    expect(routeSource).toMatch(/trestleClosed.*mls_id.*not.*null.*status.*in.*TRESTLE_CLOSED/s);
  });

  test('closed set includes Closed, Sold, Rented, Leased — not Withdrawn/Expired', () => {
    const line = routeSource.split('\n').find(l => l.includes('TRESTLE_CLOSED') && l.includes('Closed'));
    expect(line).toBeDefined();
    expect(line).toContain('Sold');
    expect(line).toContain('Rented');
    expect(line).toContain('Leased');
    expect(line).not.toContain('Withdrawn');
    expect(line).not.toContain('Expired');
    expect(line).not.toContain('Cancelled');
  });
});
