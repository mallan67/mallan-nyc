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
    const p = await resolvePublicAgent('claudia-milkowski', dbHit, staticHas);
    expect(p!.source).toBe('database');
    expect(p!.email).toBe('cmilkowski@mallan.nyc');
    expect(p!.photo).toBe('/images/agents/claudia-milkowski.jpg');
  });

  it('the static roster CANNOT override a canonical record', async () => {
    const p = await resolvePublicAgent('claudia-milkowski', dbHit, staticHas);
    // every stale value is absent
    expect(p!.title).not.toBe(STALE_STATIC.title);
    expect(p!.phone).not.toBe(STALE_STATIC.phone);
    expect(p!.email).not.toBe(STALE_STATIC.email);
    expect(p!.bio).not.toBe(STALE_STATIC.bio);
  });

  it('the static roster CANNOT resurrect a deactivated or deleted agent', async () => {
    // the database replied and holds no ACTIVE agent -> 404, not a static page
    const p = await resolvePublicAgent('claudia-milkowski', dbMiss, staticHas);
    expect(p).toBeNull();
  });
});

describe('the static roster is an OUTAGE fallback only', () => {
  it('answers when the database is unreachable, so a page still renders', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const p = await resolvePublicAgent('claudia-milkowski', dbDown, staticHas);
    expect(p!.source).toBe('static');
    expect(errSpy).toHaveBeenCalled();  // degradation is loud, not silent
    errSpy.mockRestore();
  });

  it('returns null when the database is down and there is no static entry', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(await resolvePublicAgent('nobody', dbDown, staticNone)).toBeNull();
    errSpy.mockRestore();
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
    expect(rosterPage).toContain('fromDatabase');
    expect(rosterPage).toContain('fromStatic');
    expect(publicApi).toContain('directoryFromDatabase');
    expect(publicApi).toContain('directoryFromStatic');
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
