/// <reference types="jest" />
/**
 * The Agent record is the authority for the public profile.
 *
 * `/agents/[name]` fell back to `data/agents.json` whenever it found no ACTIVE
 * database agent — including when the database answered fine and simply had no
 * such agent. A Git-tracked file could therefore:
 *
 *   RESURRECT  a deactivated or permanently deleted agent
 *   OVERRIDE   the canonical record with stale name/title/photo/contact data
 *   MISLABEL   a licensee, since the static title is free text
 *   OMIT       inconsistently — roster and sitemap read the database only, so
 *              an agent could be missing from both and still have a live page
 *
 * The rule: a database that REPLIES is final, null included. Only an
 * unreachable database permits the static roster, so an outage degrades the
 * site rather than blanking every agent page.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  resolvePublicAgent,
  AgentDirectoryUnavailable,
  fromDatabase,
  fromStatic,
  directoryFromDatabase,
  directoryFromStatic,
  type DbAgentRow,
  type StaticAgentEntry,
} from '../../lib/agents/public-profile-authority';

const ROOT = resolve(__dirname, '../..');

const CLAUDIA_DB: DbAgentRow = {
  public_slug: 'claudia-milkowski',
  full_name: 'Claudia Milkowski',
  first_name: 'Claudia',
  last_name: 'Milkowski',
  title: 'Licensed Real Estate Associate Broker',
  license_type: 'broker',
  role: 'AGENT',
  photo: '/images/agents/claudia-milkowski.jpg',
  phone: '(646) 418-8388',
  email: 'cmilkowski@mallan.nyc',
  bio: 'Nearly two decades...',
  specialties: ['Co-op Board Approvals'],
  languages: ['English', 'Spanish'],
  featured: false,
};

const STALE_STATIC: StaticAgentEntry = {
  id: 'claudia-milkowski',
  name: 'Claudia Milkowski',
  title: 'Licensed Real Estate Salesperson',   // WRONG designation
  photo: '/images/agents/old.jpg',
  phone: '(000) 000-0000',
  email: 'stale@mallan.nyc',
  bio: 'stale bio',
  specialties: [],
  languages: [],
  featured: false,
};

const dbHit = async () => CLAUDIA_DB;
const dbMiss = async () => null;
const dbDown = async () => { throw new Error('ECONNREFUSED'); };
const staticHas = () => STALE_STATIC;
const staticNone = () => undefined;

describe('a database that replies is final', () => {
  it('serves the canonical record when the agent exists', async () => {
    const p = await resolvePublicAgent('claudia-milkowski', dbHit);
    expect(p!.source).toBe('database');
    expect(p!.email).toBe('cmilkowski@mallan.nyc');
    expect(p!.photo).toBe('/images/agents/claudia-milkowski.jpg');
  });

  it('the static roster CANNOT override a canonical record', async () => {
    const p = await resolvePublicAgent('claudia-milkowski', dbHit);
    // every stale value is absent
    expect(p!.title).not.toBe(STALE_STATIC.title);
    expect(p!.phone).not.toBe(STALE_STATIC.phone);
    expect(p!.email).not.toBe(STALE_STATIC.email);
    expect(p!.bio).not.toBe(STALE_STATIC.bio);
  });

  it('the static roster CANNOT resurrect a deactivated or deleted agent', async () => {
    // the database replied and holds no ACTIVE agent -> 404, not a static page
    const p = await resolvePublicAgent('claudia-milkowski', dbMiss);
    expect(p).toBeNull();
  });
});

describe('an outage FAILS CLOSED - it never publishes a stale identity', () => {
  it('throws AgentDirectoryUnavailable instead of serving the static roster', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(resolvePublicAgent('claudia-milkowski', dbDown))
      .rejects.toBeInstanceOf(AgentDirectoryUnavailable);
    expect(errSpy).toHaveBeenCalled();   // loud, not silent
    errSpy.mockRestore();
  });

  it('a deactivated agent cannot reappear during an outage', async () => {
    // The earlier revision fell back to Git here, so a withdrawn licensee's
    // employment and licence status was republished for the whole outage.
    // Being briefly unavailable is safer than being briefly wrong.
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(resolvePublicAgent('claudia-milkowski', dbDown)).rejects.toThrow();
    errSpy.mockRestore();
  });

  it('no public surface reads the static roster at runtime', () => {
    const profilePage = readFileSync(resolve(ROOT, 'app/agents/[name]/page.tsx'), 'utf8');
    const rosterPage = readFileSync(resolve(ROOT, 'app/agents/page.tsx'), 'utf8');
    const publicApi = readFileSync(resolve(ROOT, 'app/api/agents/public/route.ts'), 'utf8');
    const listingsPage = readFileSync(resolve(ROOT, 'app/agents/[name]/listings/page.tsx'), 'utf8');
    for (const src of [profilePage, rosterPage, publicApi, listingsPage]) {
      // an IMPORT is a runtime source; a comment mentioning the old behaviour is not
      expect(src).not.toMatch(/import .*data\/agents\.json/);
      expect(src).not.toContain('agentsJson.agents');
    }
    // the API says unavailable rather than substituting
    expect(publicApi).toContain('agent_directory_unavailable');
    expect(publicApi).toContain('503');
  });
});

describe('neither source can mislabel a licensee', () => {
  it('derives the designation from licence + role, not the stored column', () => {
    // a stale title column says Salesperson; licence + role say Associate Broker
    const p = fromDatabase({ ...CLAUDIA_DB, title: 'Licensed Real Estate Salesperson' }, 'x');
    expect(p.title).toBe('Licensed Real Estate Associate Broker');
  });

  it('a principal broker and an associate broker are distinguished by role', () => {
    expect(fromDatabase({ ...CLAUDIA_DB, role: 'BROKER' }, 'x').title)
      .toBe('Licensed Real Estate Broker');
    expect(fromDatabase({ ...CLAUDIA_DB, role: 'AGENT' }, 'x').title)
      .toBe('Licensed Real Estate Associate Broker');
  });

  it('a salesperson licence renders the salesperson designation', () => {
    expect(fromDatabase({ ...CLAUDIA_DB, license_type: 'salesperson' }, 'x').title)
      .toBe('Licensed Real Estate Salesperson');
  });

  it('the static path keeps its stored title, since it has no licence to derive from', () => {
    expect(fromStatic(STALE_STATIC).title).toBe('Licensed Real Estate Salesperson');
  });
});

describe('the pages actually use the authority', () => {
  const profilePage = readFileSync(resolve(ROOT, 'app/agents/[name]/page.tsx'), 'utf8');
  const rosterPage = readFileSync(resolve(ROOT, 'app/agents/page.tsx'), 'utf8');
  const publicApi = readFileSync(resolve(ROOT, 'app/api/agents/public/route.ts'), 'utf8');

  it('the profile page resolves through the authority', () => {
    expect(profilePage).toContain('resolvePublicAgent(');
    // the old unconditional fallback is gone
    expect(profilePage).not.toContain('return staticAgent || null;');
  });

  it('every public surface derives the title through the authority', () => {
    // the static helpers are no longer runtime paths, so only the DB shapes
    // should appear on a public surface
    expect(rosterPage).toContain('fromDatabase');
    expect(publicApi).toContain('directoryFromDatabase');
    expect(rosterPage).not.toContain('fromStatic');
    expect(publicApi).not.toContain('directoryFromStatic');
  });

  it('the public API never SELECTS contact columns, not merely strips them', () => {
    // The compliance rule checks the select as well as the response: fetching
    // PII you intend to discard leaves one mapping mistake between the database
    // and a harvestable public endpoint.
    const select = publicApi.slice(publicApi.indexOf('select: {'), publicApi.indexOf('},', publicApi.indexOf('select: {')));
    expect(select).not.toContain('phone');
    expect(select).not.toContain('email');
    expect(publicApi).toContain('directoryFromDatabase');
  });
});

describe('the directory shape carries no contact data at all', () => {
  it('directoryFromDatabase cannot emit phone or email', () => {
    const entry = directoryFromDatabase(
      { ...CLAUDIA_DB, phone: undefined, email: undefined } as never, 'x');
    expect('phone' in entry).toBe(false);
    expect('email' in entry).toBe(false);
    expect(entry.title).toBe('Licensed Real Estate Associate Broker');
  });

  it('directoryFromStatic drops them too', () => {
    const entry = directoryFromStatic(STALE_STATIC);
    expect('phone' in entry).toBe(false);
    expect('email' in entry).toBe(false);
  });
});

describe('the individual profile handles all THREE database outcomes', () => {
  const profilePage = readFileSync(resolve(ROOT, 'app/agents/[name]/page.tsx'), 'utf8');
  const listingsPage = readFileSync(resolve(ROOT, 'app/agents/[name]/listings/page.tsx'), 'utf8');

  // resolvePublicAgent deliberately THROWS on an outage so a stale Git identity
  // is never substituted. Both callers on both pages were letting that escape
  // as an unhandled server-component error - the policy was right, the
  // presentation was missing.
  for (const [label, src] of [['profile', profilePage], ['listings', listingsPage]] as const) {
    it(`${label}: catches AgentDirectoryUnavailable rather than letting it escape`, () => {
      expect(src).toContain('AgentDirectoryUnavailable');
      expect(src).toContain("return { state: 'unavailable' }");
    });

    it(`${label}: distinguishes not_found (404) from unavailable`, () => {
      expect(src).toContain("state: 'not_found'");
      expect(src).toContain('notFound();');
      expect(src).toContain('Temporarily Unavailable');
    });

    it(`${label}: an outage is never indexed as the agent's real page`, () => {
      expect(src).toContain('robots: { index: false, follow: false }');
    });

    it(`${label}: every getAgentBySlug call goes through the guarded resolver`, () => {
      // exactly one direct call, and it is inside the try/catch
      expect(src.split('await getAgentBySlug(').length - 1).toBe(1);
    });

    it(`${label}: does NOT restore a static fallback to paper over the outage`, () => {
      expect(src).not.toMatch(/import .*data\/agents\.json/);
    });
  }
});
