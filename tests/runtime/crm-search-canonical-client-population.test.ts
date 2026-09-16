/// <reference types="jest" />
/**
 * Backend Agent Search consumes the CANONICAL, SERVER-AUTHORIZED client population — and does not
 * reinterpret ownership in the browser.
 *
 * LANE 2 of the three-lane split (Lane 1 closed at fa141349). This lane converges SOURCE + ACCESS only.
 * It makes no authorization-policy decision, and it deliberately decides nothing about active/closed
 * clients — that is Lane 3.
 *
 * TWO DEFECTS THIS CLOSES
 *
 * 1. WRONG SOURCE. public/crm/js/core/data-loader.js fetched /api/crm/leads?limit=200. For a BROKER that
 *    route defaults to `where.agent_id = null` (app/api/crm/leads/route.ts:34-36) — the UNASSIGNED queue —
 *    and its own comment says "Assigned leads are clients ... they show in My Clients, not here". So the
 *    principal broker's Search picker was fed exactly the people who are NOT her clients.
 *
 * 2. A SECOND AUTHORIZATION INTERPRETER IN THE BROWSER. getMyClients()
 *    (public/crm/js/crm/client-database.js) re-applied `LOGGED_IN_AGENT.role === 'broker' ||
 *    c.agentId === LOGGED_IN_AGENT.id`. The server has ALREADY scoped /api/crm/clients — brokerage-wide
 *    for a BROKER, `agent_id = userId` for every other licensee (lib/db/clients.ts:61-62) — so a browser
 *    re-filter is not a boundary; it is a second statement of a policy that can only disagree.
 *    Note it was also case-mismatched: it compared against lowercase 'broker' while the server compares
 *    against exactly "BROKER", so an ordinary agent could have had every valid row removed after the
 *    endpoint swap.
 *
 * WHAT WAS NOT DONE, DELIBERATELY
 *   - no status / role / pipeline-stage / portal-role / "active client" filter (Lane 3);
 *   - the server's 200-per-page cap is NOT raised — pagination follows offset/total instead;
 *   - no second Client DTO: ClientNormalizer stays the one presentation normalizer;
 *   - openClientWorkspace() remains the sanctioned Search -> CRM bridge;
 *   - the nearby fabricated listing defaults in the same transformer (borough || 'Manhattan',
 *     listingType 'Exclusive', …) are registered Search P0s and were left alone.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import * as vm from 'vm';

const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');
const stripComments = (s: string) => s.split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '')).join('\n');

const API_CLIENT = read('public/crm/js/core/api-client.js');
const DATA_LOADER = read('public/crm/js/core/data-loader.js');
const PAGINATION = read('public/crm/js/search/pagination.js');
const SAVED_SEARCHES = read('public/crm/js/search/saved-searches.js');

type Page = { clients: Array<Record<string, unknown>>; total: number; limit: number; offset: number };

/** Boot api-client.js in a vm sandbox with a scripted /api/crm/clients. Returns the MallanAPI + the log. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function bootApiClient(pages: (offset: number, limit: number) => Page | Error) {
  const urls: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sandbox: any = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Promise, Object, Array, String, Number, Boolean, JSON, Error, RegExp, Math, isNaN, parseInt, parseFloat,
    encodeURIComponent, decodeURIComponent, setTimeout, clearTimeout,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    document: { cookie: '' },
    CustomEvent: function (this: Record<string, unknown>, t: string) { this.type = t; },
    fetch: (url: string) => {
      urls.push(String(url));
      const u = new URL(String(url), 'https://mallan.nyc');
      const limit = parseInt(u.searchParams.get('limit') || '50', 10);
      const offset = parseInt(u.searchParams.get('offset') || '0', 10);
      const out = pages(offset, limit);
      if (out instanceof Error) return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: out.message }) });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(out) });
    },
  };
  sandbox.window = sandbox;
  sandbox.location = { origin: 'https://mallan.nyc', hostname: 'mallan.nyc', host: 'mallan.nyc', protocol: 'https:', pathname: '/crm/search', href: 'https://mallan.nyc/crm/search' };
  vm.createContext(sandbox);
  vm.runInContext(API_CLIENT, sandbox);
  return { api: sandbox.MallanAPI ?? sandbox.window.MallanAPI, urls };
}

/** A scripted server: `total` rows, paged at whatever limit is asked, ids 1..total. */
const serverWith = (total: number, opts: { duplicateIdOnPage?: number; failAtOffset?: number } = {}) =>
  (offset: number, limit: number): Page | Error => {
    if (opts.failAtOffset !== undefined && offset === opts.failAtOffset) return new Error('upstream failure');
    const rows: Array<Record<string, unknown>> = [];
    for (let i = offset; i < Math.min(offset + limit, total); i++) {
      rows.push({ id: String(i + 1), first_name: 'C' + (i + 1), last_name: 'X', email: 'c' + (i + 1) + '@e.test', agent_id: 'agent-1' });
    }
    if (opts.duplicateIdOnPage !== undefined && offset === opts.duplicateIdOnPage && rows.length > 0) {
      rows[rows.length - 1] = { ...rows[0] };   // repeat an id already seen on this page
    }
    return { clients: rows, total, limit, offset };
  };

