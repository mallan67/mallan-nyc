/// <reference types="jest" />
/**
 * Claudia Milkowski — canonical Mallan agent identity.
 *
 * The Prisma `agents` table is the ONLY runtime identity authority — every
 * consumer (/agents, /agents/[name], /api/agents/public,
 * /api/agents/[slug]/listings, sitemap) reads it and does NOT fall back to Git.
 *
 * `data/agents.json` is never a public identity READ authority. It is used by
 * seed tooling and by one explicit broker-only admin profile import
 * (POST /api/crm/agents/sync-profiles), which is limited to non-regulated
 * fields. A new agent is therefore only fully canonical when the JSON record
 * and the prisma/seed.ts block agree.
 *
 * This test pins that agreement, and pins the one thing an "Associate Broker"
 * title must NOT do: escalate her CRM `role` to "BROKER".
 */
import { readFileSync } from 'fs';
import { existsSync } from 'fs';
import { resolve } from 'path';
import {
  normaliseLicenseType,
  PROFESSIONAL_DESIGNATIONS,
} from '../../lib/agents/professional-title';

const ROOT = resolve(__dirname, '../..');
const roster = JSON.parse(readFileSync(resolve(ROOT, 'data/agents.json'), 'utf8')) as {
  agents: Array<Record<string, unknown>>;
};
const seedSrc = readFileSync(resolve(ROOT, 'prisma/seed.ts'), 'utf8');
const profilePageSrc = readFileSync(resolve(ROOT, 'app/agents/[name]/page.tsx'), 'utf8');
const seedAgentsSrc = readFileSync(resolve(ROOT, 'scripts/seed-agents.ts'), 'utf8');

const SLUG = 'claudia-milkowski';
const claudia = roster.agents.find((a) => a.id === SLUG) as Record<string, any>;

describe('canonical roster record', () => {
  it('exists exactly once', () => {
    expect(roster.agents.filter((a) => a.id === SLUG)).toHaveLength(1);
    expect(claudia).toBeDefined();
  });

  it('carries the supplied identity verbatim', () => {
    expect(claudia.name).toBe('Claudia Milkowski');
    // Asserted through the ONE constant set, so a NY DOS wording correction is
    // a single edit there rather than a sweep through the tests.
    expect(claudia.title).toBe(PROFESSIONAL_DESIGNATIONS.associate_broker);
    expect(claudia.title).toBe('Licensed Associate Real Estate Broker');
    expect(normaliseLicenseType(String(claudia.title))).toBe('associate_broker');
    expect(claudia.email).toBe('cmilkowski@mallan.nyc');
    expect(claudia.phone).toBe('(646) 418-8388');
    expect(claudia.languages).toEqual(['English', 'Spanish']);
  });

  it('is never labelled a salesperson', () => {
    expect(String(claudia.title).toLowerCase()).not.toContain('salesperson');
  });

  it('is not featured — Maya remains the featured principal broker', () => {
    expect(claudia.featured).toBe(false);
    const featured = roster.agents.filter((a) => a.featured);
    expect(featured.map((a) => a.id)).toEqual(['maya-allan']);
  });

  it('uses the same field shape as the other agents', () => {
    const julia = roster.agents.find((a) => a.id === 'julia-djaafar')!;
    expect(Object.keys(claudia)).toEqual(Object.keys(julia));
  });

  it('carries the FULL supplied biography with its paragraphs intact', () => {
    const bio = String(claudia.bio);
    expect(bio.split('\n\n')).toHaveLength(10);
    expect(bio.startsWith('With nearly two decades of experience in NYC real estate')).toBe(true);
    expect(bio.endsWith('create an exceptional real estate experience.')).toBe(true);
    expect(bio.split(/\s+/).length).toBeGreaterThan(380);
    // The paragraph breaks only RENDER because the profile body is pre-line.
    expect(profilePageSrc).toContain('whitespace-pre-line');
  });

  it('carries no invented credentials', () => {
    const bio = String(claudia.bio).toLowerCase();
    for (const claim of ['award', 'graduate of', 'degree', 'certified', 'top producer', '$']) {
      expect(bio).not.toContain(claim);
    }
  });
});

describe('no duplicate identity', () => {
  it('slugs and emails are unique across the roster', () => {
    const ids = roster.agents.map((a) => a.id);
    const emails = roster.agents.map((a) => a.email);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(emails).size).toBe(emails.length);
  });

  it('the other three agents are untouched', () => {
    expect(roster.agents.map((a) => a.id)).toEqual([
      'maya-allan',
      'leda-gorgone',
      'julia-djaafar',
      SLUG,
    ]);
    const maya = roster.agents.find((a) => a.id === 'maya-allan')!;
    expect(maya.title).toBe(PROFESSIONAL_DESIGNATIONS.broker);
    expect(maya.featured).toBe(true);
  });
});

