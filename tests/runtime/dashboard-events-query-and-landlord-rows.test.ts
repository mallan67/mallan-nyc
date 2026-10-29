/// <reference types="jest" />
/**
 * Dashboard — two defects seen in the 2026-10-28 walkthrough.
 *
 * (1) Every workspace Activity / Listings tab asked
 *     GET /api/crm/events?entityType=…&entityId=… while the route reads
 *     entity_type / entity_id → 400 "entity_id (or lead_id) is required", so no
 *     client history ever loaded.
 * (2) The Landlords panel printed "425 Park Avenue South #4D #4D" because the
 *     client's property_address already carried the unit it appended.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../../public/crm/js/dashboard', rel), 'utf8');

describe('events.js — the events request matches the route contract', () => {
  const src = read('events.js');
  test('sends entity_type / entity_id', () => {
    expect(src).toMatch(/\/api\/crm\/events\?entity_type=' \+ encodeURIComponent\(entityType\) \+ '&entity_id=' \+ encodeURIComponent\(entityId\)/);
  });
  test('the camelCase query is gone', () => {
    expect(src).not.toMatch(/events\?entityType=/);
  });
  test('the route really reads those names', () => {
    const route = fs.readFileSync(path.resolve(__dirname, '../../app/api/crm/events/route.ts'), 'utf8');
    expect(route).toMatch(/searchParams\.get\("entity_id"\)/);
    expect(route).toMatch(/searchParams\.get\("entity_type"\)/);
  });
});

describe('rentals-crm — property line shows the unit once', () => {
  const src = read('panels/rentals-crm/index.js');
  const start = src.indexOf('function _addressWithUnit(');
  const helper = src.slice(start, src.indexOf('\n  }', start) + 4);

  test('helper exists and both renderers use it', () => {
    expect(start).toBeGreaterThan(-1);
    expect((src.match(/_addressWithUnit\(/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(src).not.toMatch(/E\(\(r\.property_address \|\| '-'\) \+ unit\)/);
  });

  test('behaviour: unit already in the address is not repeated; a missing unit is appended', () => {
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    vm.runInContext(helper + '; this.fn = _addressWithUnit;', ctx);
    const fn = ctx.fn as (a: unknown, u: unknown) => string;
    expect(fn('425 Park Avenue South #4D', '4D')).toBe('425 Park Avenue South #4D');
    expect(fn('425 Park Avenue South', '4D')).toBe('425 Park Avenue South #4D');
    expect(fn('425 Park Avenue South #4d', '4D')).toBe('425 Park Avenue South #4d');
    expect(fn(null, '4D')).toBe('- #4D');
    expect(fn('400 E 90th Street', '')).toBe('400 E 90th Street');
  });
});
