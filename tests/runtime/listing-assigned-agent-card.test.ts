/// <reference types="jest" />
/**
 * Listing-detail assigned-agent contact card. (fix/listing-assigned-agent-card)
 *
 * Proves, generically (no hardcoded Maya, no hardcoded SL-0004):
 *  - a Mallan exclusive yields the full card payload: name/title/photo/phone/company/slug;
 *  - a DIFFERENT agent yields their own data (no hardcode);
 *  - a missing photo omits `photo` so the card uses the initials fallback;
 *  - a missing title is omitted safely (name/company still present);
 *  - a third-party IDX/RLS listing yields NULL — no private agent data;
 *  - manual agent_info values win over the Agent record;
 *  - the rendered card keeps Schedule/Request/Call actions and §175.25 brokerage.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  buildAssignedAgentDisplay,
  type AssignedAgentRecord,
} from '../../lib/listings/assigned-agent';
import { headshotVariant, avatarInitials } from '../../lib/agents/avatar';

const AGENT_MAYA: AssignedAgentRecord = {
  full_name: 'Maya Allan', email: 'maya@mallan.nyc', phone: '(646) 258-4460',
  photo: '/images/agents/maya-allan.jpg', title: 'Licensed Real Estate Broker',
  license_type: 'Licensed Associate Broker', public_slug: 'maya-allan',
};
const AGENT_OTHER: AssignedAgentRecord = {
  full_name: 'Jordan Rivera', email: 'jordan@mallan.nyc', phone: '212-555-0147',
  photo: '/images/agents/jordan-rivera.jpg', title: 'Licensed Real Estate Salesperson',
  license_type: 'salesperson', public_slug: 'jordan-rivera',
};
const OFFICE = { ListOfficeName: 'Mallan Real Estate Inc.' };

describe('buildAssignedAgentDisplay — Mallan exclusive', () => {
  it('returns full card payload: name, title, photo, phone, email, company, slug', () => {
    const out = buildAssignedAgentDisplay({
      isMallanExclusive: true,
      agentInfo: { ...OFFICE, ListAgentFullName: 'Maya Allan', ListAgentEmail: 'maya@mallan.nyc', ListAgentDirectPhone: '(646) 258-4460' },
      agentRecord: AGENT_MAYA,
    });
    expect(out).toMatchObject({
      name: 'Maya Allan',
      title: 'Licensed Real Estate Broker',
      photo: '/images/agents/maya-allan.jpg',
      phone: '(646) 258-4460',
      email: 'maya@mallan.nyc',
      company: 'Mallan Real Estate Inc.',
      slug: 'maya-allan',
    });
  });

  it('a DIFFERENT agent yields their OWN data (no hardcode)', () => {
    const out = buildAssignedAgentDisplay({ isMallanExclusive: true, agentInfo: { ...OFFICE }, agentRecord: AGENT_OTHER });
    expect(out!.name).toBe('Jordan Rivera');
    expect(out!.photo).toBe('/images/agents/jordan-rivera.jpg');
    expect(out!.title).toBe('Licensed Real Estate Salesperson');
    expect(out!.slug).toBe('jordan-rivera');
  });

  it('pulls name from the Agent record when agent_info omits it', () => {
    const out = buildAssignedAgentDisplay({ isMallanExclusive: true, agentInfo: { ...OFFICE }, agentRecord: AGENT_MAYA });
    expect(out!.name).toBe('Maya Allan');
  });

  it('manual agent_info name WINS over the Agent record', () => {
    const out = buildAssignedAgentDisplay({
      isMallanExclusive: true,
      agentInfo: { ...OFFICE, ListAgentFullName: 'Manually Typed Name' },
      agentRecord: AGENT_MAYA,
    });
    expect(out!.name).toBe('Manually Typed Name');
  });
});

describe('buildAssignedAgentDisplay — fallbacks', () => {
  it('missing photo → no `photo` key (card uses initials fallback)', () => {
    const out = buildAssignedAgentDisplay({
      isMallanExclusive: true, agentInfo: { ...OFFICE },
      agentRecord: { ...AGENT_MAYA, photo: null },
    });
    expect(out!.photo).toBeUndefined();
    expect(out!.name).toBe('Maya Allan');
  });

  it('missing title → falls back to license_type, then omitted if neither (safe)', () => {
    const withLicenseType = buildAssignedAgentDisplay({
      isMallanExclusive: true, agentInfo: { ...OFFICE },
      agentRecord: { full_name: 'Pat Lee', title: null, license_type: 'salesperson', public_slug: 'pat-lee' },
    });
    expect(withLicenseType!.title).toBe('salesperson');

    const noneStored = buildAssignedAgentDisplay({
      isMallanExclusive: true, agentInfo: { ...OFFICE },
      agentRecord: { full_name: 'Pat Lee', title: null, license_type: null },
    });
    expect(noneStored!.title).toBeUndefined(); // never invented
    expect(noneStored!.name).toBe('Pat Lee'); // still renders name + company
    expect(noneStored!.company).toBe('Mallan Real Estate Inc.');
  });
});

describe('buildAssignedAgentDisplay — third-party privacy', () => {
  it('returns NULL for a non-exclusive listing even if data is present (no PII)', () => {
    const out = buildAssignedAgentDisplay({
      isMallanExclusive: false,
      agentInfo: { ListAgentFullName: 'Third Party Agent', ListAgentEmail: 'leak@other.com', ListOfficeName: 'Other Brokerage LLC' },
      agentRecord: { full_name: 'Third Party Agent', email: 'leak@other.com', photo: '/x.jpg' },
    });
    expect(out).toBeNull();
  });

  it('returns NULL when nothing displayable', () => {
    expect(buildAssignedAgentDisplay({ isMallanExclusive: true, agentInfo: {}, agentRecord: null })).toBeNull();
  });
});

describe('listing-detail page renders the card with the existing style', () => {
  const page = readFileSync(resolve(__dirname, '../../app/listing/[...slug]/page.tsx'), 'utf8');

  it('loads the linked Agent by agent_id ONLY for Mallan exclusives, selecting photo/title/license_type/public_slug', () => {
    expect(page).toMatch(/isMallanExclusiveListing\s*&&\s*dbListing\.agent_id\s*!=\s*null/);
    expect(page).toMatch(/prisma\.agent[\s\S]{0,80}findUnique/);
    for (const f of ['photo: true', 'title: true', 'license_type: true', 'public_slug: true']) {
      expect(page).toContain(f);
    }
    expect(page).toMatch(/buildAssignedAgentDisplay\(/);
  });

  it('renders the avatar via the reusable AgentAvatar component (photo or initials)', () => {
    expect(page).toMatch(/import AgentAvatar from '@\/app\/components\/AgentAvatar'/);
    expect(page).toMatch(/<AgentAvatar[\s\S]{0,120}photo=\{listing\._assignedAgent\.photo\}/);
    expect(page).toMatch(/<AgentAvatar[\s\S]{0,160}name=\{listing\._assignedAgent\.name\}/);
  });

  it('renders the license title and an optional profile link', () => {
    expect(page).toMatch(/_assignedAgent\.title &&/);
    expect(page).toMatch(/\/agents\/\$\{listing\._assignedAgent\.slug\}/);
  });

  /**
   * UPDATED 2026-08-06 (commit 3b step 2).
   *
   * This previously asserted `expect(page).toContain('Mallan Real Estate Inc.')`
   * — a raw source-grep for a hard-coded literal. That literal WAS the defect:
   * `page.tsx` used `|| 'Mallan Real Estate Inc.'` as the per-listing brokerage
   * fallback, so a THIRD-PARTY listing with no office name was attributed to
   * Mallan. That is a false claim of brokerage under NY DOS 19 NYCRR §175.25
   * ("no misleading/false/deceptive claims") and violates REBNY UCBA
   * Art. III §2(C), which requires the ACTUAL listing broker.
   *
   * The test's INTENT (§175.25 brokerage attribution must exist) is still
   * enforced — but §175.25 attribution for Mallan as the DISPLAYING broker is
   * owned sitewide by the footer, which is proven present:
   *   app/components/Footer.tsx:25-29  companyName 'Mallan Real Estate Inc.',
   *                                    license '10991205323', phone, address
   *   app/layout.tsx:379               <Footer /> in the ROOT layout, so it
   *                                    renders on every page incl. listing detail
   * Compliance canon §9 names Footer.tsx as the canonical owner of exactly this.
   *
   * Feed-level/global attribution and per-listing broker attribution are
   * SEPARATE obligations. The per-listing block must name the actual listing
   * broker; it must not substitute a generic or displaying-broker name.
   *
   * Mallan attribution still reaches the page for genuine Mallan exclusives via
   * `_assignedAgent.company` (populated only when provenance proves Mallan is
   * the listing broker) — not via a hard-coded string.
   */
  it('per-listing attribution uses the canonical policy, never a hard-coded Mallan fallback', () => {
    // The false-attribution fallback must be gone from the detail page.
    expect(page).not.toContain("|| 'Mallan Real Estate Inc.'");
    // ...replaced by the single policy owner.
    expect(page).toMatch(/publicListOfficeName\(/);
    expect(page).toMatch(
      /import \{ publicListOfficeName \} from '@\/lib\/idx\/public-attribution'/,
    );
  });

  it('keeps the Schedule/Request/Call actions', () => {
    expect(page).toContain('Schedule a Showing');
    expect(page).toContain('Request Information');
    expect(page).toMatch(/href=\{`tel:/);
  });

  it('third-party / no-agent path renders a brokerage-only block (no agent card)', () => {
    expect(page).toMatch(/Third-party IDX\/RLS or no assigned agent/);
  });
});

describe('AgentAvatar helpers — square headshot variant + initials', () => {
  it('derives the -headshot variant path generically (any agent, any extension)', () => {
    expect(headshotVariant('/images/agents/maya-allan.jpg')).toBe('/images/agents/maya-allan-headshot.jpg');
    expect(headshotVariant('/images/agents/jordan-rivera.png')).toBe('/images/agents/jordan-rivera-headshot.png');
    expect(headshotVariant('/x/a.webp?v=2')).toBe('/x/a-headshot.webp?v=2');
  });

  it('returns empty string when there is no photo (→ initials path)', () => {
    expect(headshotVariant('')).toBe('');
    expect(headshotVariant(null)).toBe('');
    expect(headshotVariant(undefined)).toBe('');
  });

  it('computes up to two uppercased initials', () => {
    expect(avatarInitials('Maya Allan')).toBe('MA');
    expect(avatarInitials('Jordan Rivera')).toBe('JR');
    expect(avatarInitials('Cher')).toBe('C');
    expect(avatarInitials('  pat   q  lee ')).toBe('PQ');
    expect(avatarInitials('')).toBe('');
  });

  it('the AgentAvatar component falls back photo→initials and is not hardcoded to one agent', () => {
    const src = readFileSync(resolve(__dirname, '../../app/components/AgentAvatar.tsx'), 'utf8');
    expect(src).toMatch(/headshotVariant\(/);
    expect(src).toMatch(/onError/);
    expect(src).toMatch(/avatarInitials\(name\)/);
    expect(src).not.toMatch(/maya|Maya|SL-0004/);
  });
});
