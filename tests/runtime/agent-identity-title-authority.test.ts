/// <reference types="jest" />
/**
 * ONE title authority, including on the sign-in identity endpoint.
 *
 * ── The defect ────────────────────────────────────────────────────────────
 * `lib/agents/professional-title.ts` is the single authority for the regulated
 * professional designation, and the public surfaces all defer to it. The CRM
 * sign-in endpoint `/api/auth/me` did not. It carried its own copy:
 *
 *     if (type === "broker") return "Licensed Real Estate Broker";
 *     return "Licensed Real Estate Salesperson";
 *
 * That mapping read `license_type` ALONE, at a time when the column could not
 * distinguish the two people who both hold a NY broker licence. The answer is
 * NOT to consult `role` — an authorisation grant cannot state a licence class.
 * The column now carries three classes and answers on its own:
 *
 *     principal broker   license_type "broker"
 *     associate broker   license_type "associate_broker"
 *
 * Under the old mapping every Associate Broker signing in was handed the
 * PRINCIPAL broker designation. That is not a cosmetic label: `/api/auth/me`
 * populates
 * `LOGGED_IN_AGENT.licenseTitle` and `AGENT_PROFILE.licenseTitle` /
 * `AGENT_PROFILE.title` in `public/crm/js/core/agent-context.js`, which are
 * printed on CMA reports, print headers and footers, and outbound email
 * signatures addressed to outside brokers. Advertising a designation the
 * licensee does not hold is a false statement about a licensee under NY DOS
 * 19 NYCRR 175.25 — the exact failure the title authority exists to prevent.
 *
 * These tests exercise the ROUTE, not the helper, because the helper was
 * already correct. The bug was that this caller did not use it.
 */

import {
  PRINCIPAL_BROKER_TITLE,
  ASSOCIATE_BROKER_TITLE,
  SALESPERSON_TITLE,
} from '@/lib/agents/professional-title';

const agentFindUniqueMock = jest.fn();
const leadFindUniqueMock = jest.fn(async () => null);

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    agent: { findUnique: agentFindUniqueMock },
    lead: { findUnique: leadFindUniqueMock },
  },
}));

const validateSessionMock = jest.fn();
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  SESSION_COOKIE: 'mallan_session',
  validateSession: validateSessionMock,
}));

import { GET } from '@/app/api/auth/me/route';

/**
 * The route reads `req.cookies.get(...)`, which the shared `makeRequest`
 * helper's plain Request does not provide. Minimal stub with just that.
 */
function requestWithSession(token: string | null) {
  return {
    cookies: {
      get: (name: string) =>
        token && name === 'mallan_session' ? { name, value: token } : undefined,
    },
  } as never;
}

/** Canonical Agent row shape the route selects. */
function agentRow(over: Record<string, unknown> = {}) {
  return {
    id: 42n,
    first_name: 'Claudia',
    last_name: 'Milkowski',
    full_name: 'Claudia Milkowski',
    email: 'cmilkowski@mallan.nyc',
    role: 'AGENT',
    license_no: '10301200574',
    license_type: 'associate_broker',
    title: 'Licensed Associate Real Estate Broker',
    trestle_mls_id: null,
    phone: '(646) 418-8388',
    ...over,
  };
}

async function licenseTitleFor(over: Record<string, unknown> = {}) {
  agentFindUniqueMock.mockResolvedValueOnce(agentRow(over));
  const res = await GET(requestWithSession('tok'));
  const body = await res.json();
  return body;
}

beforeEach(() => {
  jest.clearAllMocks();
  validateSessionMock.mockResolvedValue({ userType: 'agent', userId: 42n, role: 'AGENT' });
});