describe('D · the canonical paginated loader', () => {
  it('exists on the canonical API client', () => {
    const { api } = bootApiClient(serverWith(0));
    expect(typeof api.clients.listAll).toBe('function');
  });

  it('0 clients → empty array, no crash', async () => {
    const { api } = bootApiClient(serverWith(0));
    await expect(api.clients.listAll()).resolves.toEqual([]);
  });

  it('1 short page → exactly those rows', async () => {
    const { api } = bootApiClient(serverWith(7));
    const rows = await api.clients.listAll();
    expect(rows.length).toBe(7);
  });

  it('exactly 200 → 200 rows, and it does not spin forever', async () => {
    const { api, urls } = bootApiClient(serverWith(200));
    const rows = await api.clients.listAll();
    expect(rows.length).toBe(200);
    expect(urls.length).toBeLessThanOrEqual(3);
  });

  it('201 → all 201 rows, proving the second page is fetched', async () => {
    const { api } = bootApiClient(serverWith(201));
    const rows = await api.clients.listAll();
    expect({ count: rows.length, why: 'a broker with 201 clients must not silently receive 200' })
      .toEqual({ count: 201, why: expect.any(String) });
  });

  it('>400 → every row, across three or more pages', async () => {
    const { api, urls } = bootApiClient(serverWith(437));
    const rows = await api.clients.listAll();
    expect(rows.length).toBe(437);
    expect(urls.length).toBeGreaterThanOrEqual(3);
  });

  it('never requests a page size above the server cap of 200', async () => {
    const { api, urls } = bootApiClient(serverWith(437));
    await api.clients.listAll({ limit: 5000 });
    for (const u of urls) {
      const limit = parseInt(new URL(u, 'https://mallan.nyc').searchParams.get('limit') || '0', 10);
      expect(limit).toBeLessThanOrEqual(200);
    }
  });

  it('a duplicate id cannot duplicate the population', async () => {
    const { api } = bootApiClient(serverWith(250, { duplicateIdOnPage: 0 }));
    const rows = await api.clients.listAll();
    const ids = rows.map((r: Record<string, unknown>) => String(r.id));
    expect({ unique: new Set(ids).size, length: ids.length }).toEqual({ unique: ids.length, length: ids.length });
  });

  it('a failed intermediate page REJECTS — a partial book is never reported as complete', async () => {
    const { api } = bootApiClient(serverWith(500, { failAtOffset: 200 }));
    await expect(api.clients.listAll()).rejects.toBeDefined();
  });
});

describe('A + B · the server-authorized population reaches Search unchanged', () => {
  it('BROKER: assigned AND unassigned rows both survive — no second ownership filter', async () => {
    // The server decides. A row with agent_id null is what a BROKER legitimately receives.
    const mixed = (offset: number, limit: number): Page => ({
      clients: offset > 0 ? [] : [
        { id: '1', first_name: 'Assigned', last_name: 'A', email: 'a@e.test', agent_id: 'agent-7' },
        { id: '2', first_name: 'Unassigned', last_name: 'U', email: 'u@e.test', agent_id: null },
      ],
      total: 2, limit, offset,
    });
    const { api } = bootApiClient(mixed);
    const rows = await api.clients.listAll();
    expect(rows.map((r: Record<string, unknown>) => String(r.id))).toEqual(['1', '2']);
  });

  it('AGENT: rows owned by the session survive — the loader applies no identity comparison', async () => {
    const { api } = bootApiClient(serverWith(3));
    const rows = await api.clients.listAll();
    expect(rows.length).toBe(3);
  });
});