describe('routing', () => {
  it('the slug matches what AgentsGrid derives from the name for the team card href', () => {
    // app/components/AgentsGrid.tsx links team members by derived name, not id.
    expect(String(claudia.name).toLowerCase().replace(/\s+/g, '-')).toBe(SLUG);
  });

  it('the referenced headshot exists on disk', () => {
    expect(claudia.photo).toBe(`/images/agents/${SLUG}.jpg`);
    expect(existsSync(resolve(ROOT, 'public', String(claudia.photo).replace(/^\//, '')))).toBe(true);
  });
});

describe('prisma seed agrees with the roster record', () => {
  it('seeds the same slug, email, photo and title', () => {
    expect(seedSrc).toContain('public_slug: "claudia-milkowski"');
    expect(seedSrc).toContain('email: "cmilkowski@mallan.nyc"');
    expect(seedSrc).toContain('photo: "/images/agents/claudia-milkowski.jpg"');
    // The seed takes the designation from the ONE constant set - it must not
    // carry its own literal, or a wording correction would silently miss it.
    expect(seedSrc).toContain('title: PROFESSIONAL_DESIGNATIONS.associate_broker');
    expect(seedSrc).toContain("from \"../lib/agents/professional-title\"");
    expect(seedSrc).not.toContain('title: "Licensed Real Estate Associate Broker"');
    expect(seedSrc).toContain('license_no: "10301200574"');
  });

  it('seeds the identical biography', () => {
    // seed.ts escapes the curly punctuation the way the neighbouring
    // Leda/Julia blocks do, so decode the literal before comparing.
    const block = seedSrc.slice(seedSrc.indexOf('const claudia ='));
    const line = block.split('\n').find((l) => l.trim().startsWith('bio: \"'));
    expect(line).toBeDefined();
    expect(JSON.parse(line!.trim().slice(5, -1))).toBe(claudia.bio);
  });

  it('records the ASSOCIATE BROKER LICENCE CLASS in its own right', () => {
    const block = seedSrc.slice(seedSrc.indexOf('const claudia ='));
    const upsert = block.slice(0, block.indexOf('console.log'));
    // THE PROOF CASE. She is not "broker narrowed by an authorisation grant".
    expect(upsert).toContain('license_type: "associate_broker"');
    expect(upsert).not.toContain('license_type: "broker"');
  });

  it('records her BROKERAGE ROLE, and does not grant principal-broker authority', () => {
    const block = seedSrc.slice(seedSrc.indexOf('const claudia ='));
    const upsert = block.slice(0, block.indexOf('console.log'));
    // She IS an associate broker in the firm - the role names that, rather
    // than the retired "AGENT", which only meant "not the principal broker".
    expect(upsert).toContain('role: "ASSOCIATE_BROKER"');
    expect(upsert).not.toContain('role: "AGENT"');
    // and principal-broker authority still belongs to BROKER alone
    expect(upsert).not.toContain('role: "BROKER"');
  });

  it('seeds all four canonical identities with the right licence class', () => {
    const blockFor = (name: string) => {
      const b = seedSrc.slice(seedSrc.indexOf('const ' + name + ' ='));
      return b.slice(0, b.indexOf('console.log'));
    };
    expect(blockFor('maya')).toContain('license_type: "broker"');
    expect(blockFor('maya')).toContain('role: "BROKER"');
    expect(blockFor('leda')).toContain('license_type: "salesperson"');
    expect(blockFor('julia')).toContain('license_type: "salesperson"');
    expect(blockFor('leda')).toContain('role: "SALESPERSON"');
    expect(blockFor('julia')).toContain('role: "SALESPERSON"');
    // Leda and Julia must not shift, and Maya must remain principal.
    expect(blockFor('leda')).toContain('title: PROFESSIONAL_DESIGNATIONS.salesperson');
    expect(blockFor('julia')).toContain('title: PROFESSIONAL_DESIGNATIONS.salesperson');
    expect(blockFor('maya')).toContain('title: PROFESSIONAL_DESIGNATIONS.broker');
  });
});

describe('seed-agents.ts licence-class derivation', () => {
  it('no longer string-sniffs the title for the substring "broker"', () => {
    // Regression guard: the old rules were
    //   role: agent.title.toLowerCase().includes('broker') ? 'BROKER' : 'AGENT'
    //   license_type: isLicensedBroker ? 'broker' : 'salesperson'
    // The first computed a role from a title; the second collapsed an
    // Associate Broker into the principal-broker licence class.
    expect(seedAgentsSrc).not.toContain("includes('broker') ? 'BROKER'");
    expect(seedAgentsSrc).not.toContain("isLicensedBroker ? 'broker' : 'salesperson'");
    expect(seedAgentsSrc).not.toContain("titleLc.includes('associate')");
    // the LICENCE CLASS goes through the one authority
    expect(seedAgentsSrc).toContain("normaliseLicenseType(agent.title)");
    expect(seedAgentsSrc).toContain("titleForLicenseClass(licenceClass)");
  });

  it('READS the brokerage role from the roster instead of computing it', () => {
    // Correlation is not derivation: the role is recorded on the roster and
    // validated, never inferred from the licence class beside it.
    expect(seedAgentsSrc).toContain('isCanonicalBrokerageRole(brokerageRole)');
    expect(seedAgentsSrc).not.toContain("isPrincipalBroker ? 'BROKER' : 'AGENT'");
    expect(seedAgentsSrc).not.toMatch(/role:\s*licenceClass/);
  });

  it('the roster records BOTH facts for every agent, independently', () => {
    const EXPECTED: Record<string, { license: string; role: string }> = {
      'maya-allan':        { license: 'broker',           role: 'BROKER' },
      'claudia-milkowski': { license: 'associate_broker', role: 'ASSOCIATE_BROKER' },
      'leda-gorgone':      { license: 'salesperson',      role: 'SALESPERSON' },
      'julia-djaafar':     { license: 'salesperson',      role: 'SALESPERSON' },
    };
    for (const a of roster.agents) {
      const want = EXPECTED[String(a.id)];
      expect(want).toBeDefined();
      // the licence class is evidenced by the recorded designation...
      expect(normaliseLicenseType(String(a.title))).toBe(want.license);
      // ...and the brokerage role is its own recorded value
      expect(a.role).toBe(want.role);
    }
  });

  it('the one authority classifies every roster title correctly', () => {
    expect(normaliseLicenseType('Licensed Real Estate Broker')).toBe('broker');
    expect(normaliseLicenseType('Licensed Associate Real Estate Broker')).toBe('associate_broker');
    // retired word order still readable, for rows already stored
    expect(normaliseLicenseType('Licensed Real Estate Associate Broker')).toBe('associate_broker');
    expect(normaliseLicenseType('Licensed Real Estate Salesperson')).toBe('salesperson');
  });

  it('every roster title resolves to a licence class - none falls through', () => {
    for (const a of roster.agents) {
      expect(normaliseLicenseType(String(a.title))).not.toBe('');
    }
  });
});

describe('agent profile canonical URL', () => {
  it('canonicalises to the agent slug, never the site root', () => {
    // app/layout.tsx sets `canonical: BASE_URL`; without a per-page override
    // every agent profile told Google it was the homepage.
    expect(profilePageSrc).toContain('alternates: { canonical: `https://mallan.nyc/agents/${agent.id}` }');
  });

  it('is dynamic, so the rule covers every agent, not just Claudia', () => {
    expect(profilePageSrc).not.toContain('canonical: `https://mallan.nyc/agents/claudia-milkowski`');
    expect(profilePageSrc).toContain('${agent.id}');
  });
});

describe('Julia Djaafar languages', () => {
  const julia = roster.agents.find((a) => a.id === 'julia-djaafar') as Record<string, any>;

  it('is English, Japanese, Indonesian in that order', () => {
    expect(julia.languages).toEqual(['English', 'Japanese', 'Indonesian']);
  });

  it('is seeded identically', () => {
    const block = seedSrc.slice(seedSrc.indexOf('const julia ='));
    const upsert = block.slice(0, block.indexOf('console.log'));
    expect(upsert).toContain('languages: ["English", "Japanese", "Indonesian"]');
    expect(upsert).not.toContain('languages: ["English", "Japanese"]');
  });

  it('leaves every other roster language list alone', () => {
    const langs = Object.fromEntries(roster.agents.map((a) => [a.id, a.languages]));
    expect(langs['maya-allan']).toEqual(['English', 'Hebrew', 'Georgian']);
    expect(langs['leda-gorgone']).toEqual(['English', 'Portuguese']);
    expect(langs['claudia-milkowski']).toEqual(['English', 'Spanish']);
  });
});

describe('languages are visually distinguishable from specialties on the public profile', () => {
  // They rendered as one more identical chip, so
  //   Co-op Board Approvals · Negotiation · ... · English · Spanish
  // read as a single undifferentiated list and the languages looked missing.
  it('carries its own labelled block, not another specialty pill', () => {
    const block = profilePageSrc.slice(
      profilePageSrc.indexOf('{/* Specialties */}'),
      profilePageSrc.indexOf('{/* Section Navigation */}'),
    );
    expect(block).toContain('Languages');
    // the specialty chip class must not be what renders the languages
    const langBlock = block.slice(block.indexOf('agent.languages.length'));
    expect(langBlock).not.toContain('rounded-full');
  });

  it('renders for ANY agent with at least one language, not just multilingual ones', () => {
    // was `agent.languages.length > 1`, so a single language showed nothing
    expect(profilePageSrc).toContain('agent.languages.length > 0');
    expect(profilePageSrc).not.toContain('agent.languages.length > 1');
  });

  it('is generic - no agent is named in the languages markup', () => {
    const block = profilePageSrc.slice(
      profilePageSrc.indexOf('{/* Specialties */}'),
      profilePageSrc.indexOf('{/* Section Navigation */}'),
    );
    for (const a of roster.agents) {
      expect(block).not.toContain(String(a.name));
      for (const l of (a.languages as string[])) expect(block).not.toContain('"' + l + '"');
    }
  });
});