describe('/api/auth/me derives the designation through the ONE authority', () => {
  it('an ASSOCIATE broker (license_type associate_broker) is not styled a principal broker', async () => {
    const body = await licenseTitleFor();
    expect(body.authenticated).toBe(true);
    expect(body.user.licenseTitle).toBe(ASSOCIATE_BROKER_TITLE);
    expect(body.user.licenseTitle).toBe('Licensed Associate Real Estate Broker');
    // The precise regression: license_type "broker" alone used to yield this.
    expect(body.user.licenseTitle).not.toBe(PRINCIPAL_BROKER_TITLE);
  });

  it('the sign-in designation ignores the authorisation grant entirely', async () => {
    // Same licence class, opposite authorisation: identical designation.
    const asAgent = await licenseTitleFor({ role: 'AGENT' });
    const asBroker = await licenseTitleFor({ role: 'BROKER' });
    expect(asAgent.user.licenseTitle).toBe(ASSOCIATE_BROKER_TITLE);
    expect(asBroker.user.licenseTitle).toBe(ASSOCIATE_BROKER_TITLE);
  });

  it('the principal broker (broker licence, role BROKER) keeps the principal designation', async () => {
    const body = await licenseTitleFor({
      first_name: 'Maya',
      last_name: 'Allan',
      full_name: 'Maya Allan',
      email: 'maya@mallan.nyc',
      role: 'BROKER',
      license_type: 'broker',
      title: 'Licensed Real Estate Broker',
    });
    expect(body.user.licenseTitle).toBe(PRINCIPAL_BROKER_TITLE);
  });

  it('a salesperson licence yields the salesperson designation regardless of role', async () => {
    const body = await licenseTitleFor({ license_type: 'salesperson', role: 'AGENT', title: null });
    expect(body.user.licenseTitle).toBe(SALESPERSON_TITLE);
  });

  it('the role alone never promotes a designation: role BROKER on a salesperson licence is still salesperson', async () => {
    // An incoherent pair is rejected at the WRITE boundary
    // (rejectIncoherentLicenceRole). If one is already stored, the read path
    // must not silently invent a broker designation for a salesperson licence.
    const body = await licenseTitleFor({ license_type: 'salesperson', role: 'BROKER', title: null });
    expect(body.user.licenseTitle).toBe(SALESPERSON_TITLE);
  });

  it('still returns `role` as the AUTHORISATION contract, unchanged', async () => {
    // The designation stopped reading role; the response did not stop
    // REPORTING it. Every CRM access gate depends on this field.
    const body = await licenseTitleFor({ role: 'AGENT' });
    expect(body.role).toBe('AGENT');
    const asBroker = await licenseTitleFor({ role: 'BROKER' });
    expect(asBroker.role).toBe('BROKER');
  });

  it('a legacy designation string stored in license_type is interpreted, not published blank', async () => {
    const body = await licenseTitleFor({ license_type: 'Licensed Associate Broker', title: null });
    expect(body.user.licenseTitle).toBe(ASSOCIATE_BROKER_TITLE);
  });

  it('an unresolvable licence falls back to the stored title rather than defaulting', async () => {
    const body = await licenseTitleFor({ license_type: null, title: 'Licensed Real Estate Associate Broker' });
    expect(body.user.licenseTitle).toBe(ASSOCIATE_BROKER_TITLE);
  });

  it('nothing resolvable asserts NO designation (null), never a defaulted one', async () => {
    const body = await licenseTitleFor({ license_type: null, title: null });
    // null, not "" — the documented contract is `licenseTitle: string | null`,
    // and asserting nothing beats asserting a designation nobody can stand behind.
    expect(body.user.licenseTitle).toBeNull();
    expect(body.user.licenseTitle).not.toBe(SALESPERSON_TITLE);
    expect(body.user.licenseTitle).not.toBe(PRINCIPAL_BROKER_TITLE);
  });

  it('selects the licence class and the stored title', async () => {
    await licenseTitleFor();
    const select = agentFindUniqueMock.mock.calls[0][0].select;
    // license_type answers the designation question on its own now. `role` is
    // still selected, but ONLY because the response reports it as the
    // authorisation contract - never as an identity input.
    expect(select.license_type).toBe(true);
    expect(select.title).toBe(true);
    expect(select.role).toBe(true);
  });
});

describe('the route holds no competing copy of the mapping', () => {
  const routeSrc = require('fs').readFileSync(
    require('path').resolve(__dirname, '../../app/api/auth/me/route.ts'),
    'utf8',
  ) as string;

  it('imports the one authority', () => {
    expect(routeSrc).toContain("from \"@/lib/agents/professional-title\"");
    expect(routeSrc).toContain('professionalTitle(agent)');
  });

  it('no longer branches on license_type to produce a designation', () => {
    // Strip the block comment that documents the removed code, then assert the
    // live source carries no designation branch of its own.
    const live = routeSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(live).not.toMatch(/===\s*"broker"/);
    expect(live).not.toContain('"Licensed Real Estate Broker"');
    expect(live).not.toContain('"Licensed Real Estate Salesperson"');
  });
});

describe('the agent directory does not invite indexing of its outage page', () => {
  const rosterSrc = require('fs').readFileSync(
    require('path').resolve(__dirname, '../../app/agents/page.tsx'),
    'utf8',
  ) as string;

  it('resolves metadata per request instead of exporting one fixed object', () => {
    // A fixed `export const metadata` always claimed the canonical agents URL,
    // so the "temporarily unavailable" body was served under an indexable head.
    expect(rosterSrc).not.toMatch(/export const metadata\s*:/);
    expect(rosterSrc).toContain('export async function generateMetadata()');
  });

  it('noindexes the unavailable roster', () => {
    expect(rosterSrc).toContain('robots: { index: false, follow: false }');
    // and only in the unavailable branch — the healthy roster stays canonical
    expect(rosterSrc).toContain("alternates: { canonical: 'https://mallan.nyc/agents' }");
  });

  it('shares ONE database read between the head and the body', () => {
    // Otherwise the metadata branch doubles the query, and head and body can
    // disagree if the database changes state between the two calls.
    expect(rosterSrc).toContain("import { cache } from 'react'");
    expect(rosterSrc).toContain('const getAgents = cache(');
  });

  it('still refuses to substitute the static Git roster during an outage', () => {
    expect(rosterSrc).not.toContain('fromStatic');
    expect(rosterSrc).not.toContain('agents.json');
    expect(rosterSrc).toContain('return null;');
  });
});
