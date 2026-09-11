/**
 * Domain 3 (2026-09-08) — every engine caller declares its audience, and the public surfaces honour the
 * Mallan decisions for website-only rows.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('search engine callers declare their audience', () => {
  it('the authenticated agent search and the CRM saved-search execution run as members', () => {
    expect(read('app/api/idx/search/route.ts')).toMatch(/executeSearch\(c, \{ select: SEARCH_SELECT_FIELDS, audience: "member" \}\)/);
    expect(read('app/api/crm/saved-searches/[id]/execute/route.ts')).toMatch(/executeSearch\(\{ \.\.\.resolved\.criteria, limit, offset \}, \{ select: SEARCH_SELECT_FIELDS, audience: "member" \}\)/);
  });
  it('the alert cron runs an agent-only alert as a member and every lead / subscriber alert as the public', () => {
    const src = read('app/api/cron/search-alerts/route.ts');
    expect(src).toMatch(/const audience = search\.agent && !search\.lead \? "member" : "public";/);
    expect(src).toMatch(/hydrateRows\(capped, \{ select: SEARCH_SELECT_FIELDS, media: false, audience \}\)/);
  });
  it('the engine defaults an undeclared audience to the public', () => {
    expect(read('lib/search/engine/hydrate.ts')).toMatch(/o\.audience \?\? 'public'/);
  });
});

describe('public open houses never emit an address key for an address-suppressed listing', () => {
  it('lib/open-houses/upcoming-open-houses.ts gates addressKey on the display gate, like the route', () => {
    const src = read('lib/open-houses/upcoming-open-houses.ts');
    expect(src).toMatch(/addressKey: gate\.addressDisplayable\s*\?\s*normalizeAddressKey\(/);
  });
});
