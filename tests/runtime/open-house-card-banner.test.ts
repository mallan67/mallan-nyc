/// <reference types="jest" />
/**
 * The "Open House · Sun 12–1 PM" banner must appear on EVERY listing-card surface, not just the
 * Open Houses page (Maya, 2026-06-23): homepage Featured, agent page, and the Mallan-listings /
 * search cards. Source-structure assertions (no jsdom): each card imports the shared OpenHouseBanner
 * and renders it from `listing.nextOpenHouse`, while keeping its existing badges (gold "Mallan
 * Exclusive", status, Coming Soon). The banner component itself returns null when there is no
 * upcoming public open house, so a listing without one shows nothing.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const read = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf8');

const BANNER = read('app/components/OpenHouseBanner.tsx');
const FEATURED = read('app/components/FeaturedListings.tsx');
const AGENT = read('app/agents/[name]/listings/ActiveListingsTabs.tsx');
const SEARCH = read('app/components/SearchListingCard.tsx');
const LISTINGS_ROUTE = read('app/api/listings/route.ts');
const AGENT_ROUTE = read('app/api/agents/[slug]/listings/route.ts');
const DTO = read('lib/idx/public-dto.ts');
const ADAPTER = read('lib/idx/display-adapter.ts');

describe('OpenHouseBanner component', () => {
  it('renders nothing without an open house, and shows "Open House" + the time otherwise', () => {
    expect(BANNER).toMatch(/if \(!openHouse[\s\S]*?return null/);
    expect(BANNER).toMatch(/Open House/);
    expect(BANNER).toMatch(/startTime/);
  });

  it('keeps the existing weekday/time format and only appends "· By Appointment" when appointment-only', () => {
    // Existing format preserved: weekday (short) + the time range, unchanged.
    expect(BANNER).toMatch(/weekday:\s*'short'/);
    expect(BANNER).toMatch(/Open House\$\{day \? ` · \$\{day\}` : ''\} \$\{time\}\$\{appt\}/);
    // Appointment suffix keyed off the canonical designation, appended (not a reformat).
    expect(BANNER).toMatch(/openHouse\.type === 'By Appointment' \? ' · By Appointment' : ''/);
  });
});

describe('DTO + adapter carry nextOpenHouse', () => {
  it('PublicListingDTO declares nextOpenHouse', () => {
    expect(DTO).toMatch(/nextOpenHouse\?:/);
  });
  it('DisplayListing declares + both adapters pass through nextOpenHouse', () => {
    expect(ADAPTER).toMatch(/nextOpenHouse\?:/);
    expect(ADAPTER).toMatch(/nextOpenHouse:\s*dto\.nextOpenHouse/);
    expect(ADAPTER).toMatch(/nextOpenHouse:\s*raw\.nextOpenHouse/);
  });
});

describe('routes enrich listings with nextOpenHouse (Mallan-scoped, twin-safe)', () => {
  it('/api/listings attaches nextOpenHouse via the shared resolver', () => {
    expect(LISTINGS_ROUTE).toMatch(/getOpenHouseIndex/);
    expect(LISTINGS_ROUTE).toMatch(/findNextOpenHouse\(l, ohIndex\)/);
    expect(LISTINGS_ROUTE).toMatch(/l\.nextOpenHouse = next/);
  });
  it('/api/agents/[slug]/listings attaches nextOpenHouse to ACTIVE cards', () => {
    expect(AGENT_ROUTE).toMatch(/getOpenHouseIndex/);
    expect(AGENT_ROUTE).toMatch(/findNextOpenHouse\(l, ohIndex\)/);
    expect(AGENT_ROUTE).toMatch(/l\.nextOpenHouse = next/);
  });
});

describe('all three card surfaces render the banner (4th surface = the Open Houses page)', () => {
  it('Featured homepage card renders OpenHouseBanner and KEEPS the Mallan Exclusive badge (now slate)', () => {
    expect(FEATURED).toMatch(/import OpenHouseBanner from/);
    expect(FEATURED).toMatch(/<OpenHouseBanner openHouse=\{listing\.nextOpenHouse\}/);
    // the exclusive badge must remain (not replaced by the banner), and now uses bg-brand-slate —
    // the SAME color as the Open House banner, white text (was gold; white-on-gold failed contrast).
    expect(FEATURED).toMatch(/className="absolute top-4 left-4 z-30 bg-brand-slate text-white/);
    expect(FEATURED).toMatch(/featuredBadgeFor\(/);
  });

  it('Agent page card renders OpenHouseBanner and keeps the status badge', () => {
    expect(AGENT).toMatch(/import OpenHouseBanner from/);
    expect(AGENT).toMatch(/<OpenHouseBanner openHouse=\{listing\.nextOpenHouse\}/);
    expect(AGENT).toMatch(/ComingSoonBadge/);
  });

  it('Search / Mallan-listings cards render OpenHouseBanner in ALL three variants', () => {
    expect(SEARCH).toMatch(/import OpenHouseBanner from/);
    const used = SEARCH.match(/<OpenHouseBanner openHouse=\{listing\.nextOpenHouse\}/g) || [];
    expect(used.length).toBe(3); // GridCard + ListCard + SplitCard
  });
});
