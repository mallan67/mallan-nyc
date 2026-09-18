/// <reference types="jest" />
/**
 * DB SAFETY PACKET 1 — THE NEUTRAL DATABASE-TARGET CORE.
 *
 * WHAT THIS IS FOR. Every database guard in this repository answers one question — "is the target
 * the canonical production host?" — and answers it as a BOOLEAN. That shape has two defects the
 * Development→production finding exposed:
 *
 *   1. It makes "not canonical production" indistinguishable from "safe". An unknown host, a typo,
 *      a stale database, or an unrelated Postgres instance all fall into the same false bucket.
 *   2. It cannot express an APPROVED NON-PRODUCTION authority, so there is nowhere for a legitimate
 *      Development or Preview target to live.
 *
 * So the core classifies FOUR WAYS and refuses `unknown`. Refusing the unknown is the whole point:
 * a guard that treats an unrecognised target as acceptable is worse than no guard, because it reads
 * as coverage.
 *
 * THERE IS NO APPROVED NON-PRODUCTION TARGET YET, AND NONE IS INVENTED HERE. No verified Mallan
 * Development or Preview Neon authority exists at this commit, so the registry ships EMPTY and
 * nothing can classify as `approved-nonproduction`. The concept is supported and proven reachable;
 * only the policy is unfilled. Hardcoding a placeholder target to make a test green would encode a
 * fiction as authority — the same mistake as populating a membership set to make a fallback "work".
 *
 * PARSED HOSTNAME, NOT SUBSTRING. The repo contains two host checks of different rigour:
 * lib/ops/canonical-neon-target.ts uses `uriOrHost.includes(CANONICAL_HOST)`, while
 * lib/retention/drain-core.ts parses `new URL(url).hostname` and compares the endpoint by equality.
 * The substring form accepts a hostile host that merely MENTIONS the canonical endpoint somewhere
 * in the URL. This core extracts the parsed form, and the smuggling case below pins that choice.
 *
 * PURE AND SYNCHRONOUS. No request, no OIDC, no network, no HTTP status. The core returns a typed
 * verdict and a reason; deciding whether a refusal becomes a 503, an error boundary or a CLI exit
 * belongs to the adapters, which this packet does not build.
 */
import {
  classifyDbHost,
  classifyDbUrl,
  enumerateDbUrls,
  reconcileDbTargets,
  APPROVED_NONPRODUCTION_ENDPOINTS,
  CANONICAL_PRODUCTION_ENDPOINT,
  FORBIDDEN_STALE_ENDPOINT,
} from '@/lib/ops/db-target';

// Realistic shapes. Credentials are fake throughout; no connection is ever attempted.
const CANON_POOLED =
  'postgresql://u:p@ep-cold-waterfall-adno3ao2-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';
const CANON_DIRECT =
  'postgresql://u:p@ep-cold-waterfall-adno3ao2.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';
const STALE =
  'postgresql://u:p@ep-royal-dawn-ad6eh8t2.us-east-1.aws.neon.tech/neondb?sslmode=require';
const OTHER_NEON =
  'postgresql://u:p@ep-some-other-branch-99887766.us-east-1.aws.neon.tech/neondb';
const ARBITRARY_PG = 'postgresql://u:p@db.example.com:5432/app';
const MALFORMED = 'not a url at all';
/** A hostile host that merely MENTIONS the canonical endpoint. A substring check would pass this. */
const SMUGGLED =
  'postgresql://u:p@evil.example.com:5432/db?note=ep-cold-waterfall-adno3ao2.neon.tech';

