/// <reference types="jest" />
/**
 * CRM "My Listings" — PERSONAL PARTICIPATION, NOT MERE EXISTENCE.
 *
 * ── WHY THIS FILE WAS REWRITTEN (P0 incident, 2026-08-17) ──────────────────
 * It previously pinned the DEFECT. The old assertions locked in:
 *
 *     trestleClosed = { mls_id: { not: null }, status: { in: TRESTLE_CLOSED } }
 *     OR: [crmCreated, crmCreatedRental, trestleClosed]
 *
 * — a predicate with NO participation test. It matched every Cotality terminal
 * row in the database: 522 rows across 387 distinct list agents and 65 offices.
 * Combined with `if (auth.role !== "BROKER") { where.agent_id = ... }`, which
 * skipped the only ownership constraint for the principal broker, and a
 * `updated_at desc` + `take 200` window, the screen showed 200 rows of which
 * ZERO belonged to the caller.
 *
 * Reproduced exactly against production, and verified against LIVE Cotality:
 * the caller participated in 0 of 12 sampled contaminating rows, while 6/6 of
 * the rows that SHOULD appear resolved to `ListAgentMlsId 39361 = "Maya Allan"`.
 *
 * A test that pins a defective predicate is worse than no test — it converts a
 * bug into a protected invariant. These assertions now pin the CONTRACT.
 */

import { readFileSync } from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf-8');

const routeSource = read('app/api/crm/listings/route.ts');
const resolverSource = read('lib/crm/personal-participation.ts');

describe('ownership is resolved by ONE canonical owner', () => {
  test('the route delegates to participationWhere instead of building its own predicate', () => {
    expect(routeSource).toContain('participationWhere(');
    expect(routeSource).toMatch(/from ["']@\/lib\/crm\/personal-participation["']/);
  });

  test('the unscoped provider predicate is GONE', () => {
    // Strip comments: the incident is documented in prose that necessarily
    // quotes the old code, and prose must not satisfy or fail this assertion.
    const code = routeSource
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    expect(code).not.toMatch(/const\s+trestleClosed\s*=/);
    expect(code).not.toMatch(/OR:\s*\[crmCreated/);
  });

  test('BROKER no longer bypasses ownership', () => {
    const code = routeSource
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    // The exact line that turned the principal broker's personal screen into
    // global inventory.
    expect(code).not.toMatch(/auth\.role\s*!==\s*["']BROKER["']/);
  });

  test('scope is an EXPLICIT argument, never derived from role alone', () => {
    // A broker may REQUEST brokerage scope; they must not receive it implicitly.
    expect(routeSource).toMatch(/searchParams\.get\(["']scope["']\)\s*===\s*["']brokerage["']/);
    expect(routeSource).toMatch(/participationWhere\([\s\S]{0,200}?scope,?\s*\)/);
  });
});

describe('the participation contract itself', () => {
  test('personal scope requires PROVEN participation on every arm', () => {
    // Mallan-authored rows must be owned by THIS agent — not merely be
    // Mallan-authored.
    expect(resolverSource).toMatch(/mallanAuthoredScope\(\),\s*\{\s*agent_id:/);
    // Cotality participation uses the live-verified identity field.
    expect(resolverSource).toContain('list_agent_mls_id: identity.trestleMlsId');
    expect(resolverSource).toContain('co_list_agent_mls_id: identity.trestleMlsId');
  });

  test('an agent with no provider identity gets NO provider rows (fails closed)', () => {
    // `trestleMlsId: null` must not degrade into an unconstrained match, AND a
    // sentinel (`NONMEMBER`, team codes) must never be treated as an agent
    // identity — that would attribute 8,212 non-member transactions to whoever
    // carried it.
    expect(resolverSource).toMatch(/if\s*\(identity\.trestleMlsId\)/);
  });

  test('listing-side roles resolve through the one contract; buyer-side roles are HELD', () => {
    // CORRECTED 2026-08-19. This previously required all four roles to be wired.
    // The two buyer-side clauses were wired unconditionally while
    // `docs/operations/buyer-participation-schema-hold-2026-08-17.md` §7 still
    // lists "Enable the two buyer-side clauses" as an UNCHECKED authorization box
    // and states "None of these has been performed."
    //
    // Production has ZERO `%buyer%` columns on `listings` (verified 2026-08-19),
    // so emitting them raises Prisma P2022 on every personal-participation query
    // — schema-dependent code deployed ahead of its migration, i.e. the
    // 2026-04-19 silent-drift failure mode (NEON.md Trap #1).
    //
    // Expand-first: the MIGRATION leads, the READER follows. Restore the buyer
    // rows here when that migration is authorized and applied.
    for (const col of ['list_agent_mls_id', 'co_list_agent_mls_id']) {
      expect(resolverSource).toContain(`clauses.push({ ${col}: identity.trestleMlsId })`);
    }
    for (const col of ['buyer_agent_mls_id', 'co_buyer_agent_mls_id']) {
      expect(resolverSource).not.toContain(`clauses.push({ ${col}: identity.trestleMlsId })`);
    }
  });

  test('brokerage scope fails CLOSED without a proven office identity', () => {
    // The dangerous direction is "no office => everything". It must be
    // "no office => nothing".
    expect(resolverSource).toMatch(/offices\.length === 0\)\s*return\s*\{\s*id:\s*\{\s*in:\s*\[\]\s*\}\s*\}/);
  });

  test('buyer-side is structurally reserved, not silently dropped', () => {
    // The provider contract is proven; only STORAGE is missing. The resolver
    // must carry that fact so it is not rediscovered later as a "gap".
    expect(resolverSource).toContain('BUYER_PARTICIPATION_HOLD');
    expect(resolverSource).toContain('BuyerAgentMlsId');
    // The sentinel vocabulary must be recorded — this field is NOT purely numeric.
    expect(resolverSource).toContain('NONMEMBER');
  });
});

describe('legitimate personal listings cannot be crowded out', () => {
  test('Mallan-authored rows are fetched as their OWN query, not sorted for', () => {
    // Defect (3): a single `updated_at desc` let 426 continuously-resynced
    // provider rows push the caller's own listings past the 200-row cap.
    //
    // A COLUMN SORT CANNOT FIX THIS, and both obvious attempts are wrong:
    //   `rls_eligible asc` reuses a VISIBILITY flag as a SOURCE test and fails
    //                      on an RLS-eligible SL- exclusive;
    //   `listing_id asc`   puts 'RLS…' BEFORE 'SL-' ('R' < 'S'), so SL- rows
    //                      would land after every provider row.
    //
    // Inclusion is therefore STRUCTURAL: a separate bounded query, merged first.
    expect(routeSource).toContain('mallanAuthoredScope()');
    expect(routeSource).toMatch(/const mallanFirst\s*=\s*mallanTake > 0/);
    // Pagination math over the concatenation — proven in crm-my-listings-pagination.test.ts
    expect(routeSource).toContain('const providerSkip = Math.max(0, offset - mallanTotal)');
    expect(routeSource).toContain('[...mallanFirst, ...providerRows]');
    // The discredited sort key must not return.
    expect(routeSource).not.toMatch(/orderBy:\s*\[\s*\{\s*rls_eligible:/);
  });

  test('the CRM display policy is separate from the ownership predicate', () => {
    // Withdrawn/Cancelled hiding is presentation, not ownership. Folding it into
    // the ownership arm is how an ownership bug hid behind a status filter.
    expect(routeSource).toContain('CRM_HIDDEN_STATUSES');
    expect(routeSource).toMatch(/if\s*\(!status\)\s*where\.status\s*=\s*\{\s*notIn:/);
  });
});
