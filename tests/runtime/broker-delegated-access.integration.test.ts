/// <reference types="jest" />
/**
 * BROKER DELEGATED ACCESS — REAL POSTGRES END-TO-END.
 *
 * The sibling unit suite proves the LOGIC against an in-memory double. It
 * cannot prove the things that only a real database decides:
 *
 *   - that `ON DELETE CASCADE` genuinely removes the delegated child when the
 *     parent broker session row is deleted (the DELETION INVARIANT). A double
 *     emulating a cascade proves only that the double emulates a cascade.
 *   - that `actor_user_id` is really persisted alongside an unchanged
 *     `user_id` on a row written by a REAL route handler.
 *   - that the whole sequence — MFA-authenticated broker -> enter agent ->
 *     write as agent -> return to broker — works with no second MFA.
 *
 * Gating: runs ONLY when DELEGATED_ACCESS_DB_URL is set, and REFUSES to run
 * against anything but the isolated QA endpoint. It never connects to
 * production Neon.
 */

// `export {}` makes this file a MODULE. Without it, ts-jest/tsc treat a test
// file with no top-level import/export as a global script, and this file's
// `integrationUrl` collides with the one in lead-upsert.integration.test.ts.
export {};

const integrationUrl = process.env.DELEGATED_ACCESS_DB_URL;
const QA_ENDPOINT = 'ep-ancient-feather-arvoo9v4';

