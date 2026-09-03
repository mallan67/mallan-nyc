/// <reference types="jest" />
// This file uses require() for its imports so jest.mock() factories are
// hoisted above them. That leaves no top-level import/export, which would
// make TypeScript treat the file as a global SCRIPT and collide its
// top-level names with the sibling agent test file. The empty export marks
// it as a module and scopes them.
export {};
/**
 * /agents/sitemap.xml must not be an agent.
 *
 * It returned HTTP 200 rendering the agent-profile "temporarily unavailable"
 * template, because [name] accepted any path segment and handed it to the Agent
 * lookup. A static asset name became an Agent identity question.
 *
 * The load-bearing assertion in this file is not "it 404s". It is that the
 * database is NEVER CONSULTED to reach that answer — proven by a Prisma double
 * that fails the test if it is touched at all. A guard placed after resolution
 * would satisfy a status-code assertion on a healthy database and still be
 * wrong during an outage, which is the entire defect. So every reserved-segment
 * case below is also run with the authority DOWN, and must give the same 404.
 */

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  cache: (fn: unknown) => fn,
}));

const findFirst = jest.fn();
const findMany = jest.fn();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    agent: {
      findFirst: (...a: unknown[]) => findFirst(...a),
      findMany: (...a: unknown[]) => findMany(...a),
    },
  },
}));

