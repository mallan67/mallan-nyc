/// <reference types="jest" />
/**
 * Three things this file exists to hold down.
 *
 * 1. THE UNAVAILABLE STATE IS NOT INDEXABLE — on all three public Agent
 *    surfaces, not just the two that already had it. Proven by CALLING each
 *    route's generateMetadata with the Agent authority failing, not by reading
 *    the source for a string.
 *
 * 2. THE HEALTHY AND ABSENT PATHS DID NOT MOVE — an agent that exists still
 *    resolves, and an agent the database says is absent still reaches
 *    notFound(). Fixing the outage path must not have loosened either.
 *
 * 3. NO GLOBAL PAYLOAD PUBLISHES AN INDIVIDUAL PROFESSIONAL IDENTITY — the
 *    root layout's JSON-LD may describe the BROKERAGE and may REFERENCE the
 *    founder, but it may not restate a regulated individual professional
 *    record on every page of the site.
 *
 * The tests are deliberately negative. Each one is written so that restoring
 * the defect turns it red.
 */

// ── Test doubles ─────────────────────────────────────────────────────────
// The page modules pull in client components, next/image and next/link, none
// of which matter to the metadata contract under test. Prisma is the one that
// does: every case below is driven by what it does or refuses to do.

// React 18 is what package.json installs; `cache()` is supplied by the React
// that Next.js vendors for the server at runtime. Pass it through here so the
// page module can be imported at all — the request-scoped memoisation is not
// what these tests are about.
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  cache: (fn: unknown) => fn,
}));

const findMany = jest.fn();
const findFirst = jest.fn();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { agent: { findMany: (...a: unknown[]) => findMany(...a), findFirst: (...a: unknown[]) => findFirst(...a) } },
}));

