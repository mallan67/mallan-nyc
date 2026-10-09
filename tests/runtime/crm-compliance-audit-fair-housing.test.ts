/// <reference types="jest" />
/**
 * The bulk compliance audit (POST /api/crm/compliance/audit) never passes text the write routes would refuse.
 *
 * Found 2026-10-08: the audit's own Fair Housing check scanned only PublicRemarks against a list of 22 patterns of its own (its comment said 29), and its validator pass looks for the prohibited terms in the four remark
 * slots by substring. The create route's scan (and, since the same day, the edit route's) is the canonical one: the gate's regex rules over the remarks, the showing instructions and every free-text box a form posts under
 * its own key (agentRemarks, saleBrokerComments, ...). Text in such a box, or a phrase only a gate rule names ("under 40 only"), was refused on a write and found clean by the audit. The audit now runs that scan for a listing
 * the validator found clean, then its own list (which also names steering phrases neither list has), so it flags the union, and does not report a listing twice for the same text.
 */
import { buildPrismaMock } from './helpers';

const { prisma: prismaMock } = buildPrismaMock();
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireBroker: jest.fn(async () => ({ role: 'BROKER', userId: 7n, userType: 'agent', sessionId: 'test' })),
  isAuthError: () => false,
  logAuditEvent: jest.fn(async () => undefined),
}));

type Finding = { listingId: string; category: string; severity: string; title: string; description: string };
let rows: Array<Record<string, unknown>> = [];

const listing = (id: string, raw: Record<string, unknown>) => ({
  id: BigInt(id.replace(/\D/g, '') || '1'), listing_id: id, address: '1 Main St', status: 'Active', agent_id: null, rls_eligible: true, idx_display_yn: true,
  raw_data: { Media: [1, 2, 3, 4], ...raw }, created_at: new Date(), updated_at: new Date(), days_on_market: 5,
});

async function audit(): Promise<Finding[]> {
  (prismaMock as { listing: { findMany: jest.Mock } }).listing.findMany = jest.fn(async () => rows);
  const { POST } = await import('@/app/api/crm/compliance/audit/route');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (POST as any)(new Request('http://localhost/api/crm/compliance/audit', { method: 'POST' }));
  expect(res.status).toBe(200);
  return ((await res.json()) as { findings: Finding[] }).findings;
}
/** the three ways the audit reports Fair Housing text, for one listing: the validator's prohibited terms, the write routes' scan, the audit's own steering list */
const kinds = (findings: Finding[], id: string) => {
  const fh = findings.filter((f) => f.listingId === id && f.category === 'fair_housing');
  return {
    validator: fh.filter((f) => f.title.startsWith('[Fair Housing] Prohibited terms')),
    scan: fh.filter((f) => f.title.startsWith('Fair Housing violation in ')),
    steering: fh.filter((f) => f.title.startsWith('Fair Housing violation: ')),
  };
};

describe('POST /api/crm/compliance/audit: Fair Housing findings', () => {
  it('text the validator already reports is reported once: no second finding from the scan', async () => {
    rows = [listing('RLS-A', { PublicRemarks: 'Tenant must pass background check.' })];
    const k = kinds(await audit(), 'RLS-A');
    expect(k.validator).toHaveLength(1);
    expect(k.scan).toHaveLength(0);
  });

  it('flags text in a free-text box of the form that the validator does not look at, naming the box without the raw: prefix', async () => {
    rows = [listing('RLS-B', { PublicRemarks: 'Sunny.', saleBrokerComments: 'Seniors only' })];
    const k = kinds(await audit(), 'RLS-B');
    expect(k.validator).toHaveLength(0);
    expect(k.scan).toHaveLength(1);
    expect(k.scan[0]).toMatchObject({ severity: 'critical', title: 'Fair Housing violation in saleBrokerComments' });
    expect(k.scan[0].description).toMatch(/Fair Housing violation in raw:saleBrokerComments: "[Ss]eniors only"/);
  });

  it('flags a phrase only a rule of the write gate names ("under 40 only"), in the public remarks', async () => {
    rows = [listing('RLS-C', { PublicRemarks: 'Bright one-bedroom, under 40 only.' })];
    const k = kinds(await audit(), 'RLS-C');
    expect(k.validator).toHaveLength(0);
    expect(k.scan).toHaveLength(1);
    expect(k.scan[0].title).toBe('Fair Housing violation in PublicRemarks');
  });

  it('still flags what only the audit\'s own list names (steering phrases), so no detection is lost', async () => {
    rows = [listing('RLS-D', { PublicRemarks: 'Perfect for singles, a real bachelor pad with a man cave.' })];
    const k = kinds(await audit(), 'RLS-D');
    expect(k.validator).toHaveLength(0);
    expect(k.scan).toHaveLength(0);
    expect(k.steering).toHaveLength(1);
  });

  it('a phrase the scan names is not reported a second time by the audit\'s own list', async () => {
    rows = [listing('RLS-E', { PublicRemarks: 'Bright one-bedroom, under 40 only, perfect for singles.' })];
    const k = kinds(await audit(), 'RLS-E');
    expect(k.scan).toHaveLength(1);
    expect(k.steering).toHaveLength(0);
  });

  it('clean text has no Fair Housing finding of any kind', async () => {
    rows = [listing('RLS-F', { PublicRemarks: 'Sun-filled corner one-bedroom with a renovated kitchen, close to the express train.', ShowingInstructions: 'Call the doorman.', agentRemarks: 'Great light.' })];
    const k = kinds(await audit(), 'RLS-F');
    expect([k.validator.length, k.scan.length, k.steering.length]).toEqual([0, 0, 0]);
  });
});
