/// <reference types="jest" />
/**
 * Professional title vs application authorisation — a permanent separation.
 *
 *   license_type  "salesperson" | "associate_broker" | "broker"
 *                 the NY LICENCE CLASS the State issued
 *   title         the advertised designation, DERIVED from license_type alone
 *   role          "BROKER" | "AGENT"
 *                 the Mallan AUTHORISATION grant — what the CRM lets them DO
 *
 * ── What this file pins, and why it changed ───────────────────────────────
 * The retired design stored only "broker" | "salesperson" and INFERRED
 * Associate Broker from `broker` + role `AGENT`. That manufactured a NY licence
 * class out of a software permission — the same conflation defect, one field
 * over. `broker + AGENT` no longer means Associate Broker anywhere.
 *
 * The designation strings themselves come from ONE constant set
 * (PROFESSIONAL_DESIGNATIONS) so a NY DOS wording correction is a single edit.
 * The current wording follows 19 NYCRR §175.25, which names the class
 * "associate real estate broker" — hence "Licensed Associate Real Estate
 * Broker", not the reverse order this repo previously used. §175.25(c)(4) also
 * prohibits the bare title "broker", so none of these may be shortened.
 *
 * Lives in tests/runtime because that config is wired into the root jest
 * `projects` list — the only thing CI runs (pr-check.yml: `npx jest --ci`).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  professionalTitle,
  normaliseLicenseType,
  titleForLicenseClass,
  isPrincipalBrokerRole,
  LICENSE_CLASSES,
  PROFESSIONAL_DESIGNATIONS,
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

describe('the canonical designation strings (NY DOS 19 NYCRR 175.25)', () => {
  it('there are exactly three licence classes', () => {
    expect([...LICENSE_CLASSES]).toEqual(['salesperson', 'associate_broker', 'broker']);
  });

  it('uses the statutory word order: ASSOCIATE REAL ESTATE broker', () => {
    expect(ASSOCIATE_BROKER_TITLE).toBe('Licensed Associate Real Estate Broker');
    // the retired order must not be what we publish
    expect(ASSOCIATE_BROKER_TITLE).not.toBe('Licensed Real Estate Associate Broker');
  });

  it('never shortens a designation to a prohibited title', () => {
    // 175.25(c)(4) prohibits "sales associate", "licensed sales agent" and a
    // bare "broker".
    for (const v of Object.values(PROFESSIONAL_DESIGNATIONS)) {
      expect(v).toMatch(/^Licensed .*(Broker|Salesperson)$/);
      expect(v).not.toBe('Broker');
      expect(v.toLowerCase()).not.toContain('sales associate');
      expect(v.toLowerCase()).not.toContain('licensed sales agent');
    }
  });

  it('every class maps to a designation, and the map is the only source', () => {
    expect(titleForLicenseClass('salesperson')).toBe(SALESPERSON_TITLE);
    expect(titleForLicenseClass('associate_broker')).toBe(ASSOCIATE_BROKER_TITLE);
    expect(titleForLicenseClass('broker')).toBe(PRINCIPAL_BROKER_TITLE);
    expect(new Set(Object.values(PROFESSIONAL_DESIGNATIONS)).size).toBe(3);
  });
});

describe('THE CORRECTED CONTRACT — the licence class carries the fact', () => {
  it('Claudia stored as associate_broker + AGENT derives the Associate Broker designation', () => {
    // THE PROOF CASE. Before the correction `associate_broker` was not a
    // canonical value at all and this derived nothing; the associate
    // designation could only be produced by reading role AGENT.
    expect(professionalTitle({ license_type: 'associate_broker', role: 'AGENT' }))
      .toBe('Licensed Associate Real Estate Broker');
  });

  it('a principal broker stored as broker + BROKER still derives Licensed Real Estate Broker', () => {
    expect(professionalTitle({ license_type: 'broker', role: 'BROKER' }))
      .toBe('Licensed Real Estate Broker');
  });

  it('broker + AGENT no longer silently means Associate Broker', () => {
    // The retired inference. `role` is an authorisation grant and may not
    // manufacture a licence class, so a bare "broker" row is read as the
    // broker class whatever permission the row happens to carry.
    expect(professionalTitle({ license_type: 'broker', role: 'AGENT' }))
      .toBe(PRINCIPAL_BROKER_TITLE);
    expect(professionalTitle({ license_type: 'broker', role: 'AGENT' }))
      .not.toBe(ASSOCIATE_BROKER_TITLE);
  });

  it('the designation is identical whatever the authorisation grant says', () => {
    for (const role of ['BROKER', 'AGENT', null, undefined, '', 'nonsense']) {
      expect(professionalTitle({ license_type: 'associate_broker', role }))
        .toBe(ASSOCIATE_BROKER_TITLE);
      expect(professionalTitle({ license_type: 'salesperson', role })).toBe(SALESPERSON_TITLE);
      expect(professionalTitle({ license_type: 'broker', role })).toBe(PRINCIPAL_BROKER_TITLE);
    }
  });

  it('isPrincipalBrokerRole remains an AUTHORISATION predicate only', () => {
    expect(isPrincipalBrokerRole('BROKER')).toBe(true);
    expect(isPrincipalBrokerRole('broker')).toBe(true);
    expect(isPrincipalBrokerRole('AGENT')).toBe(false);
    expect(isPrincipalBrokerRole(null)).toBe(false);
    // and the title module must not call it — the derivation reads no role
    const src = readFileSync(resolve(ROOT, 'lib/agents/professional-title.ts'), 'utf8');
    const fn = src.slice(src.indexOf('export function professionalTitle'));
    expect(fn).not.toContain('isPrincipalBrokerRole');
    expect(fn).not.toContain('agent.role');
  });
});

describe('the four canonical Mallan identities', () => {
  it('Maya renders Licensed Real Estate Broker', () => {
    const maya = byId('maya-allan');
    expect(professionalTitle({ title: maya.title, license_type: 'broker', role: 'BROKER' }))
      .toBe('Licensed Real Estate Broker');
  });

  it('Claudia renders Licensed Associate Real Estate Broker — never Salesperson', () => {
    const c = byId('claudia-milkowski');
    const rendered = professionalTitle({ title: c.title, license_type: 'associate_broker', role: 'AGENT' });
    expect(rendered).toBe('Licensed Associate Real Estate Broker');
    expect(rendered).not.toContain('Salesperson');
  });

  it('Leda and Julia render Licensed Real Estate Salesperson', () => {
    for (const id of ['leda-gorgone', 'julia-djaafar']) {
      const a = byId(id);
      expect(professionalTitle({ title: a.title, license_type: 'salesperson', role: 'AGENT' }))
        .toBe('Licensed Real Estate Salesperson');
    }
  });
});

describe('the derived designation outranks stored free text', () => {
  it('a stale stored title cannot override a resolved licence class', () => {
    expect(professionalTitle({ title: ASSOCIATE_BROKER_TITLE, license_type: 'salesperson' }))
      .toBe(SALESPERSON_TITLE);
    expect(professionalTitle({ title: PRINCIPAL_BROKER_TITLE, license_type: 'associate_broker' }))
      .toBe(ASSOCIATE_BROKER_TITLE);
  });

  it('a CORPORATE title never becomes the advertised designation', () => {
    // DOS: an associate broker or salesperson using a corporate title is
    // misleading advertising. `Agent.title` is a stored column, so the derived
    // designation has to win on every advertising surface.
    for (const corporate of ['Vice President', 'Director of Sales', 'Managing Partner']) {
      expect(professionalTitle({ title: corporate, license_type: 'associate_broker' }))
        .toBe(ASSOCIATE_BROKER_TITLE);
      expect(professionalTitle({ title: corporate, license_type: 'salesperson' }))
        .toBe(SALESPERSON_TITLE);
    }
  });

  it('falls back to stored text ONLY when the licence class is unknown', () => {
    expect(professionalTitle({ title: 'Some Legacy Title', license_type: null, role: 'AGENT' }))
      .toBe('Some Legacy Title');
    expect(professionalTitle({ title: null, license_type: null, role: 'AGENT' })).toBe('');
  });

  it('a stored title that STATES a class is re-emitted in the canonical wording', () => {
    // so the retired word order is never republished from a legacy row
    expect(professionalTitle({ title: 'Licensed Real Estate Associate Broker', license_type: null }))
      .toBe('Licensed Associate Real Estate Broker');
  });

  it('asserts NOTHING when the agent cannot be resolved — never guesses Salesperson', () => {
    expect(professionalTitle(null)).toBe('');
    expect(professionalTitle(undefined)).toBe('');
    expect(professionalTitle({})).toBe('');
    expect(professionalTitle({ role: 'AGENT' })).toBe('');
    expect(professionalTitle({ title: '   ' })).toBe('');
  });
});

describe('legacy license_type values are tolerated on READ', () => {
  // The broken Add Agent path wrote the select's DISPLAY STRING into
  // license_type. Real rows carry "Licensed Associate Broker". Each of those
  // strings STATES a licence class, so reading it is evidence, not inference.
  it('the associate designation strings resolve to associate_broker, in BOTH word orders', () => {
    for (const legacy of [
      'Licensed Associate Broker',
      'Licensed Real Estate Associate Broker',
      'Licensed Associate Real Estate Broker',
      'Associate Real Estate Broker',
      'associate broker',
    ]) {
      expect(normaliseLicenseType(legacy)).toBe('associate_broker');
      expect(professionalTitle({ title: null, license_type: legacy, role: 'AGENT' }))
        .toBe(ASSOCIATE_BROKER_TITLE);
    }
  });

  it('the principal-broker and salesperson legacy strings resolve too', () => {
    expect(professionalTitle({ title: null, license_type: 'Licensed Broker', role: 'BROKER' }))
      .toBe(PRINCIPAL_BROKER_TITLE);
    expect(professionalTitle({ title: null, license_type: 'Licensed Real Estate Salesperson', role: 'AGENT' }))
      .toBe(SALESPERSON_TITLE);
  });

  it('an explicit legacy associate string is NOT overridden by the authorisation grant', () => {
    // The retired code let role BROKER promote this row to principal broker.
    expect(professionalTitle({ title: null, license_type: 'Licensed Associate Broker', role: 'BROKER' }))
      .toBe(ASSOCIATE_BROKER_TITLE);
  });

  it('a BARE legacy "broker" is NOT swept into associate_broker by role', () => {
    // Ambiguous historical data. It must be reconciled per record from
    // authoritative licence evidence, never by a rule reading a permission.
    expect(normaliseLicenseType('broker')).toBe('broker');
    expect(normaliseLicenseType('BROKER')).toBe('broker');
  });

  it('LEGACY AMBIGUITY GUARD: a bare "broker" row is not ESCALATED when its own title says associate', () => {
    // Reads a designation string (evidence about the licence), never `role`.
    expect(professionalTitle({
      title: 'Licensed Real Estate Associate Broker',
      license_type: 'broker',
      role: 'AGENT',
    })).toBe(ASSOCIATE_BROKER_TITLE);
    expect(professionalTitle({
      title: 'Licensed Real Estate Associate Broker',
      license_type: 'broker',
      role: 'BROKER',
    })).toBe(ASSOCIATE_BROKER_TITLE);
    // ...but a blank or free-form title leaves the bare class as the broker
    // class. This is the RESIDUAL RISK documented on professionalTitle().
    expect(professionalTitle({ title: 'Senior Broker', license_type: 'broker', role: 'AGENT' }))
      .toBe(PRINCIPAL_BROKER_TITLE);
  });

  it('tolerance is READ-only — the write boundary still refuses these values', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { rejectNonCanonicalLicenseType } = require('../../lib/agents/license-designation');
    for (const legacy of [
      'Licensed Associate Broker',
      'Licensed Real Estate Associate Broker',
      'Licensed Associate Real Estate Broker',
      'Licensed Broker',
      'Licensed Real Estate Broker',
      'Licensed Real Estate Salesperson',
    ]) {
      expect(rejectNonCanonicalLicenseType(legacy)).not.toBeNull();
    }
    // and the three canonical classes are accepted
    for (const good of ['salesperson', 'associate_broker', 'broker']) {
      expect(rejectNonCanonicalLicenseType(good)).toBeNull();
    }
  });

  it('genuine nonsense still resolves to nothing', () => {
    expect(professionalTitle({ title: null, license_type: 'garbage', role: 'AGENT' })).toBe('');
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
    for (const field of ['title: true', 'license_type: true', 'phone: true']) {
      expect(routeSrc).toContain(field);
    }
  });

  it('does NOT select the authorisation grant as an identity input', () => {
    const sel = routeSrc.slice(routeSrc.indexOf('senderRecord = await prisma.agent.findUnique'));
    expect(sel.slice(0, 400)).not.toContain('role: true');
  });

  it('keys the lookup on the CANONICAL SessionUser.userId (Codex P1 regression)', () => {
    // lib/auth/session.ts defines SessionUser as
    //   { userId: bigint; userType; role; sessionId }
    // with no `id`/`email`/name fields. Reading `sessionUser.id` compiled but
    // was always undefined in production, so the lookup missed and the entire
    // "From" block degraded.
    //
    // Asserted against CODE with comments stripped: the route deliberately
    // NAMES the removed `sessionUser.id` access in prose, and prose must not be
    // able to satisfy - or break - a code assertion. The HEAD version of this
    // check ran on the whole file and carried a stray control character inside
    // the regex literal, so it matched nothing and was vacuously green.
    expect(routeSrc).toContain('where: { id: sessionUser.userId }');
    const code = routeSrc
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    expect(code).not.toMatch(/sessionUser\.id(?!\w)/);
    expect(code).toMatch(/sessionUser\.userId/);
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
    expect(routeSrc).toMatch(/opts\.fromTitle\s*\?/);
  });

  it('logs loudly instead of silently substituting a guessed title', () => {
    expect(routeSrc).toContain('[agent-inquiry] could not resolve sender Agent record');
  });

  it('does NOT widen authorisation — the audit log still records role, not title', () => {
    expect(routeSrc).toContain("user_type: sessionUser.role === 'BROKER' ? 'broker' : 'agent'");
    expect(routeSrc).not.toContain("role: 'BROKER'");
    expect(routeSrc).not.toContain('role: "BROKER"');
  });
});
