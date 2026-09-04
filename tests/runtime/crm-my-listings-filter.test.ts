/// <reference types="jest" />
/**
 * CRM listings scope — WHICH listings the operational CRM screen may show.
 *
 * Originally (2026-05-27) this suite asserted on the text of the route file.
 * String assertions could not have caught the defect found on 2026-09-04,
 * because the clause they matched was present and correct-looking: the
 * closed-provider clause carried NO ownership predicate, so for a BROKER — who
 * gets no `agent_id` narrowing — it admitted every closed listing in the entire
 * IDX corpus (2,237 rows on production, 2,205 of them other brokerages'). Sorted
 * by `updated_at desc`, that continuously re-synced third-party population held
 * the whole first page and pushed Mallan's two active listings to ranks 726 and
 * 2,206, past any permitted page size.
 *
 * The population is therefore now proven BEHAVIOURALLY: the real `where` is
 * built and evaluated against fixture rows, and membership is asserted per row.
 */

import {
  buildCrmListingsWhere,
  resolvePageSize,
  MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  TRESTLE_CLOSED,
  CRM_HIDDEN,
} from '@/lib/crm/listings-scope';
import { MALLAN_LIST_OFFICE_MLS_IDS } from '@/lib/listings/mallan-source-identity';

// ─── Minimal evaluator for the Prisma `where` shapes this builder emits ──────
type Row = Record<string, unknown>;

function matchesCondition(value: unknown, cond: unknown): boolean {
  if (cond === null) return value === null || value === undefined;
  if (typeof cond !== 'object') return value === cond;
  const c = cond as Record<string, unknown>;
  if ('startsWith' in c) return typeof value === 'string' && value.startsWith(String(c.startsWith));
  if ('in' in c) return (c.in as unknown[]).includes(value as never);
  if ('notIn' in c) return !(c.notIn as unknown[]).includes(value as never);
  if ('not' in c) {
    if (c.not === null) return value !== null && value !== undefined;
    return value !== c.not;
  }
  throw new Error(`unsupported condition: ${JSON.stringify(cond)}`);
}

function matchesClause(row: Row, clause: Row): boolean {
  return Object.entries(clause).every(([k, v]) => matchesCondition(row[k], v));
}

function matchesWhere(row: Row, where: Record<string, unknown>): boolean {
  const { OR, ...rest } = where as { OR?: Row[] } & Row;
  if (!matchesClause(row, rest as Row)) return false;
  if (!OR) return true;
  return OR.some((clause) => matchesClause(row, clause));
}

// ─── Fixtures, mirroring the real production shapes ──────────────────────────
const MALLAN_OFFICE = MALLAN_LIST_OFFICE_MLS_IDS[0];
const OTHER_OFFICE = '7222'; // Compass, 419 closed rows on production
const PRIOR_FIRM_OFFICE = '51'; // Douglas Elliman

const rows = {
  activeLocalSale: {
    listing_id: 'SL-0004', mls_id: null, status: 'Active',
    listing_type: 'sale', list_office_mls_id: null, agent_id: 1n,
  },
  activeLocalSale2: {
    listing_id: 'SL-0007', mls_id: null, status: 'Active',
    listing_type: 'sale', list_office_mls_id: null, agent_id: 1n,
  },
  activeLocalRental: {
    listing_id: 'RL-0001', mls_id: null, status: 'Active',
    listing_type: 'rent', list_office_mls_id: null, agent_id: 2n,
  },
  withdrawnLocal: {
    listing_id: 'SL-0001', mls_id: null, status: 'Withdrawn',
    listing_type: 'sale', list_office_mls_id: null, agent_id: 1n,
  },
  cancelledLocal: {
    listing_id: 'SL-0002', mls_id: null, status: 'Cancelled',
    listing_type: 'sale', list_office_mls_id: null, agent_id: 1n,
  },
  mallanClosedDeal: {
    listing_id: 'RLS10645106', mls_id: 'RLS10645106', status: 'Closed',
    listing_type: 'sale', list_office_mls_id: MALLAN_OFFICE, agent_id: 1n,
  },
  /** THE CRITICAL NEGATIVE: the broker's own agent_id on ANOTHER brokerage's listing. */
  priorFirmClosedWithMayaAgentId: {
    listing_id: 'RLS10731386', mls_id: 'RLS10731386', status: 'Closed',
    listing_type: 'sale', list_office_mls_id: PRIOR_FIRM_OFFICE, agent_id: 1n,
  },
  thirdPartyClosed: {
    listing_id: 'RLS90000001', mls_id: 'RLS90000001', status: 'Closed',
    listing_type: 'sale', list_office_mls_id: OTHER_OFFICE, agent_id: null,
  },
  thirdPartyActive: {
    listing_id: 'RLS90000002', mls_id: 'RLS90000002', status: 'Active',
    listing_type: 'sale', list_office_mls_id: OTHER_OFFICE, agent_id: null,
  },
  /** Mallan's OWN listing returned through the feed — read-only source evidence. */
  mallanReturnCopyActive: {
    listing_id: 'RLS20099289', mls_id: '1175519507', status: 'Active',
    listing_type: 'sale', list_office_mls_id: MALLAN_OFFICE, agent_id: null,
  },
  closedUnknownOffice: {
    listing_id: 'RLS90000003', mls_id: 'RLS90000003', status: 'Closed',
    listing_type: 'sale', list_office_mls_id: null, agent_id: null,
  },
} satisfies Record<string, Row>;