describe('F · no Search module decides authorization', () => {
  // WHAT THESE BAN, precisely: an ownership DECISION, not any mention of role.
  // A role check used for PRESENTATION is legitimate and still present — populateClientSelect groups the
  // dropdown by agent name when the viewer is a broker (client-database.js:156), and both branches render
  // the same population. Banning the bare string would have flagged that, which is the "guard that bans a
  // string where the rule is about a decision" mistake. What must never return is a role or identity check
  // used as an INCLUSION condition over the canonical population.
  // SUPERSEDED BY DELETION, which is the stronger proof. This used to assert that getMyClients() returned
  // the server-authorized population verbatim instead of re-filtering it. The whole module that defined it
  // has since been retired (Orphan Client Retirement Packet A), so Search now has no client-population
  // accessor of its own to re-decide anything with. Asserting the module's good behaviour would require
  // resurrecting it.
  it('no Search module defines a client-population accessor at all', () => {
    expect(existsSync(resolve(ROOT, 'public/crm/js/crm/client-database.js'))).toBe(false);
    for (const [name, src] of [['data-loader', DATA_LOADER], ['pagination', PAGINATION], ['saved-searches', SAVED_SEARCHES]] as const) {
      expect({ name, hit: /function getMyClients\s*\(/.test(stripComments(src)) }).toEqual({ name, hit: false });
    }
  });

  it('no Search module filters the client population by assignment identity', () => {
    for (const [name, src] of [['data-loader', DATA_LOADER], ['pagination', PAGINATION], ['saved-searches', SAVED_SEARCHES]] as const) {
      const code = stripComments(src);
      // an identity comparison against the session, anywhere
      expect({ name, hit: /agentId\s*===\s*LOGGED_IN_AGENT/.test(code) }).toEqual({ name, hit: false });
      // a role check OR'd into an inclusion condition — the shape of "broker sees all, else mine"
      expect({ name, hit: /LOGGED_IN_AGENT\.role\s*===\s*['"]broker['"]\s*\|\|/i.test(code) }).toEqual({ name, hit: false });
    }
  });
});

describe('C · Backend Search never loads its client population from the leads route', () => {
  it('data-loader does not call /api/crm/leads', () => {
    expect(stripComments(DATA_LOADER)).not.toContain('/api/crm/leads');
  });

  it('no Search client module calls /api/crm/leads', () => {
    for (const [name, src] of [['data-loader', DATA_LOADER], ['pagination', PAGINATION], ['saved-searches', SAVED_SEARCHES]] as const) {
      expect({ name, hit: stripComments(src).indexOf('/api/crm/leads') !== -1 }).toEqual({ name, hit: false });
    }
  });

  it('the shipped artifact carries no /api/crm/leads request from the Search bundle', () => {
    // index-built.html INLINES the Search JS; the CRM dashboard bundle is a separate artifact.
    expect(stripComments(read('public/crm/index-built.html'))).not.toContain("'/api/crm/leads");
  });
});

describe('E · every Search client selector uses the canonical paginated population', () => {
  it.each([
    ['showing selector', 'pagination.js'],
    ['portal-send selector', 'pagination.js'],
    ['saved-search selector', 'saved-searches.js'],
  ])('%s no longer caps itself at a single 200-row page', (_label, file) => {
    const src = stripComments(file === 'pagination.js' ? PAGINATION : SAVED_SEARCHES);
    expect(src).not.toMatch(/clients\.list\(\s*\{\s*limit:\s*200\s*\}\s*\)/);
  });

  it('all four Search client readers go through the canonical loader', () => {
    for (const [name, src] of [['data-loader', DATA_LOADER], ['pagination', PAGINATION], ['saved-searches', SAVED_SEARCHES]] as const) {
      expect({ name, usesListAll: stripComments(src).indexOf('clients.listAll') !== -1 }).toEqual({ name, usesListAll: true });
    }
  });
});

describe('the Search -> CRM bridge requirement, and the one normalizer', () => {
  // openClientWorkspace() was NOT preserved. Its only caller was inside the dead client grid, so there was
  // no live control to hang it from, and keeping a 270-line dead module alive to host a three-line launcher
  // is how an orphan subsystem survives a cleanup. What survives is the REQUIREMENT, asserted negatively:
  // if a bridge returns, it must address the CRM by route and never by build filename.
  it('no Search module couples to the CRM by build filename', () => {
    for (const [name, src] of [['data-loader', DATA_LOADER], ['pagination', PAGINATION], ['saved-searches', SAVED_SEARCHES]] as const) {
      expect({ name, hit: /dashboard\.html/.test(stripComments(src)) }).toEqual({ name, hit: false });
    }
  });

  it('ClientNormalizer remains the single presentation normalizer for Search', () => {
    expect(stripComments(DATA_LOADER)).toContain('ClientNormalizer.normalize');
  });
});
