/// <reference types="jest" />
/**
 * CRM My Listings filter — Mallan's OWN listings only.
 *
 * 2026-05-27: CRM-created rows + every closed Trestle-synced row.
 * 2026-10-27: the closed-Trestle clause admitted 6,010 rows from every brokerage (Compass, Corcoran,
 * Elliman …) and none of Mallan's — "My Listings" showed other firms' closed deals. The set is now
 *   (1) CRM-created listings (mls_id null, SL-/RL- prefix), and
 *   (2) Mallan's RLS return copies: list-side office = Mallan (lib/listings/mallan-source-identity.ts).
 * Identity is the source field — never `agent_id`, never a free-text office name.
 */

import { readFileSync } from 'fs';
import * as path from 'path';

const ROUTE_PATH = path.resolve(__dirname, '../../app/api/crm/listings/route.ts');
const routeSource = readFileSync(ROUTE_PATH, 'utf-8');

describe('CRM My Listings filter', () => {
  test('GET query admits Mallan-created rows and Mallan RLS return copies only', () => {
    expect(routeSource).toMatch(/const mallanOwn[^=]*=\s*\[crmCreated,\s*crmCreatedRental,\s*mallanRlsCopy\]/);
    expect(routeSource).toMatch(/const where: Record<string, unknown> = \{ OR: mallanOwn \}/);
    expect(routeSource).toContain("import { MALLAN_LIST_OFFICE_MLS_IDS } from \"@/lib/listings/mallan-source-identity\"");
  });

  test('CRM-created filter checks mls_id: null + SL-/RL- prefix + excludes Withdrawn', () => {
    expect(routeSource).toMatch(/crmCreated\s*=.*mls_id:\s*null.*listing_id.*startsWith.*SL-.*status.*notIn.*CRM_HIDDEN/s);
    expect(routeSource).toMatch(/crmCreatedRental\s*=.*mls_id:\s*null.*listing_id.*startsWith.*RL-.*status.*notIn.*CRM_HIDDEN/s);
  });

  test('RLS-copy filter requires mls_id not null + list-side office = Mallan (source field, not agent_id, not an office name)', () => {
    expect(routeSource).toMatch(/mallanRlsCopy\s*=\s*\{[^}]*mls_id:\s*\{\s*not:\s*null\s*\}[^}]*list_office_mls_id:\s*\{\s*in:\s*\[\.\.\.MALLAN_LIST_OFFICE_MLS_IDS\]\s*\}/s);
    expect(routeSource).not.toMatch(/TRESTLE_CLOSED/);
    expect(routeSource).not.toMatch(/trestleClosed/);
    expect(routeSource).not.toMatch(/list_office_name:\s*\{\s*contains/);
  });

  test('an agent is scoped by assignment or REBNY member id, inside the Mallan-own set', () => {
    expect(routeSource).toMatch(/where\.AND = \[\{ OR: mallanOwn \}, \{ OR: mine \}\]/);
    expect(routeSource).toMatch(/list_agent_mls_id: me\.trestle_mls_id/);
    expect(routeSource).toMatch(/co_list_agent_mls_id: me\.trestle_mls_id/);
  });
});