jest.mock('@/app/components/AgentsGrid', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/components/SocialShareBar', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/agents/[name]/PastDealsSection', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/agents/[name]/listings/ActiveListingsTabs', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/agents/[name]/past-deals-loader', () => ({
  __esModule: true,
  getPastDeals: async () => ({ sales: [], rentals: [] }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const rosterPage = require('@/app/agents/page');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const profilePage = require('@/app/agents/[name]/page');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const listingsPage = require('@/app/agents/[name]/listings/page');

/** A complete, healthy Agent row as the public selects read it. */
const HEALTHY_ROW = {
  public_slug: 'claudia-milkowski',
  full_name: 'Claudia Milkowski',
  first_name: 'Claudia',
  last_name: 'Milkowski',
  title: 'Licensed Real Estate Associate Broker',
  license_type: 'broker',
  role: 'AGENT',
  photo: '/images/agents/claudia.jpg',
  phone: '(646) 418-8388',
  email: 'cmilkowski@mallan.nyc',
  bio: 'Bio paragraph.',
  specialties: ['Sales'],
  languages: ['English', 'Spanish'],
  featured: false,
};

class DbDown extends Error {
  constructor() {
    super("Can't reach database server");
    this.name = 'PrismaClientInitializationError';
  }
}

function authorityUnreachable() {
  findMany.mockRejectedValue(new DbDown());
  findFirst.mockRejectedValue(new DbDown());
}

function authorityAnswers(row: unknown) {
  findMany.mockResolvedValue(row === null ? [] : [row]);
  findFirst.mockResolvedValue(row);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────
// 1. THE UNAVAILABLE STATE IS NOINDEX ON ALL THREE SURFACES
// ─────────────────────────────────────────────────────────────────────────
describe('an unreachable Agent authority is never inviting indexation', () => {
  const params = Promise.resolve({ name: 'claudia-milkowski' });

  it('/agents noindexes its unavailable roster', async () => {
    authorityUnreachable();
    const meta = await rosterPage.generateMetadata();
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it('/agents does NOT claim the canonical directory URL while unavailable', async () => {
    // Claiming the canonical URL is what invites a crawler to keep serving the
    // apology AS the roster after the outage ends.
    authorityUnreachable();
    const meta = await rosterPage.generateMetadata();
    expect(meta.alternates?.canonical).toBeUndefined();
  });

  it('/agents/[name] noindexes its unavailable profile', async () => {
    authorityUnreachable();
    const meta = await profilePage.generateMetadata({ params });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it('/agents/[name]/listings noindexes its unavailable listings', async () => {
    authorityUnreachable();
    const meta = await listingsPage.generateMetadata({ params });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it('publishes no name, title, licence or contact detail in the unavailable head', async () => {
    // The whole point of failing closed: an outage must not leak a
    // professional identity the authority could not confirm.
    authorityUnreachable();
    const heads = [
      await rosterPage.generateMetadata(),
      await profilePage.generateMetadata({ params }),
      await listingsPage.generateMetadata({ params }),
    ];
    for (const meta of heads) {
      const serialised = JSON.stringify(meta);
      expect(serialised).not.toContain('Claudia');
      expect(serialised).not.toContain('Associate Broker');
      expect(serialised).not.toContain('cmilkowski@mallan.nyc');
      expect(serialised).not.toContain('646');
    }
  });

  it('an ARBITRARY slug and a KNOWN-FORM slug get the same unavailable head', async () => {
    // During an authority failure the application genuinely cannot tell one
    // from the other, so they must not be distinguishable — that is correct,
    // and it must stay correct.
    authorityUnreachable();
    const bogus = await profilePage.generateMetadata({
      params: Promise.resolve({ name: 'zzz-not-a-real-agent-9999' }),
    });
    const known = await profilePage.generateMetadata({ params });
    expect(bogus).toEqual(known);
    expect(bogus.robots).toEqual({ index: false, follow: false });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. THE HEALTHY AND ABSENT PATHS DID NOT MOVE
// ─────────────────────────────────────────────────────────────────────────
describe('a database that answers is still final, both ways', () => {
  it('healthy + agent present -> the real indexable profile head', async () => {
    authorityAnswers(HEALTHY_ROW);
    const meta = await profilePage.generateMetadata({
      params: Promise.resolve({ name: 'claudia-milkowski' }),
    });
    expect(meta.robots).toBeUndefined();
    expect(meta.title).toContain('Claudia Milkowski');
    expect(meta.alternates?.canonical).toBe('https://mallan.nyc/agents/claudia-milkowski');
  });

  it('healthy + agent absent -> "Agent Not Found", never the unavailable head', async () => {
    // A database that replies "no such agent" is authoritative. Presenting that
    // as an outage would hide a real 404 behind a temporary-failure claim.
    authorityAnswers(null);
    const meta = await profilePage.generateMetadata({
      params: Promise.resolve({ name: 'nobody' }),
    });
    expect(meta.title).toBe('Agent Not Found | Mallan Real Estate');
    expect(meta.robots).toBeUndefined();
  });

  it('healthy + agent absent -> the page reaches notFound(), i.e. 404', async () => {
    authorityAnswers(null);
    // next/navigation's notFound() throws a framework control-flow error whose
    // digest carries the status. Asserting on the digest proves the 404 rather
    // than assuming it.
    await expect(
      profilePage.default({ params: Promise.resolve({ name: 'nobody' }) }),
    ).rejects.toMatchObject({ digest: expect.stringContaining('404') });
  });

  it('healthy roster -> canonical and indexable', async () => {
    authorityAnswers(HEALTHY_ROW);
    const meta = await rosterPage.generateMetadata();
    expect(meta.robots).toBeUndefined();
    expect(meta.alternates?.canonical).toBe('https://mallan.nyc/agents');
  });

  it('an outage still refuses to substitute the static Git roster', async () => {
    authorityUnreachable();
    // Not "the database, and the JSON file during a failure" — that is still
    // two identity authorities, just with a trigger condition.
    const src = require('fs').readFileSync(
      require('path').resolve(__dirname, '../../app/agents/page.tsx'),
      'utf8',
    ) as string;
    expect(src).not.toContain('agents.json');
    expect(src).not.toContain('fromStatic');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. NO GLOBAL PAYLOAD PUBLISHES AN INDIVIDUAL PROFESSIONAL IDENTITY
// ─────────────────────────────────────────────────────────────────────────
describe('the root layout is not a second professional-identity authority', () => {
  const layoutSrc = require('fs').readFileSync(
    require('path').resolve(__dirname, '../../app/layout.tsx'),
    'utf8',
  ) as string;

  /** The JSON-LD literal, with comments stripped so prose cannot satisfy a check. */
  const payload = layoutSrc
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n');

  it('publishes no jobTitle anywhere in the global payload', () => {
    // This is the exact line that put "Licensed Real Estate Broker" on EVERY
    // page of the site, ungoverned by the Agent record.
    expect(payload).not.toContain('jobTitle');
  });

  it('publishes no INDIVIDUAL licence in the global payload', () => {
    // Maya's individual NY DOS licence. The BROKERAGE licence is a different
    // fact and is asserted below.
    expect(payload).not.toContain('10311201806');
  });

  it('publishes no individual credential, award or expertise claim on the founder', () => {
    const founder = payload.slice(payload.indexOf('founder:'));
    expect(founder).not.toContain('hasCredential');
    expect(founder).not.toContain('EducationalOccupationalCredential');
    expect(founder).not.toContain('award');
    expect(founder).not.toContain('knowsAbout');
    expect(founder).not.toContain('telephone');
  });

  it('KEEPS the brokerage as the brokerage-level authority', () => {
    // The correction is a boundary, not a deletion. Removing Mallan's own
    // Organization data would be a different and equally wrong change.
    expect(payload).toContain("'@type': 'RealEstateAgent'");
    expect(payload).toContain("name: 'Mallan Real Estate Inc.'");
    expect(payload).toContain('10991205323');
    expect(payload).toContain('Real Estate Board of New York (REBNY)');
  });

  it('keeps founder as a REFERENCE, not a restatement', () => {
    const founder = payload.slice(payload.indexOf('founder:'));
    const block = founder.slice(0, founder.indexOf('},') + 2);
    expect(block).toContain("name: 'Maya Allan'");
    expect(block).toContain('/agents/maya-allan');
    // A bare name plus a pointer to the canonical profile — and nothing that
    // restates a regulated professional fact.
    expect(block).not.toMatch(/Licensed Real Estate/);
  });
});

describe('no other public surface hard-codes an individual professional identity', () => {
  const read = (p: string) =>
    require('fs').readFileSync(require('path').resolve(__dirname, '../../', p), 'utf8') as string;

  it('the public agent directory card does not assert a designation of its own', () => {
    // The featured card printed the literal "Principal Broker" above a name,
    // while rendering the DERIVED title directly beneath it — two professional
    // identities for one person, one of them ungoverned.
    const grid = read('app/components/AgentsGrid.tsx');
    const jsx = grid.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    expect(jsx).not.toMatch(/>\s*Principal Broker\s*</);
    expect(jsx).toContain('{featured.title}');
  });

  it('the public suggest endpoint derives the designation instead of defaulting it', () => {
    // Was `a.title || 'Licensed Real Estate Salesperson'`, which published a
    // broker-licensed Associate Broker as a salesperson.
    const suggest = read('app/api/listings/suggest/route.ts');
    // Comments stripped: the note explaining the removal quotes the old line,
    // and prose must not be able to satisfy — or break — a code assertion.
    const code = suggest.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    expect(code).not.toContain("a.title || 'Licensed Real Estate Salesperson'");
    expect(code).toContain("from '@/lib/agents/professional-title'");
    expect(code).toContain('professionalTitle(a)');
    // and it must SELECT the two axes the derivation needs
    const select = code.slice(code.indexOf('const agents = await prisma.agent.findMany'));
    expect(select.slice(0, 600)).toContain('license_type: true');
    expect(select.slice(0, 600)).toContain('role: true');
  });

  it('the international brokerage schema carries no individual licence', () => {
    const intl = read('app/buy/international/page.tsx');
    const schema = intl.slice(intl.indexOf('const brokerageSchema'), intl.indexOf('const FAQS'));
    const code = schema.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    expect(code).not.toContain('10311201806');
    // the BROKERAGE licence is a brokerage-level fact and stays
    expect(code).toContain('10991205323');
  });

  it('still makes the NY DOS 175.25 visible disclosure, which is a different thing', () => {
    // Structured data is not advertising copy. Removing the required visible
    // disclosure to satisfy the structured-data rule would create real legal
    // exposure, so this pins that it stayed.
    for (const p of ['app/buy/international/page.tsx', 'app/sell/international/page.tsx']) {
      const src = read(p);
      expect(src).toContain('Maya Allan, Principal Broker — NY Salesperson/Broker License #10311201806.');
    }
  });
});