const brokerWhere = buildCrmListingsWhere({ role: 'BROKER', userId: 1n });
const agentWhere = buildCrmListingsWhere({ role: 'AGENT', userId: 1n });

describe('CRM listings scope — BROKER', () => {
  test('both active Mallan-authored listings are included', () => {
    expect(matchesWhere(rows.activeLocalSale, brokerWhere)).toBe(true);
    expect(matchesWhere(rows.activeLocalSale2, brokerWhere)).toBe(true);
  });

  test('an active Mallan-authored RENTAL is included', () => {
    expect(matchesWhere(rows.activeLocalRental, brokerWhere)).toBe(true);
  });

  test("Mallan's own closed deal is included", () => {
    expect(matchesWhere(rows.mallanClosedDeal, brokerWhere)).toBe(true);
  });

  test('REGRESSION: no third-party closed listing is presented as Mallan inventory', () => {
    expect(matchesWhere(rows.thirdPartyClosed, brokerWhere)).toBe(false);
  });

  test('REGRESSION: agent_id must not confer ownership of another brokerage listing', () => {
    // Real production row: the principal broker's agent_id, her PRIOR firm's
    // office. `agent_id` is a history association, not listing ownership.
    expect(rows.priorFirmClosedWithMayaAgentId.agent_id).toBe(1n);
    expect(matchesWhere(rows.priorFirmClosedWithMayaAgentId, brokerWhere)).toBe(false);
  });

  test('a closed row with unknown office is not claimed as Mallan inventory', () => {
    expect(matchesWhere(rows.closedUnknownOffice, brokerWhere)).toBe(false);
  });

  test('active provider inventory is excluded — managed via RLS, not the CRM', () => {
    expect(matchesWhere(rows.thirdPartyActive, brokerWhere)).toBe(false);
  });

  test("Mallan's own ACTIVE return-copy never enters the CRM as an editable listing", () => {
    expect(matchesWhere(rows.mallanReturnCopyActive, brokerWhere)).toBe(false);
  });

  test('Withdrawn and Cancelled local listings stay hidden', () => {
    expect(matchesWhere(rows.withdrawnLocal, brokerWhere)).toBe(false);
    expect(matchesWhere(rows.cancelledLocal, brokerWhere)).toBe(false);
  });

  test('the whole fixture set yields exactly the Mallan population', () => {
    const included = Object.entries(rows)
      .filter(([, r]) => matchesWhere(r, brokerWhere))
      .map(([k]) => k)
      .sort();
    expect(included).toEqual(
      ['activeLocalRental', 'activeLocalSale', 'activeLocalSale2', 'mallanClosedDeal'].sort()
    );
  });
});

describe('CRM listings scope — AGENT', () => {
  test('an agent still sees only their own rows', () => {
    expect(matchesWhere(rows.activeLocalSale, agentWhere)).toBe(true);
    // agent_id 2 — another agent's rental
    expect(matchesWhere(rows.activeLocalRental, agentWhere)).toBe(false);
  });

  test("an agent does not gain another brokerage's closed listing via agent_id", () => {
    expect(matchesWhere(rows.priorFirmClosedWithMayaAgentId, agentWhere)).toBe(false);
  });

  test('the agent clause narrows by agent_id', () => {
    expect(agentWhere.agent_id).toBe(1n);
    expect(brokerWhere.agent_id).toBeUndefined();
  });
});

describe('CRM listings scope — status vocabulary', () => {
  test('closed set is Closed/Sold/Leased/Rented and excludes hidden statuses', () => {
    expect([...TRESTLE_CLOSED]).toEqual(['Closed', 'Sold', 'Leased', 'Rented']);
    for (const hidden of CRM_HIDDEN) {
      expect(TRESTLE_CLOSED as readonly string[]).not.toContain(hidden);
    }
    expect(TRESTLE_CLOSED as readonly string[]).not.toContain('Expired');
  });

  test('optional type and status narrowing is applied when supplied', () => {
    const w = buildCrmListingsWhere({ role: 'BROKER', userId: 1n, type: 'rent', status: 'Active' });
    expect(w.listing_type).toBe('rent');
    expect(w.status).toBe('Active');
  });
});

describe('pagination contract — the cap is reported, not silent', () => {
  test('a request over the cap is clamped AND reported', () => {
    const r = resolvePageSize('500');
    expect(r.requestedLimit).toBe(500);
    expect(r.limit).toBe(MAX_PAGE_SIZE);
    expect(r.limitClamped).toBe(true);
    expect(r.maxLimit).toBe(MAX_PAGE_SIZE);
  });

  test('the security cap itself is unchanged at 200', () => {
    expect(MAX_PAGE_SIZE).toBe(200);
  });

  test('a request within the cap is not reported as clamped', () => {
    const r = resolvePageSize('50');
    expect(r.limit).toBe(50);
    expect(r.limitClamped).toBe(false);
  });

  test('missing, empty and non-numeric limits fall back to the default', () => {
    for (const raw of [null, '', 'abc']) {
      const r = resolvePageSize(raw as string | null);
      expect(r.limit).toBe(DEFAULT_PAGE_SIZE);
      expect(r.limitClamped).toBe(false);
    }
  });

  test('a zero or negative limit is floored to 1', () => {
    expect(resolvePageSize('0').limit).toBe(DEFAULT_PAGE_SIZE); // parseInt('0')||DEFAULT
    expect(resolvePageSize('-5').limit).toBe(1);
  });
});
