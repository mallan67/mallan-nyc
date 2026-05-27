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
    expect(routeSource).toMatch(/OR:\s*\[crmCreated,\s*trestleClosed\]/);
  });

  test('CRM-created filter checks mls_id: null', () => {
    expect(routeSource).toMatch(/crmCreated\s*=\s*\{\s*mls_id:\s*null\s*\}/);
  });

  test('Trestle-closed filter requires mls_id not null + terminal status', () => {
    expect(routeSource).toMatch(/trestleClosed.*mls_id.*not.*null.*status.*in.*TRESTLE_TERMINAL/s);
  });

  test('terminal set includes Closed, Sold, Rented, Expired', () => {
    expect(routeSource).toMatch(/TRESTLE_TERMINAL.*Closed/s);
    expect(routeSource).toMatch(/TRESTLE_TERMINAL.*Sold/s);
    expect(routeSource).toMatch(/TRESTLE_TERMINAL.*Rented/s);
    expect(routeSource).toMatch(/TRESTLE_TERMINAL.*Expired/s);
  });
});
