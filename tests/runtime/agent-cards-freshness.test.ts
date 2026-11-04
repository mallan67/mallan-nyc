/// <reference types="jest" />
/**
 * The agent pages' cards refresh when a listing is saved (Maya, 2026-11-04: "the cards have to auto update when listings update on featured listing, company exclusive tab and the agent
 * exclusives page").
 *
 * Featured and Company Exclusives read /api/listings (a 60 s CDN window, and the data cache it reads is tagged SEARCH_CACHE_TAG, which a CRM save revalidates). The agent pages read
 * /api/agents/[slug]/listings, which was cached 5 minutes + 10 more at the CDN, and each page kept its own copy for another 5: production answered with Age 612 s, STALE. They now share
 * the 60 s window, and the pages tag their copy with SEARCH_CACHE_TAG so a save drops it at once.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { AGENT_CARDS_CACHE_CONTROL, AGENT_CARDS_FETCH } from '@/lib/cache/agent-cards-cache';
import { SEARCH_CACHE_TAG } from '@/lib/cache/public-cache';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

describe('the window the agent cards may be stale', () => {
  it('is the same 60 s window as the cards of Featured and Company Exclusives', () => {
    const listings = read('app/api/listings/route.ts');
    expect(listings).toContain(`'Cache-Control': '${AGENT_CARDS_CACHE_CONTROL}'`);
    expect(AGENT_CARDS_CACHE_CONTROL).toBe('public, s-maxage=60, stale-while-revalidate=120');
  });

  it('the agent listings answer uses it, and no longer says 5 minutes', () => {
    const route = read('app/api/agents/[slug]/listings/route.ts');
    expect(route).toContain("'Cache-Control': AGENT_CARDS_CACHE_CONTROL");
    expect(route).not.toMatch(/s-maxage=300/);
  });

  it('both agent pages tag their copy with the tag a CRM save revalidates', () => {
    expect(AGENT_CARDS_FETCH.tags).toEqual([SEARCH_CACHE_TAG]);
    for (const page of ['app/agents/[name]/page.tsx', 'app/agents/[name]/listings/page.tsx']) {
      const src = read(page);
      expect(src).toMatch(/\/api\/agents\/\$\{slug\}\/listings`, \{\s*next: AGENT_CARDS_FETCH,/);
      expect(src).not.toMatch(/next: \{ revalidate: 300 \}/);
    }
  });

  it('a save in the CRM revalidates that tag (update and status change), so the tagged copies are dropped', () => {
    for (const route of ['app/api/crm/listings/[id]/route.ts', 'app/api/crm/listings/[id]/status/route.ts']) {
      const src = read(route);
      expect(src).toMatch(/safeRevalidateTags\(\[[^\]]*SEARCH_CACHE_TAG/);
    }
  });

  it('the 5-minute timer stays as the safety net, so a quiet agent page costs the database nothing more than before', () => {
    expect(AGENT_CARDS_FETCH.revalidate).toBe(300);
  });
});
