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
    expect(src).toMatch(/const audience: SearchAudience = search\.agent && !search\.lead \? "member" : "public";/);
    expect(src).toMatch(/hydrateRows\(capped, \{ select: SEARCH_SELECT_FIELDS, media: false, audience \}\)/);
  });

  // C4B: audience reaches MEMBERSHIP, not only rendering. Declaring it at hydration alone was the defect —
  // the universe counted rows the audience would never receive, and the memo served one audience's
  // universe to the other.
  it('the alert cron decides audience BEFORE settling the universe, and keys its memo by it', () => {
    const src = read('app/api/cron/search-alerts/route.ts');
    const audienceAt = src.indexOf('const audience: SearchAudience =');
    const settleAt = src.indexOf('await universeFor(resolved.criteria, audience)');
    expect(audienceAt).toBeGreaterThan(-1);
    expect(settleAt).toBeGreaterThan(audienceAt);
    expect(src).toMatch(/universeKeyOf\(c, audience\)/);
  });

  it('the live agent Search settles a MEMBER universe, not merely a member hydration', () => {
    const ex = read('lib/search/engine/executor.ts');
    expect(ex).toMatch(/settledUniverseFor\(c, audience, o\.cache !== false\)/);
    expect(ex).toMatch(/universeKeyOf\(c, audience\)/);
  });

  it('the engine defaults an undeclared audience to the public, at BOTH membership and hydration', () => {
    expect(read('lib/search/engine/hydrate.ts')).toMatch(/o\.audience \?\? 'public'/);
    expect(read('lib/search/engine/executor.ts')).toMatch(/o\.audience \?\? 'public'/);
  });

  it('Saved Search counts are stamped for the audience the RELATIONSHIP implies, never alert_email', () => {
    expect(read('app/api/crm/saved-searches/route.ts')).toMatch(/stampedCount\(resolved, leadAccess\?\.leadId \? "public" : "member"\)/);
    expect(read('app/api/crm/saved-searches/[id]/route.ts')).toMatch(/stampedCount\(resolved, resultingLeadId \? "public" : "member"\)/);
  });
});

describe('public open houses never emit an address key for an address-suppressed listing', () => {
  it('lib/open-houses/upcoming-open-houses.ts gates addressKey on the display gate, like the route', () => {
    const src = read('lib/open-houses/upcoming-open-houses.ts');
    expect(src).toMatch(/addressKey: gate\.addressDisplayable\s*\?\s*normalizeAddressKey\(/);
  });
});