if (!integrationUrl) {
  describe.skip('broker delegated access — real Postgres', () => {
    it('requires DELEGATED_ACCESS_DB_URL (QA only)', () => {
      /* skipped without the URL */
    });
  });
} else if (!integrationUrl.includes(QA_ENDPOINT)) {
  describe('broker delegated access — real Postgres', () => {
    it('REFUSES to run against a non-QA endpoint', () => {
      throw new Error(`DELEGATED_ACCESS_DB_URL must name ${QA_ENDPOINT}`);
    });
  });
} else {
  // The route handlers and lib/prisma read the bare DATABASE_URL. Point them
  // at QA BEFORE anything imports them.
  process.env.DATABASE_URL = integrationUrl;
  process.env.DATABASE_URL_UNPOOLED = integrationUrl;
  // The CE-course route is guarded by the fail-closed read-only switch.
  process.env.READONLY_MODE = 'false';

  // Every step is a real round trip to a remote Neon endpoint; the 5s Jest
  // default is not a meaningful assertion about this code.
  jest.setTimeout(180_000);

  describe('broker delegated access — real Postgres', () => {
    /* eslint-disable @typescript-eslint/no-var-requires */
    const { NextRequest } = require('next/server');
    const prisma = require('@/lib/prisma').default;
    const { createSessionRecord, validateSession, logAuditEvent } = require('@/lib/auth');
    const { POST: impersonate } = require('@/app/api/crm/agents/[id]/impersonate/route');
    const { POST: stopImpersonation } = require('@/app/api/auth/impersonation/stop/route');
    const { POST: addCeCourse } = require('@/app/api/crm/agents/[id]/ce-courses/route');
    const { GET: me } = require('@/app/api/auth/me/route');
    /* eslint-enable @typescript-eslint/no-var-requires */

    const TAG = `dlg-${Date.now()}`;
    const email = (who: string) => `${TAG}.${who}@qa.invalid`;

    type Agent = { id: bigint; role: string };
    let maya: Agent;      // principal broker — the delegating actor
    let claudia: Agent;   // SALESPERSON — the delegation target
    let bruno: Agent;     // ASSOCIATE_BROKER — a second valid target
    let ines: Agent;      // inactive SALESPERSON — must be refused
    let dana: Agent;      // a SECOND BROKER — must be refused as a target

    const mkAgent = (first: string, role: string, status = 'active') =>
      prisma.agent.create({
        data: {
          first_name: first,
          last_name: 'QA',
          full_name: `${first} QA`,
          email: email(first.toLowerCase()),
          password_hash: 'not-a-real-hash',
          role,
          status,
        },
        select: { id: true, role: true },
      });

    const req = (url: string, opts: { token?: string; body?: unknown; method?: string } = {}) => {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (opts.token) headers.cookie = `session_token=${opts.token}`;
      return new NextRequest(`http://localhost${url}`, {
        method: opts.method ?? 'POST',
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
    };

    const params = (id: string | bigint) => ({ params: Promise.resolve({ id: id.toString() }) });
    // NextResponse carries `.cookies`; the DOM `Response` type does not, so the
    // handler results are read through a minimal structural type.
    type WithCookies = { cookies: { get(name: string): { value: string } | undefined } };
    const cookieOf = (res: WithCookies) => res.cookies.get('session_token')?.value;

    beforeAll(async () => {
      maya = await mkAgent('Maya', 'BROKER');
      claudia = await mkAgent('Claudia', 'SALESPERSON');
      bruno = await mkAgent('Bruno', 'ASSOCIATE_BROKER');
      ines = await mkAgent('Ines', 'SALESPERSON', 'inactive');
      dana = await mkAgent('Dana', 'BROKER');
    });

    afterAll(async () => {
      const ids = [maya, claudia, bruno, ines, dana].filter(Boolean).map(a => a.id);
      await prisma.session.deleteMany({ where: { user_id: { in: ids } } });
      await prisma.auditEvent.deleteMany({ where: { user_id: { in: ids } } });
      await prisma.auditEvent.deleteMany({ where: { actor_user_id: { in: ids } } });
      await prisma.agent.deleteMany({ where: { email: { startsWith: TAG } } });
      await prisma.$disconnect();
    });

    // ═══════════════════════════════════════════════════════════════════
    // THE POSITIVE SEQUENCE — the whole requirement, end to end
    // ═══════════════════════════════════════════════════════════════════
    it('MFA-authenticated broker -> enter Claudia -> write as Claudia -> return, with NO second MFA', async () => {
      // 1. Maya authenticates once with her OWN MFA. (mfa/verify calls exactly
      //    this on success; nothing about the agent's MFA is involved anywhere
      //    in this test, and the agent's MFA settings are never read or written.)
      const brokerSession = await createSessionRecord('agent', maya.id, 'BROKER');
      const brokerTokenAtLogin = brokerSession.token;

      // 2. Claudia has her OWN independent session, established separately.
      //    It must survive untouched for the whole delegation.
      const claudiaOwn = await createSessionRecord('agent', claudia.id, 'SALESPERSON');

      // 3. Maya switches into Claudia — no Claudia password, no Claudia MFA.
      const startRes = await impersonate(
        req(`/api/crm/agents/${claudia.id}/impersonate`, { token: brokerTokenAtLogin }),
        params(claudia.id),
      );
      expect(startRes.status).toBe(200);
      const started = await startRes.json();
      expect(started.success).toBe(true);
      expect(started.impersonating.id).toBe(claudia.id.toString());

      const delegatedToken = cookieOf(startRes)!;
      expect(delegatedToken).toBeTruthy();
      // NO PARENT CREDENTIAL IS COPIED: the cookie carries a brand-new token.
      expect(delegatedToken).not.toBe(brokerTokenAtLogin);

      // 4. The delegated row: effective identity = Claudia, parent = Maya's
      //    session ID (an id, never a token), fixed 2h ceiling.
      const delegatedRow = await prisma.session.findUnique({
        where: { token: delegatedToken },
        select: { id: true, user_id: true, role: true, parent_session_id: true, expires_at: true },
      });
      expect(delegatedRow.user_id).toBe(claudia.id);
      expect(delegatedRow.role).toBe('SALESPERSON');
      expect(delegatedRow.parent_session_id).toBe(brokerSession.sessionId);
      const ttlMs = delegatedRow.expires_at.getTime() - Date.now();
      expect(ttlMs).toBeLessThanOrEqual(2 * 60 * 60 * 1000 + 5000);
      expect(ttlMs).toBeGreaterThan(60 * 60 * 1000);

      // The parent broker row is PRESERVED — not overwritten, not deleted.
      const parentRow = await prisma.session.findUnique({ where: { id: brokerSession.sessionId } });
      expect(parentRow).not.toBeNull();
      expect(parentRow.user_id).toBe(maya.id);

      // 5. ALL AUTHORIZATION OPERATES AS CLAUDIA.
      const asClaudia = await validateSession(delegatedToken);
      expect(asClaudia.userId).toBe(claudia.id);
      expect(asClaudia.role).toBe('SALESPERSON');           // agent permissions
      expect(asClaudia.role).not.toBe('BROKER');            // NOT broker permissions
      expect(asClaudia.actorUserId).toBe(maya.id);          // the real human actor

      // 6. The indicator is SERVER-SOURCED and survives a reload.
      const meRes = await me(req('/api/auth/me', { token: delegatedToken, method: 'GET' }));
      const meBody = await meRes.json();
      expect(meBody.authenticated).toBe(true);
      expect(meBody.user.id).toBe(claudia.id.toString());   // acting AS Claudia
      expect(meBody.role).toBe('SALESPERSON');
      expect(meBody.delegation.active).toBe(true);
      expect(meBody.delegation.actingAs.name).toBe('Claudia QA');
      expect(meBody.delegation.actor.id).toBe(maya.id.toString());
      expect(meBody.delegation.actor.name).toBe('Maya QA');

      // 7. A REAL WRITE through a REAL route, via a DIRECT auditEvent.create
      //    (not the shared helper) — the class of writer most at risk of
      //    losing provenance.
      const ceRes = await addCeCourse(
        req(`/api/crm/agents/${claudia.id}/ce-courses`, {
          token: delegatedToken,
          body: { course_name: 'Fair Housing 2026', provider: 'REBNY', hours: 3 },
        }),
        params(claudia.id),
      );
      expect(ceRes.status).toBe(201);

      const ceRow = await prisma.auditEvent.findFirst({
        where: { action: 'ce_course_added', entity_id: claudia.id.toString() },
        orderBy: { created_at: 'desc' },
        select: { user_id: true, actor_user_id: true, changes: true },
      });
      // ── THE REQUIRED RECORD STATE ──
      expect(ceRow.user_id).toBe(claudia.id);        // effective user / record owner
      expect(ceRow.actor_user_id).toBe(maya.id);     // the real broker actor
      expect(ceRow.user_id).not.toBe(ceRow.actor_user_id);

      // 8. And through the SHARED writer, with the delegated session.
      await logAuditEvent('update', 'lead', '424242', asClaudia, { note: TAG }, '203.0.113.9');
      const helperRow = await prisma.auditEvent.findFirst({
        where: { action: 'update', entity_type: 'lead', entity_id: '424242' },
        orderBy: { created_at: 'desc' },
        select: { user_id: true, actor_user_id: true },
      });
      expect(helperRow.user_id).toBe(claudia.id);
      expect(helperRow.actor_user_id).toBe(maya.id);

      // 9. Claudia's own session is STILL VALID and untouched.
      const claudiaStill = await validateSession(claudiaOwn.token);
      expect(claudiaStill).not.toBeNull();
      expect(claudiaStill.userId).toBe(claudia.id);
      expect(claudiaStill.parentSessionId).toBeNull();
      expect(claudiaStill.actorUserId).toBeNull();

      // 10. RETURN TO BROKER — no MFA, no password, no re-login.
      const stopRes = await stopImpersonation(req('/api/auth/impersonation/stop', { token: delegatedToken }));
      expect(stopRes.status).toBe(200);
      const stopped = await stopRes.json();
      expect(stopped.success).toBe(true);
      expect(stopped.restored.id).toBe(maya.id.toString());

      const restoredToken = cookieOf(stopRes)!;
      // A FRESH token — the pre-delegation one is rotated out, so nothing that
      // observed it can replay it.
      expect(restoredToken).toBeTruthy();
      expect(restoredToken).not.toBe(brokerTokenAtLogin);
      expect(restoredToken).not.toBe(delegatedToken);
      expect(await validateSession(brokerTokenAtLogin)).toBeNull();

      // 11. Original broker authority restored.
      const backAsMaya = await validateSession(restoredToken);
      expect(backAsMaya.userId).toBe(maya.id);
      expect(backAsMaya.role).toBe('BROKER');
      expect(backAsMaya.parentSessionId).toBeNull();
      expect(backAsMaya.actorUserId).toBeNull();

      // 12. ONLY the delegated session was destroyed.
      expect(await prisma.session.findUnique({ where: { token: delegatedToken } })).toBeNull();
      expect(await prisma.session.findUnique({ where: { id: brokerSession.sessionId } })).not.toBeNull();
      expect(await validateSession(claudiaOwn.token)).not.toBeNull();

      // 13. The stop event carries BOTH identities.
      const stopEvent = await prisma.auditEvent.findFirst({
        where: { action: 'impersonate_stop', user_id: claudia.id },
        orderBy: { created_at: 'desc' },
        select: { user_id: true, actor_user_id: true },
      });
      expect(stopEvent.user_id).toBe(claudia.id);
      expect(stopEvent.actor_user_id).toBe(maya.id);

      // 14. The START event is ordinary broker activity — actor == effective.
      const startEvent = await prisma.auditEvent.findFirst({
        where: { action: 'impersonate_start', user_id: maya.id },
        orderBy: { created_at: 'desc' },
        select: { user_id: true, actor_user_id: true },
      });
      expect(startEvent.user_id).toBe(maya.id);
      expect(startEvent.actor_user_id).toBeNull();
    });

    // ═══════════════════════════════════════════════════════════════════
    // NEGATIVES — each proven separately
    // ═══════════════════════════════════════════════════════════════════
    describe('negatives', () => {
      let brokerToken: string;
      let brokerSessionId: string;

      beforeEach(async () => {
        const s = await createSessionRecord('agent', maya.id, 'BROKER');
        brokerToken = s.token;
        brokerSessionId = s.sessionId;
      });

      const countSessions = () => prisma.session.count();

      it('a NON-BROKER cannot invoke delegation', async () => {
        const agentSession = await createSessionRecord('agent', claudia.id, 'SALESPERSON');
        const before = await countSessions();
        const res = await impersonate(
          req(`/api/crm/agents/${bruno.id}/impersonate`, { token: agentSession.token }),
          params(bruno.id),
        );
        expect(res.status).toBe(403);
        expect(await countSessions()).toBe(before);
      });

      it('an UNAUTHENTICATED caller cannot invoke delegation', async () => {
        const before = await countSessions();
        const res = await impersonate(
          req(`/api/crm/agents/${claudia.id}/impersonate`), params(claudia.id),
        );
        expect(res.status).toBe(401);
        expect(await countSessions()).toBe(before);
      });

      it('an INACTIVE target is rejected', async () => {
        const before = await countSessions();
        const res = await impersonate(
          req(`/api/crm/agents/${ines.id}/impersonate`, { token: brokerToken }), params(ines.id),
        );
        expect(res.status).toBe(404);
        expect(await countSessions()).toBe(before);
      });

      it('SELF-impersonation is rejected, with its own distinct error', async () => {
        const before = await countSessions();
        const res = await impersonate(
          req(`/api/crm/agents/${maya.id}/impersonate`, { token: brokerToken }), params(maya.id),
        );
        expect(res.status).toBe(400);
        expect((await res.json()).error).toMatch(/yourself/i);
        expect(await countSessions()).toBe(before);
      });

      it('a BROKER target is rejected — separately from self-impersonation', async () => {
        const before = await countSessions();
        const res = await impersonate(
          req(`/api/crm/agents/${dana.id}/impersonate`, { token: brokerToken }), params(dana.id),
        );
        expect(res.status).toBe(403);
        expect((await res.json()).error).toMatch(/broker account/i);
        expect((await res.json().catch(() => ({}))).error ?? '').not.toMatch(/yourself/i);
        expect(await countSessions()).toBe(before);
        // no delegated session anywhere carries BROKER role
        expect(await prisma.session.count({
          where: { parent_session_id: { not: null }, role: 'BROKER' },
        })).toBe(0);
      });

      it('a FORGED / nonexistent target is rejected without a 500', async () => {
        for (const bad of ['999999999', 'not-a-number', "1 OR 1=1", '']) {
          const before = await countSessions();
          const res = await impersonate(
            req(`/api/crm/agents/${bad}/impersonate`, { token: brokerToken }), params(bad),
          );
          expect(res.status).toBe(404);
          expect(await countSessions()).toBe(before);
        }
      });

      it('a DELEGATED session cannot start another delegation, and creates no row', async () => {
        const start = await impersonate(
          req(`/api/crm/agents/${claudia.id}/impersonate`, { token: brokerToken }), params(claudia.id),
        );
        const delegatedToken = cookieOf(start)!;
        const before = await countSessions();

        const chain = await impersonate(
          req(`/api/crm/agents/${bruno.id}/impersonate`, { token: delegatedToken }), params(bruno.id),
        );
        expect(chain.status).toBe(403);
        expect(await countSessions()).toBe(before);
        await prisma.session.delete({ where: { token: delegatedToken } });
      });

      it('an EXPIRED delegation is rejected and does NOT fall back to broker authority', async () => {
        const start = await impersonate(
          req(`/api/crm/agents/${claudia.id}/impersonate`, { token: brokerToken }), params(claudia.id),
        );
        const delegatedToken = cookieOf(start)!;
        await prisma.session.update({
          where: { token: delegatedToken },
          data: { expires_at: new Date(Date.now() - 1000) },
        });
        expect(await validateSession(delegatedToken)).toBeNull();
        // and the route it guards refuses, rather than acting as the broker
        const after = await impersonate(
          req(`/api/crm/agents/${bruno.id}/impersonate`, { token: delegatedToken }), params(bruno.id),
        );
        expect(after.status).toBe(401);
      });

      it('an expired PARENT immediately invalidates a still-unexpired child', async () => {
        const start = await impersonate(
          req(`/api/crm/agents/${claudia.id}/impersonate`, { token: brokerToken }), params(claudia.id),
        );
        const delegatedToken = cookieOf(start)!;
        await prisma.session.update({
          where: { id: brokerSessionId },
          data: { expires_at: new Date(Date.now() - 1000) },
        });
        const child = await prisma.session.findUnique({ where: { token: delegatedToken } });
        expect(child.expires_at.getTime()).toBeGreaterThan(Date.now()); // child NOT expired
        expect(await validateSession(delegatedToken)).toBeNull();        // yet refused
      });

      it('THE DELETION INVARIANT — deleting the parent cascades the child away in real Postgres', async () => {
        const claudiaOwn = await createSessionRecord('agent', claudia.id, 'SALESPERSON');
        const start = await impersonate(
          req(`/api/crm/agents/${claudia.id}/impersonate`, { token: brokerToken }), params(claudia.id),
        );
        const delegatedToken = cookieOf(start)!;
        expect(await prisma.session.findUnique({ where: { token: delegatedToken } })).not.toBeNull();

        await prisma.session.delete({ where: { id: brokerSessionId } });

        // The child is GONE — not orphaned, and above all NOT converted into an
        // ordinary agent session by a SET NULL.
        expect(await prisma.session.findUnique({ where: { token: delegatedToken } })).toBeNull();
        expect(await validateSession(delegatedToken)).toBeNull();
        // Claudia's own session is untouched by any of it.
        expect(await validateSession(claudiaOwn.token)).not.toBeNull();
      });

      it('the fixed ceiling is not extended by activity, in real Postgres', async () => {
        const start = await impersonate(
          req(`/api/crm/agents/${claudia.id}/impersonate`, { token: brokerToken }), params(claudia.id),
        );
        const delegatedToken = cookieOf(start)!;
        // move it deep inside the sliding-refresh window
        const pinned = new Date(Date.now() + 4 * 60 * 1000);
        await prisma.session.update({ where: { token: delegatedToken }, data: { expires_at: pinned } });
        const parentBefore = await prisma.session.findUnique({ where: { id: brokerSessionId } });

        for (let i = 0; i < 5; i++) expect(await validateSession(delegatedToken)).not.toBeNull();

        const after = await prisma.session.findUnique({ where: { token: delegatedToken } });
        expect(after.expires_at.toISOString()).toBe(pinned.toISOString());
        // checking the parent must not refresh the parent either
        const parentAfter = await prisma.session.findUnique({ where: { id: brokerSessionId } });
        expect(parentAfter.expires_at.toISOString()).toBe(parentBefore.expires_at.toISOString());
      });

      it('stop refuses a caller that is not delegated, and destroys nothing', async () => {
        const before = await countSessions();
        const res = await stopImpersonation(req('/api/auth/impersonation/stop', { token: brokerToken }));
        expect(res.status).toBe(400);
        expect(await countSessions()).toBe(before);
        expect(await validateSession(brokerToken)).not.toBeNull();
      });

      it('a child is clamped to a parent that expires sooner than the 2h cap', async () => {
        // 90 minutes: SHORTER than the 2h delegation cap, but LONGER than the
        // 1h sliding-refresh threshold. Anything inside that threshold would be
        // renewed to a full 24h by validateSession on the way in — correct
        // behaviour for an ordinary broker session, and it would mean this test
        // never exercised the clamp at all.
        await prisma.session.update({
          where: { id: brokerSessionId },
          data: { expires_at: new Date(Date.now() + 90 * 60 * 1000) },
        });
        const start = await impersonate(
          req(`/api/crm/agents/${claudia.id}/impersonate`, { token: brokerToken }), params(claudia.id),
        );
        const delegatedToken = cookieOf(start)!;
        const child = await prisma.session.findUnique({ where: { token: delegatedToken } });
        const parent = await prisma.session.findUnique({ where: { id: brokerSessionId } });
        expect(child.expires_at.toISOString()).toBe(parent.expires_at.toISOString());
        expect(child.expires_at.getTime()).toBeLessThan(Date.now() + 2 * 60 * 60 * 1000);
      });

      it('ordinary non-delegated activity still records actor_user_id = NULL', async () => {
        const s = await validateSession(brokerToken);
        await logAuditEvent('update', 'lead', '515151', s, { note: TAG });
        const row = await prisma.auditEvent.findFirst({
          where: { action: 'update', entity_type: 'lead', entity_id: '515151' },
          orderBy: { created_at: 'desc' },
          select: { user_id: true, actor_user_id: true },
        });
        expect(row.user_id).toBe(maya.id);
        expect(row.actor_user_id).toBeNull();
      });
    });
  });
}