jest.mock('@/app/agents/[name]/PastDealsSection', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/agents/[name]/listings/ActiveListingsTabs', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/agents/[name]/past-deals-loader', () => ({
  __esModule: true,
  getPastDeals: async () => ({ sales: [], rentals: [] }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { isReservedAgentSegment } = require('@/lib/agents/reserved-slug');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const profilePage = require('@/app/agents/[name]/page');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const listingsPage = require('@/app/agents/[name]/listings/page');

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

/** The observed case, plus the other shapes the same guard must cover. */
const RESERVED = [
  'sitemap.xml',
  'robots.txt',
  'favicon.ico',
  'index.php',
  '.well-known',
  '_next',
  '',
];

class DbDown extends Error {
  constructor() {
    super("Can't reach database server");
    this.name = 'PrismaClientInitializationError';
  }
}

/** The authority is reachable and answers normally. */
function authorityHealthy() {
  findFirst.mockResolvedValue(HEALTHY_ROW);
  findMany.mockResolvedValue([HEALTHY_ROW]);
}

/** The authority cannot answer at all. */
function authorityDown() {
  findFirst.mockRejectedValue(new DbDown());
  findMany.mockRejectedValue(new DbDown());
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────
// The predicate itself
// ─────────────────────────────────────────────────────────────────────────
describe('isReservedAgentSegment', () => {
  it.each(RESERVED)('rejects %p', (segment) => {
    expect(isReservedAgentSegment(segment)).toBe(true);
  });

  it.each([
    'maya-allan',
    'claudia-milkowski',
    'julia-djaafar',
    'jean-luc-picard',
  ])('accepts the real slug %p', (slug) => {
    expect(isReservedAgentSegment(slug)).toBe(false);
  });

  it('does not invent a reserved-word list that could reject a person', () => {
    // A word blocklist would start deciding which human names are permissible.
    // These carry no dot and no underscore, so they are agent-shaped and must
    // pass the structural guard.
    expect(isReservedAgentSegment('sitemap')).toBe(false);
    expect(isReservedAgentSegment('robots')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// The guard runs BEFORE the database
// ─────────────────────────────────────────────────────────────────────────
describe('a reserved segment never reaches the Agent authority', () => {
  describe.each([
    ['/agents/[name]', profilePage],
    ['/agents/[name]/listings', listingsPage],
  ])('%s', (_label, mod) => {
    it.each(RESERVED)('%p is 404, with no database call at all', async (segment) => {
      authorityHealthy();
      await expect(
        mod.default({ params: Promise.resolve({ name: segment }) }),
      ).rejects.toMatchObject({ digest: expect.stringContaining('404') });
      // THE point of this file. Not "it answered 404" but "it answered without
      // asking the database whether a static asset is one of Mallan's
      // licensees".
      expect(findFirst).not.toHaveBeenCalled();
      expect(findMany).not.toHaveBeenCalled();
    });

    it.each(RESERVED)(
      '%p is STILL 404 while the authority is DOWN — the answer does not depend on availability',
      async (segment) => {
        authorityDown();
        // Before the guard this rendered the "temporarily unavailable" profile
        // with HTTP 200. A guard placed after resolution would regress to
        // exactly that, because the lookup throws before it is consulted.
        await expect(
          mod.default({ params: Promise.resolve({ name: segment }) }),
        ).rejects.toMatchObject({ digest: expect.stringContaining('404') });
        expect(findFirst).not.toHaveBeenCalled();
      },
    );

    it.each(RESERVED)('%p gets the not-found head, never the unavailable head', async (segment) => {
      authorityDown();
      const meta = await mod.generateMetadata({ params: Promise.resolve({ name: segment }) });
      expect(meta.title).toBe('Agent Not Found | Mallan Real Estate');
      expect(meta.robots).toBeUndefined();
      expect(findFirst).not.toHaveBeenCalled();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// A legitimate slug is untouched
// ─────────────────────────────────────────────────────────────────────────
describe('a legitimate slug still resolves normally', () => {
  it('the profile page still consults the authority and renders the agent', async () => {
    authorityHealthy();
    const meta = await profilePage.generateMetadata({
      params: Promise.resolve({ name: 'claudia-milkowski' }),
    });
    expect(findFirst).toHaveBeenCalled();
    expect(meta.title).toContain('Claudia Milkowski');
    expect(meta.alternates?.canonical).toBe('https://mallan.nyc/agents/claudia-milkowski');
  });

  it('the listings page still consults the authority', async () => {
    authorityHealthy();
    const meta = await listingsPage.generateMetadata({
      params: Promise.resolve({ name: 'claudia-milkowski' }),
    });
    expect(findFirst).toHaveBeenCalled();
    expect(meta.title).toContain('Claudia Milkowski');
  });

  it('an absent-but-agent-shaped slug is still the database\'s call, not the guard\'s', async () => {
    // The guard must not start answering "no such agent" — that remains the
    // authority's answer, and it is reached by asking.
    findFirst.mockResolvedValue(null);
    const meta = await profilePage.generateMetadata({
      params: Promise.resolve({ name: 'nobody-at-all' }),
    });
    expect(findFirst).toHaveBeenCalled();
    expect(meta.title).toBe('Agent Not Found | Mallan Real Estate');
  });

  it('an agent-shaped slug during an outage still gets the UNAVAILABLE head, not 404', async () => {
    // The guard must not have widened into swallowing the outage case, which
    // remains an accepted framework limitation with its own noindex handling.
    authorityDown();
    const meta = await profilePage.generateMetadata({
      params: Promise.resolve({ name: 'claudia-milkowski' }),
    });
    expect(findFirst).toHaveBeenCalled();
    expect(meta.robots).toEqual({ index: false, follow: false });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// The guard is wired at the route boundary, not bolted on after resolution
// ─────────────────────────────────────────────────────────────────────────
describe('the guard is placed before the lookup in both routes', () => {
  const read = (p: string) =>
    require('fs').readFileSync(require('path').resolve(__dirname, '../../', p), 'utf8') as string;

  it.each([
    'app/agents/[name]/page.tsx',
    'app/agents/[name]/listings/page.tsx',
  ])('%s calls the guard before getAgentBySlug', (p) => {
    const src = read(p);
    const guardAt = src.indexOf('isReservedAgentSegment(slug)');
    const lookupAt = src.indexOf('await getAgentBySlug(slug)');
    expect(guardAt).toBeGreaterThan(-1);
    expect(lookupAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(lookupAt);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Finding 2 — no individual professional claim rendered from Git
// ─────────────────────────────────────────────────────────────────────────
describe('the home page publishes no individual professional designation', () => {
  const read = (p: string) =>
    require('fs').readFileSync(require('path').resolve(__dirname, '../../', p), 'utf8') as string;

  /** JSX only — the note explaining the removal quotes the old copy. */
  const jsxOf = (src: string) =>
    src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

  it('no longer claims "Licensed NYC Broker" for a named individual', () => {
    const jsx = jsxOf(read('app/components/AboutSection.tsx'));
    expect(jsx).not.toContain('Licensed NYC Broker');
  });

  it('PRESERVES Maya as founder — a company role, not a licence assertion', () => {
    const jsx = jsxOf(read('app/components/AboutSection.tsx'));
    expect(jsx).toContain('Maya Allan');
    expect(jsx).toContain('>Founder<');
  });

  it('PRESERVES the firm-level licensing claims, which are true of the brokerage', () => {
    // "Licensed NYC Brokerage" describes Mallan Real Estate Inc., which is one.
    expect(jsxOf(read('app/components/ValueProposition.tsx'))).toContain('Licensed NYC Brokerage');
    // The firm licence and its issuing authority.
    const trust = jsxOf(read('app/components/TrustMarkers.tsx'));
    expect(trust).toContain('NY State Licensed Broker');
    expect(trust).toContain('10991205323');
    // The IDX disclaimer names the FIRM as the licensee.
    expect(read('app/components/IDXDisclaimer.tsx')).toContain(
      'Mallan Real Estate Inc. — Licensed Real Estate Broker, New York State.',
    );
  });
});
