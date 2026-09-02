/// <reference types="jest" />
/**
 * Professional title vs application authorisation — a permanent separation.
 *
 *   license_type  "broker" | "salesperson"   the NY licence a person holds
 *   title         free text                  what we ADVERTISE them as
 *   role          "BROKER" | "AGENT"         what the CRM lets them DO
 *
 * `role: "BROKER"` unlocks the admin surfaces (audit log, every agent's leads,
 * automation, campaigns, /admin login) and belongs to the principal broker
 * alone. A NY *Associate* Broker holds a broker licence but is correctly
 * role "AGENT".
 *
 * app/api/crm/agent-inquiry/route.ts used to derive the outbound title from
 * `role`, so every non-principal-broker was advertised to outside brokers as a
 * "Licensed Real Estate Salesperson". For an Associate Broker that is a false
 * statement about a licensee in brokerage correspondence (NY DOS 19 NYCRR
 * 175.25). This pins the fix in both directions: the title must be correct AND
 * the authorisation must NOT be widened to achieve it.
 *
 * Lives in tests/runtime because that config is wired into the root jest
 * `projects` list — the only thing CI runs (pr-check.yml: `npx jest --ci`).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  professionalTitle,
  isPrincipalBrokerRole,
  PRINCIPAL_BROKER_TITLE,
  ASSOCIATE_BROKER_TITLE,
  SALESPERSON_TITLE,
} from '../../lib/agents/professional-title';

const ROOT = resolve(__dirname, '../..');
const roster = JSON.parse(readFileSync(resolve(ROOT, 'data/agents.json'), 'utf8')) as {
  agents: Array<{ id: string; name: string; title: string }>;
};
const routeSrc = readFileSync(
  resolve(ROOT, 'app/api/crm/agent-inquiry/route.ts'),
  'utf8',
);

const byId = (id: string) => roster.agents.find((a) => a.id === id)!;

describe('the three required renderings (brief §5)', () => {
  it('Maya renders Licensed Real Estate Broker', () => {
    const maya = byId('maya-allan');
    expect(professionalTitle({ title: maya.title, license_type: 'broker', role: 'BROKER' }))
      .toBe('Licensed Real Estate Broker');
  });

  it('a salesperson agent renders Licensed Real Estate Salesperson', () => {
    for (const id of ['leda-gorgone', 'julia-djaafar']) {
      const a = byId(id);
      expect(professionalTitle({ title: a.title, license_type: 'salesperson', role: 'AGENT' }))
        .toBe('Licensed Real Estate Salesperson');
    }
  });

  it('Claudia renders Licensed Real Estate Associate Broker — never Salesperson', () => {
    const c = byId('claudia-milkowski');
    const rendered = professionalTitle({ title: c.title, license_type: 'broker', role: 'AGENT' });
    expect(rendered).toBe('Licensed Real Estate Associate Broker');
    expect(rendered).not.toContain('Salesperson');
  });
});

describe('licence is not authorisation', () => {
  it('a broker LICENCE with an AGENT role is an Associate Broker, not a Salesperson', () => {
    // No stored title — this is the fallback path for pre-existing records.
    expect(professionalTitle({ license_type: 'broker', role: 'AGENT' }))
      .toBe(ASSOCIATE_BROKER_TITLE);
  });

  it('only the BROKER role yields the principal-broker title', () => {
    expect(professionalTitle({ license_type: 'broker', role: 'BROKER' })).toBe(PRINCIPAL_BROKER_TITLE);
    expect(isPrincipalBrokerRole('BROKER')).toBe(true);
    expect(isPrincipalBrokerRole('broker')).toBe(true);
    expect(isPrincipalBrokerRole('AGENT')).toBe(false);
    expect(isPrincipalBrokerRole(null)).toBe(false);
  });

  it('a salesperson licence is a Salesperson regardless of stored role', () => {
    expect(professionalTitle({ license_type: 'salesperson', role: 'AGENT' })).toBe(SALESPERSON_TITLE);
  });

  it('the DERIVED designation outranks stale stored text', () => {
    // Inverted deliberately. The writers derive title from licence + role, so a
    // stale or free-form stored value must not override the regulated
    // designation here - this function is what addresses outside brokers in
    // agent-inquiry email, where a wrong designation is a false statement
    // about a licensee (NY DOS 19 NYCRR 175.25).
    expect(professionalTitle({ title: 'Licensed Real Estate Associate Broker', license_type: 'salesperson', role: 'AGENT' }))
      .toBe('Licensed Real Estate Salesperson');
    expect(professionalTitle({ title: 'Senior Broker', license_type: 'broker', role: 'AGENT' }))
      .toBe('Licensed Real Estate Associate Broker');
  });

  it('falls back to stored text ONLY when the licence class is unknown', () => {
    // a legacy record with a title but no licence still says something
    expect(professionalTitle({ title: 'Licensed Real Estate Associate Broker', license_type: null, role: 'AGENT' }))
      .toBe('Licensed Real Estate Associate Broker');
    expect(professionalTitle({ title: null, license_type: null, role: 'AGENT' })).toBe('');
  });

  it('asserts NOTHING when the agent cannot be resolved — never guesses Salesperson', () => {
    expect(professionalTitle(null)).toBe('');
    expect(professionalTitle(undefined)).toBe('');
    expect(professionalTitle({})).toBe('');
    expect(professionalTitle({ role: 'AGENT' })).toBe('');
    expect(professionalTitle({ title: '   ' })).toBe('');
  });
});

describe('agent-inquiry route wiring', () => {
  it('no longer derives the outbound title from the authorisation role', () => {
    expect(routeSrc).not.toContain(
      "sessionUser.role === 'BROKER' ? 'Licensed Real Estate Broker' : 'Licensed Real Estate Salesperson'",
    );
  });

  it('resolves the sender against the canonical Agent record', () => {
    expect(routeSrc).toContain("import { professionalTitle } from '@/lib/agents/professional-title'");
    expect(routeSrc).toContain('const fromTitle = professionalTitle(senderRecord)');
    expect(routeSrc).toContain('prisma.agent.findUnique');
    for (const field of ['title: true', 'license_type: true', 'role: true', 'phone: true']) {
      expect(routeSrc).toContain(field);
    }
  });

  it('keys the lookup on the CANONICAL SessionUser.userId (Codex P1 regression)', () => {
    // lib/auth/session.ts defines SessionUser as
    //   { userId: bigint; userType; role; sessionId }
    // with no `id`/`email`/name fields. Reading `sessionUser.id` compiled but
    // was always undefined in production, so the lookup missed and the entire
    // "From" block degraded. The test mock had invented the wrong shape, which
    // is why CI did not catch it.
    expect(routeSrc).toContain('where: { id: sessionUser.userId }');
    expect(routeSrc).not.toMatch(/sessionUser\.id(?!\w)/);
    // and no fabricated secondary key to paper over a missing id
    expect(routeSrc).not.toContain("sessionUser.email ?? ''");
    expect(routeSrc).not.toContain('{ email: sessionUser.email');
  });

  it('audits the sender by userId, so WHO sent it is never null', () => {
    expect(routeSrc).toContain('user_id: sessionUser.userId');
  });

  it('the session type is imported, so future drift is a compile error', () => {
    expect(routeSrc).toContain('type SessionUser');
    expect(routeSrc).toContain('const sessionUser: SessionUser = auth');
  });

  it('omits the title line rather than printing an empty one', () => {
    // Whitespace and line-ending agnostic: this source is checked out CRLF
    // on Windows, so an exact-newline substring match is not portable.
    expect(routeSrc).toMatch(/opts\.fromTitle\s*\?/);
  });

  it('logs loudly instead of silently substituting a guessed title', () => {
    expect(routeSrc).toContain('[agent-inquiry] could not resolve sender Agent record');
  });

  it('does NOT widen authorisation — the audit log still records role, not title', () => {
    // user_type is an AUTHORISATION fact; it must stay role-derived.
    expect(routeSrc).toContain("user_type: sessionUser.role === 'BROKER' ? 'broker' : 'agent'");
    // and the route must not start granting BROKER anywhere.
    expect(routeSrc).not.toContain("role: 'BROKER'");
    expect(routeSrc).not.toContain('role: "BROKER"');
  });
});
