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

  it('renders photo via next/image OR an initials fallback avatar', () => {
    expect(page).toMatch(/_assignedAgent\.photo \?/);
    expect(page).toMatch(/<Image[\s\S]{0,120}src=\{listing\._assignedAgent\.photo\}/);
    // initials fallback (split words → first letters → uppercase)
    expect(page).toMatch(/\.split\(\/\\s\+\/\)/);
    expect(page).toMatch(/\.map\(\(w\) => w\[0\]\)/);
    expect(page).toMatch(/\.toUpperCase\(\)/);
    expect(page).toMatch(/rounded-full/);
  });

  it('renders the license title and an optional profile link', () => {
    expect(page).toMatch(/_assignedAgent\.title &&/);
    expect(page).toMatch(/\/agents\/\$\{listing\._assignedAgent\.slug\}/);
  });

  it('keeps the §175.25 brokerage attribution and Schedule/Request/Call actions', () => {
    expect(page).toContain('Mallan Real Estate Inc.');
    expect(page).toContain('Schedule a Showing');
    expect(page).toContain('Request Information');
    expect(page).toMatch(/href=\{`tel:/);
  });

  it('third-party / no-agent path renders a brokerage-only block (no agent card)', () => {
    expect(page).toMatch(/Third-party IDX\/RLS or no assigned agent/);
  });
});
