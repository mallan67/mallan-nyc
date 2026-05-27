/// <reference types="jest" />
/**
 * DELETE /api/crm/listings/[id] — CRM-only guard.
 *
 * Only CRM-created listings (mls_id=null) can be withdrawn.
 * Trestle-synced listings (mls_id set) return 409.
 */

import { readFileSync } from 'fs';
import * as path from 'path';

const ROUTE_PATH = path.resolve(__dirname, '../../app/api/crm/listings/[id]/route.ts');
const routeSource = readFileSync(ROUTE_PATH, 'utf-8');

const PANELS_PATH = path.resolve(__dirname, '../../public/crm/js/dashboard/panels.js');
const panelsSource = readFileSync(PANELS_PATH, 'utf-8');

describe('DELETE listing guard — CRM-created only', () => {
  test('backend blocks DELETE for listings with mls_id', () => {
    expect(routeSource).toMatch(/if\s*\(listing\.mls_id\)/);
    expect(routeSource).toMatch(/Only CRM-created listings can be withdrawn/);
    expect(routeSource).toMatch(/status:\s*409/);
  });

  test('backend sets status to Withdrawn on success', () => {
    expect(routeSource).toMatch(/status:\s*"Withdrawn"/);
  });

  test('frontend hides delete button when mls_id is set', () => {
    expect(panelsSource).toMatch(/!l\.mls_id.*fa-trash/s);
  });

  test('frontend shows delete button when mls_id is null', () => {
    expect(panelsSource).toMatch(/!l\.mls_id.*Withdraw Listing/s);
  });

  test('GET endpoint returns mls_id for frontend filtering', () => {
    const getRoute = readFileSync(
      path.resolve(__dirname, '../../app/api/crm/listings/route.ts'), 'utf-8'
    );
    expect(getRoute).toMatch(/mls_id:\s*true/);
  });
});
