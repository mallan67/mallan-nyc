/// <reference types="jest" />
/**
 * Agent-page / "Our Listings" card attribution + avatar state reset.
 *
 * 1. A Mallan EXCLUSIVE listing on the agent page must show
 *    "Exclusive listing by Mallan Real Estate Inc." — NOT the RLS courtesy line
 *    (Mallan IS the listing broker; the RLS line would mislabel our own listing).
 *    Third-party RLS rows keep the required "RLS · Listing Courtesy of …" line.
 * 2. AgentAvatar must reset its resolved src/failed state when the photo prop
 *    changes (client-side navigation), so it never shows the prior agent's image
 *    (Codex review, PR #306).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const tabs = readFileSync(
  resolve(__dirname, '../../app/agents/[name]/listings/ActiveListingsTabs.tsx'),
  'utf8',
);
const avatar = readFileSync(resolve(__dirname, '../../app/components/AgentAvatar.tsx'), 'utf8');

describe('Agent-page listing card — exclusive vs RLS attribution', () => {
  it('branches on _source === "exclusive"', () => {
    expect(tabs).toMatch(/listing\._source === 'exclusive'/);
  });

  it('exclusive → "Exclusive listing by Mallan Real Estate Inc." (uses DTO attributionText, falls back to the constant)', () => {
    expect(tabs).toMatch(/_displayCompliance\?\.attributionText/);
    expect(tabs).toContain('Exclusive listing by Mallan Real Estate Inc.');
  });

  it('third-party → keeps the required RLS courtesy line', () => {
    expect(tabs).toMatch(/RLS · Listing Courtesy of \$\{listing\.listOfficeName \|\| 'Mallan Real Estate Inc\.'\}/);
  });

  it('the RLS courtesy line is no longer hardcoded unconditionally', () => {
    // The old code rendered the RLS line for EVERY card; it must now be inside
    // the third-party branch only (i.e. a ternary on _source exists above it).
    const idxSource = tabs.indexOf("listing._source === 'exclusive'");
    const idxRls = tabs.indexOf('RLS · Listing Courtesy of');
    expect(idxSource).toBeGreaterThan(-1);
    expect(idxRls).toBeGreaterThan(idxSource); // RLS line appears within the ternary, after the check
  });

  it('the card DTO carries the provenance fields', () => {
    expect(tabs).toMatch(/_source\?:\s*string/);
    expect(tabs).toMatch(/_displayCompliance\?:/);
  });
});

describe('AgentAvatar — resets state on photo change (Codex PR #306)', () => {
  it('uses a useEffect keyed on [photo] that resets src + failed', () => {
    expect(avatar).toMatch(/useEffect\(/);
    expect(avatar).toMatch(/setSrc\(headshotVariant\(photo\) \|\| photo \|\| ''\)/);
    expect(avatar).toMatch(/setFailed\(!photo\)/);
    expect(avatar).toMatch(/\},\s*\[photo\]\)/);
  });
});
