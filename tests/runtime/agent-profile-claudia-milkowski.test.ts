/// <reference types="jest" />
/**
 * Claudia Milkowski — canonical Mallan agent identity.
 *
 * Mallan agent profiles are two-tier: the Prisma `agents` table is canonical at
 * runtime (every consumer — /agents, /agents/[name], /api/agents/public,
 * /api/agents/[slug]/listings, sitemap — reads the DB first) and
 * `data/agents.json` is BOTH the static fallback those consumers degrade to and
 * the seed source for scripts/seed-agents.ts. A new agent is therefore only
 * fully canonical when the JSON record and the prisma/seed.ts block agree.
 *
 * This test pins that agreement, and pins the one thing an "Associate Broker"
 * title must NOT do: escalate her CRM `role` to "BROKER".
 */
import { readFileSync } from 'fs';
import { existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../..');
const roster = JSON.parse(readFileSync(resolve(ROOT, 'data/agents.json'), 'utf8')) as {
  agents: Array<Record<string, unknown>>;
};
const seedSrc = readFileSync(resolve(ROOT, 'prisma/seed.ts'), 'utf8');
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
    expect(claudia.title).toBe('Associate Real Estate Broker');
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

  it('renders the biography as one flowing paragraph, like the other team members', () => {
    // Maya (featured) is the only multi-paragraph bio; team members are single.
    for (const id of ['leda-gorgone', 'julia-djaafar', SLUG]) {
      const a = roster.agents.find((x) => x.id === id)!;
      expect(String(a.bio)).not.toContain('\n');
    }
    expect(String(claudia.bio).length).toBeGreaterThan(400);
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
    expect(maya.title).toBe('Licensed Real Estate Broker');
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
    expect(seedSrc).toContain('title: "Associate Real Estate Broker"');
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

  it('records the Associate Broker LICENCE without granting the BROKER CRM ROLE', () => {
    const block = seedSrc.slice(seedSrc.indexOf('const claudia ='));
    const upsert = block.slice(0, block.indexOf('console.log'));
    expect(upsert).toContain('license_type: "broker"');
    expect(upsert).toContain('role: "AGENT"');
    expect(upsert).not.toContain('role: "BROKER"');
  });
});

describe('seed-agents.ts role derivation', () => {
  it('no longer derives the BROKER admin role from any title containing "broker"', () => {
    // Regression guard: the old rule was
    //   role: agent.title.toLowerCase().includes('broker') ? 'BROKER' : 'AGENT'
    // which would have given an Associate Broker full CRM admin.
    expect(seedAgentsSrc).not.toContain("includes('broker') ? 'BROKER'");
    expect(seedAgentsSrc).toContain("!titleLc.includes('associate')");
    expect(seedAgentsSrc).toContain("role: isPrincipalBroker ? 'BROKER' : 'AGENT'");
  });

  it('the guard classifies every roster title correctly', () => {
    const classify = (title: string) => {
      const t = title.toLowerCase();
      const licensed = t.includes('broker');
      return {
        license_type: licensed ? 'broker' : 'salesperson',
        role: licensed && !t.includes('associate') ? 'BROKER' : 'AGENT',
      };
    };
    expect(classify('Licensed Real Estate Broker')).toEqual({ license_type: 'broker', role: 'BROKER' });
    expect(classify('Associate Real Estate Broker')).toEqual({ license_type: 'broker', role: 'AGENT' });
    expect(classify('Licensed Real Estate Salesperson')).toEqual({ license_type: 'salesperson', role: 'AGENT' });
  });
});