// ═════════════════════════════════════════════════════════════════════════════
// A — single-URL classification, four ways
// ═════════════════════════════════════════════════════════════════════════════
describe('A · classifyDbUrl returns one of four classes', () => {
  it('the canonical pooled production endpoint is canonical-production', () => {
    expect(classifyDbUrl(CANON_POOLED).class).toBe('canonical-production');
  });

  it('the canonical direct (unpooled) endpoint is also canonical-production', () => {
    // -pooler and the bare endpoint are the same authority; only the connection mode differs.
    expect(classifyDbUrl(CANON_DIRECT).class).toBe('canonical-production');
  });

  it('the known stale endpoint is forbidden-stale, not merely unknown', () => {
    // morning-bread / royal-dawn is DO-NOT-SERVE. It must be named, so a caller can say WHY.
    expect(classifyDbUrl(STALE).class).toBe('forbidden-stale');
  });

  it('an arbitrary Postgres host is unknown — NOT approved-nonproduction', () => {
    expect(classifyDbUrl(ARBITRARY_PG).class).toBe('unknown');
  });

  it('an unrecognised Neon endpoint is unknown too — being Neon proves nothing', () => {
    expect(classifyDbUrl(OTHER_NEON).class).toBe('unknown');
  });

  it('a malformed URL is unknown and says so', () => {
    const r = classifyDbUrl(MALFORMED);
    expect(r.class).toBe('unknown');
    expect(r.reason).toMatch(/malformed|unparse/i);
  });

  it('an empty or absent URL is unknown', () => {
    expect(classifyDbUrl('').class).toBe('unknown');
    expect(classifyDbUrl(undefined).class).toBe('unknown');
  });

  it('a host that merely MENTIONS the canonical endpoint is NOT canonical', () => {
    // The pin on parsed-hostname comparison. A substring check accepts this; equality does not.
    expect(classifyDbUrl(SMUGGLED).class).toBe('unknown');
  });

  it('never returns the URL or credentials in the reason', () => {
    for (const url of [CANON_POOLED, STALE, ARBITRARY_PG, SMUGGLED]) {
      const r = classifyDbUrl(url);
      expect(r.reason).not.toContain('u:p');
      expect(r.reason).not.toContain(url);
    }
  });

  it('the POOLED form of the stale endpoint is also named forbidden-stale', () => {
    // drain-core compared the endpoint to the stale id exactly, so `...-pooler` fell through to the
    // generic "not canonical" branch. Both refuse, so this was never an exposure — but the operator
    // was told the wrong reason, and the reason is what they act on.
    const pooledStale =
      'postgresql://u:p@ep-royal-dawn-ad6eh8t2-pooler.us-east-1.aws.neon.tech/neondb';
    expect(classifyDbHost('ep-royal-dawn-ad6eh8t2-pooler.us-east-1.aws.neon.tech').class).toBe(
      'forbidden-stale',
    );
    expect(classifyDbUrl(pooledStale).class).toBe('forbidden-stale');
  });

  it('the canonical endpoint id on a NON-Neon domain is unknown, not canonical', () => {
    // Equality on the endpoint label alone is not enough: anyone can name a host's first label
    // `ep-cold-waterfall-adno3ao2`. The `.neon.tech` suffix is part of the identity.
    const lookalike = 'postgresql://u:p@ep-cold-waterfall-adno3ao2.attacker.example/neondb';
    expect(classifyDbUrl(lookalike).class).toBe('unknown');
  });

  it('reports the endpoint label without credentials, for a legible refusal', () => {
    expect(classifyDbUrl(CANON_POOLED).endpoint).toBe('ep-cold-waterfall-adno3ao2-pooler');
    expect(classifyDbUrl(STALE).endpoint).toBe('ep-royal-dawn-ad6eh8t2');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A2 — the reason code separates "undeterminable" from "determined and wrong"
// ═════════════════════════════════════════════════════════════════════════════
describe('A2 · the reason code is a stable token, not prose', () => {
  it('names each distinct refusal', () => {
    expect(classifyDbUrl(CANON_POOLED).code).toBe('canonical-production');
    expect(classifyDbUrl(STALE).code).toBe('forbidden-stale');
    expect(classifyDbUrl(ARBITRARY_PG).code).toBe('unrecognised-endpoint');
    expect(classifyDbUrl(MALFORMED).code).toBe('malformed-url');
    expect(classifyDbUrl('').code).toBe('not-configured');
    expect(
      classifyDbUrl('postgresql://u:p@ep-cold-waterfall-adno3ao2.attacker.example/db').code,
    ).toBe('endpoint-off-neon');
  });

  it('separates UNDETERMINABLE from DETERMINED-AND-WRONG, though both refuse', () => {
    // This is the distinction the whole packet turns on: "I could not tell what the target is"
    // is a different operator problem from "I can tell, and it is the wrong database". Collapsing
    // them into one boolean false is what made `!isCanonical(url)` read as "safe".
    const undeterminable = ['not-configured', 'malformed-url', 'no-host'];
    expect(undeterminable).toContain(classifyDbUrl(MALFORMED).code);
    expect(undeterminable).toContain(classifyDbUrl(undefined).code);
    expect(undeterminable).not.toContain(classifyDbUrl(STALE).code);
    expect(undeterminable).not.toContain(classifyDbUrl(ARBITRARY_PG).code);
  });

  it('a URL that parses but carries no host is no-host, not malformed', () => {
    const hostless = classifyDbUrl('postgresql:///neondb');
    expect(hostless.code).toBe('no-host');
    expect(hostless.class).toBe('unknown');
  });

  it('reports the full parsed hostname — a hostname is not a credential', () => {
    expect(classifyDbUrl(CANON_POOLED).host).toBe(
      'ep-cold-waterfall-adno3ao2-pooler.c-2.us-east-1.aws.neon.tech',
    );
    expect(classifyDbUrl(MALFORMED).host).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B — the approved non-production registry is deliberately empty
// ═════════════════════════════════════════════════════════════════════════════
describe('B · no approved non-production authority is invented', () => {
  it('ships an EMPTY approved-nonproduction registry', () => {
    // Not an oversight. No verified Mallan Development/Preview Neon authority exists at this
    // commit, and inventing one to satisfy a test would encode a fiction as authority.
    expect(APPROVED_NONPRODUCTION_ENDPOINTS).toEqual([]);
  });

  it('so nothing in the world currently classifies as approved-nonproduction', () => {
    for (const url of [CANON_POOLED, CANON_DIRECT, STALE, OTHER_NEON, ARBITRARY_PG, SMUGGLED]) {
      expect(classifyDbUrl(url).class).not.toBe('approved-nonproduction');
    }
  });

  it('the canonical and forbidden endpoints are the documented ones', () => {
    expect(CANONICAL_PRODUCTION_ENDPOINT).toBe('ep-cold-waterfall-adno3ao2');
    expect(FORBIDDEN_STALE_ENDPOINT).toBe('ep-royal-dawn-ad6eh8t2');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C — enumeration: every URL this process could connect through
// ═════════════════════════════════════════════════════════════════════════════
describe('C · enumerateDbUrls finds every configured target', () => {
  it('returns both bare names when both are set', () => {
    const got = enumerateDbUrls({ DATABASE_URL: CANON_POOLED, DATABASE_URL_UNPOOLED: CANON_DIRECT });
    expect(got.map((e) => e.name)).toEqual(['DATABASE_URL', 'DATABASE_URL_UNPOOLED']);
  });

  it('omits empty and absent values rather than reporting them as targets', () => {
    expect(enumerateDbUrls({ DATABASE_URL: CANON_POOLED, DATABASE_URL_UNPOOLED: '' })).toHaveLength(1);
    expect(enumerateDbUrls({})).toHaveLength(0);
  });

  it('never reads the Marketplace-prefixed family', () => {
    // Prisma reads the bare names only. Enumerating the prefixed ones here would be the first step
    // toward the silent mapping that keeps Preview fail-closed today.
    const got = enumerateDbUrls({
      database_DATABASE_URL: CANON_POOLED,
      database_DATABASE_URL_UNPOOLED: CANON_DIRECT,
    } as Record<string, string>);
    expect(got).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// D — reconciliation: mixed authority is refused, not resolved by preference
// ═════════════════════════════════════════════════════════════════════════════
describe('D · reconcileDbTargets refuses a mixed pair', () => {
  it('both canonical → consistent, authority canonical-production', () => {
    const r = reconcileDbTargets({ DATABASE_URL: CANON_POOLED, DATABASE_URL_UNPOOLED: CANON_DIRECT });
    expect(r.verdict).toBe('consistent');
    expect((r as { authority: string }).authority).toBe('canonical-production');
  });

  it('canonical pooled + STALE unpooled → mixed, refused', () => {
    // The recorded near-miss: a guard passed on the unpooled URL while every Prisma read went to
    // the stale database. Preference is never the answer here; disagreement is the answer.
    const r = reconcileDbTargets({ DATABASE_URL: CANON_POOLED, DATABASE_URL_UNPOOLED: STALE });
    expect(r.verdict).toBe('mixed');
    expect(r.reason).toMatch(/DATABASE_URL_UNPOOLED/);
  });

  it('canonical pooled + arbitrary unpooled → mixed, refused', () => {
    expect(reconcileDbTargets({ DATABASE_URL: CANON_POOLED, DATABASE_URL_UNPOOLED: ARBITRARY_PG }).verdict).toBe('mixed');
  });

  it('a single stale URL → consistent authority forbidden-stale (consistent is not permission)', () => {
    // "Consistent" describes agreement between variables, never entitlement. A caller still has to
    // check WHICH authority it agreed on — which is why the authority is returned, not a boolean.
    const r = reconcileDbTargets({ DATABASE_URL: STALE });
    expect(r.verdict).toBe('consistent');
    expect((r as { authority: string }).authority).toBe('forbidden-stale');
  });

  it('zero configured URLs → undetermined, never an implicit pass', () => {
    const r = reconcileDbTargets({});
    expect(r.verdict).toBe('undetermined');
    expect(r.reason).toMatch(/no .*DATABASE_URL|undetermin/i);
  });

  it('duplicate identical URLs do not create false disagreement', () => {
    const r = reconcileDbTargets({ DATABASE_URL: CANON_POOLED, DATABASE_URL_UNPOOLED: CANON_POOLED });
    expect(r.verdict).toBe('consistent');
  });

  it('pooled and direct forms of the SAME endpoint are not a disagreement', () => {
    // This is the case a naive string comparison gets wrong: the hostnames differ by "-pooler".
    const r = reconcileDbTargets({ DATABASE_URL: CANON_POOLED, DATABASE_URL_UNPOOLED: CANON_DIRECT });
    expect(r.verdict).toBe('consistent');
  });

  it('two DIFFERENT unrecognised hosts are mixed, not one settled unknown answer', () => {
    // Agreement requires the same DATABASE, not merely the same verdict word. Two unrelated
    // Postgres instances are both `unknown`, but they are not one target — and reporting them as
    // consistent would hide that the process could write to either.
    const r = reconcileDbTargets({ DATABASE_URL: ARBITRARY_PG, DATABASE_URL_UNPOOLED: OTHER_NEON });
    expect(r.verdict).toBe('mixed');
  });

  it('the mixed reason names the disagreeing variables and never the URLs', () => {
    const r = reconcileDbTargets({ DATABASE_URL: CANON_POOLED, DATABASE_URL_UNPOOLED: STALE });
    expect(r.reason).toContain('DATABASE_URL');
    expect(r.reason).not.toContain('u:p');
  });

  it('returns a typed verdict and reason only — no HTTP status, no throw', () => {
    // The core is pure. Turning a refusal into a 503, an error boundary or an exit code is an
    // adapter's job, and this packet builds no adapter.
    for (const env of [{}, { DATABASE_URL: STALE }, { DATABASE_URL: CANON_POOLED, DATABASE_URL_UNPOOLED: STALE }]) {
      const r = reconcileDbTargets(env);
      expect(typeof r.reason).toBe('string');
      expect(r).not.toHaveProperty('status');
      expect(r).not.toHaveProperty('httpStatus');
    }
  });
});
