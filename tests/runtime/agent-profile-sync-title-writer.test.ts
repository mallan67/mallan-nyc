/// <reference types="jest" />
/**
 * `data/agents.json` MAY NOT MANUFACTURE A REGULATED DESIGNATION.
 *
 * ── The defect ────────────────────────────────────────────────────────────
 * POST /api/crm/agents/sync-profiles is a live, broker-gated admin import. It
 * used to write:
 *
 *     if (a.title && !existing.title) update.title = a.title;
 *
 * `Agent.title` is the regulated professional designation (NY DOS 19 NYCRR
 * 175.25), DERIVED from the verified `Agent.license_type`. This route wrote it
 * straight from a tracked JSON file, and `license_type` appeared NOWHERE in the
 * write set — so a row with `license_type = null`, or a legacy ambiguous row,
 * could be handed "Licensed Associate Real Estate Broker" purely because the
 * static file said so. That is a second professional-identity writer, and the
 * point of this work is that there is exactly one.
 *
 * The SEED path is deliberately not the same thing: it normalises the
 * designation into a canonical licence class, validates the independently
 * recorded brokerage role, and writes license_type + role + the canonical title
 * TOGETHER. This route does none of that, so it writes none of them.
 *
 * `data/agents.json` is never a public identity READ authority. It is used by
 * seed tooling and by THIS explicit broker-only admin import, which is limited
 * to non-regulated profile fields.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { makeRequest } from './helpers';

const ROOT = resolve(__dirname, '../..');

const agentFindUnique = jest.fn();
const agentUpdate = jest.fn(async () => ({}));
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { agent: { findUnique: agentFindUnique, update: agentUpdate } },
}));

const requireBrokerMock = jest.fn();
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireBroker: requireBrokerMock,
  isAuthError: (v: unknown) => v instanceof Response,
  logAuditEvent: jest.fn(async () => {}),
}));

const BROKER = { userId: 1n, userType: 'agent' as const, role: 'BROKER', sessionId: 's1' };

/** The roster record the import reads for Claudia — it DOES carry a title. */
const roster = JSON.parse(readFileSync(resolve(ROOT, 'data/agents.json'), 'utf8')) as {
  agents: Array<Record<string, unknown>>;
};
const CLAUDIA_JSON = roster.agents.find((a) => a.id === 'claudia-milkowski')!;

/** A stored Agent with NO designation and NO licence class. */
function bareRow(over: Record<string, unknown> = {}) {
  return {
    id: 42n,
    email: 'cmilkowski@mallan.nyc',
    title: null,
    license_type: null,
    role: 'ASSOCIATE_BROKER',
    bio: null,
    photo: null,
    specialties: [],
    languages: [],
    public_slug: null,
    featured: false,
    phone: null,
    ...over,
  };
}

/** Only Claudia exists in the DB; the rest are skipped as "email not found". */
function onlyClaudia(row: Record<string, unknown>) {
  agentFindUnique.mockImplementation(async ({ where }: { where: { email: string } }) =>
    (where.email === 'cmilkowski@mallan.nyc' ? row : null));
}

const updatePayload = () =>
  (agentUpdate.mock.calls as unknown as Array<[{ data: Record<string, unknown> }]>)[0][0].data;

async function runSync() {
  const { POST } = await import('@/app/api/crm/agents/sync-profiles/route');
  return POST(makeRequest({
    url: 'http://test/api/crm/agents/sync-profiles', method: 'POST', body: {},
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
  requireBrokerMock.mockResolvedValue(BROKER);
});

describe('the static import cannot manufacture a professional designation', () => {
  it('the roster record it reads really does carry a title (else this suite is vacuous)', () => {
    expect(String(CLAUDIA_JSON.title)).toBe('Licensed Associate Real Estate Broker');
  });

  it('title stays NULL on a row with no licence class, while ordinary fields sync', async () => {
    onlyClaudia(bareRow());
    const res = await runSync();
    expect(res.status).toBe(200);
    expect(agentUpdate).toHaveBeenCalledTimes(1);

    const data = updatePayload();
    // THE DEFECT: this used to carry the designation straight from the file.
    expect(data).not.toHaveProperty('title');
    expect(Object.keys(data)).not.toContain('title');
    // and the licence class / brokerage role are not touched either — syncing
    // them here would be a THIRD identity writer, not a closed second one
    expect(data).not.toHaveProperty('license_type');
    expect(data).not.toHaveProperty('role');

    // ordinary, non-regulated profile fields MAY still sync
    expect(data.bio).toBe(CLAUDIA_JSON.bio);
    expect(data.photo).toBe(CLAUDIA_JSON.photo);
    expect(data.specialties).toEqual(CLAUDIA_JSON.specialties);
    expect(data.languages).toEqual(CLAUDIA_JSON.languages);
    expect(data.public_slug).toBe('claudia-milkowski');
    expect(data.phone).toBe(CLAUDIA_JSON.phone);
  });

  it('writes ONLY non-regulated fields — the allow-list is closed', async () => {
    onlyClaudia(bareRow());
    await runSync();
    const ALLOWED = ['bio', 'photo', 'specialties', 'languages', 'phone', 'public_slug', 'featured'];
    for (const k of Object.keys(updatePayload())) expect(ALLOWED).toContain(k);
  });

  it('an existing canonical title is never overwritten', async () => {
    onlyClaudia(bareRow({
      title: 'Licensed Associate Real Estate Broker',
      license_type: 'associate_broker',
    }));
    await runSync();
    const data = updatePayload();
    expect(data).not.toHaveProperty('title');
    expect(data).not.toHaveProperty('license_type');
  });

  it('a stored title that DISAGREES with the file is still not rewritten', async () => {
    // The file is not an authority on this column in either direction.
    onlyClaudia(bareRow({ title: 'Licensed Real Estate Salesperson', license_type: 'salesperson' }));
    await runSync();
    expect(updatePayload()).not.toHaveProperty('title');
  });

  it('no branch of the route writes any of the three identity columns', () => {
    const src = readFileSync(resolve(ROOT, 'app/api/crm/agents/sync-profiles/route.ts'), 'utf8');
    const code = src.split(String.fromCharCode(10))
      .filter((l) => !l.trim().startsWith('//'))
      .join(String.fromCharCode(10));
    for (const forbidden of ['update.title', 'update.license_type', 'update.role', 'a.title']) {
      expect(code).not.toContain(forbidden);
    }
  });
});
