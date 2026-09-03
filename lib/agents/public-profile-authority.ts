/**
 * Public agent profile — which source is allowed to answer.
 *
 * @module lib/agents/public-profile-authority
 *
 * ── The defect ────────────────────────────────────────────────────────────
 * `/agents/[name]` fell back to `data/agents.json` whenever it could not find
 * an ACTIVE database Agent — including when the database answered perfectly
 * well and simply had no such agent. That made a Git-tracked file able to:
 *
 *   RESURRECT  a deactivated or permanently deleted agent, whose profile page
 *              kept serving after the account was gone;
 *   OVERRIDE   the canonical record with stale name/title/photo/contact data;
 *   MISLABEL   a licensee, because the static file carries a free-text title
 *              that no longer has to agree with their licence;
 *   OMIT       inconsistently, since the roster and sitemap read the database
 *              only, so an agent could be absent from both and still have a
 *              live individual profile.
 *
 * ── The rule ──────────────────────────────────────────────────────────────
 * The Agent record is the AUTHORITY, full stop. Not "the Agent record normally,
 * and the Git roster during a failure" — that is still two identity authorities,
 * just with a trigger condition.
 *
 * When the database answers, its answer is final, including "no active agent",
 * which produces a 404.
 *
 * When the database is UNREACHABLE the profile is TEMPORARILY UNAVAILABLE. It
 * does not fall back to `data/agents.json`.
 *
 * An earlier revision of this module did fall back, and claimed that fixed the
 * resurrection problem. It did not: a deactivated or permanently deleted agent
 * whose static entry still sat in Git would reappear for the duration of any
 * database outage — publishing employment and licence status that Mallan had
 * already withdrawn. For a regulated professional identity, being briefly
 * unavailable is safer than being briefly wrong.
 *
 * `data/agents.json` remains the SEED source for prisma/seed.ts. It is no
 * longer a runtime identity source.
 */
import { professionalTitle } from './professional-title';

export interface PublicAgentProfile {
  id: string;
  name: string;
  title: string;
  photo: string;
  phone: string;
  email: string;
  bio: string;
  specialties: string[];
  languages: string[];
  featured: boolean;
  /** Which source answered. 'static' means the database was unreachable. */
  source: 'database' | 'static';
}

/** The shape the database returns for a public profile. */
export interface DbAgentRow {
  public_slug: string | null;
  full_name: string | null;
  first_name: string;
  last_name: string;
  title: string | null;
  /**
   * The NY LICENCE CLASS. It alone determines the advertised designation.
   *
   * `role` is deliberately ABSENT from this shape: it is the brokerage
   * professional role, and reading it here is what used to manufacture a
   * licence class out of a Mallan fact about standing.
   */
  license_type: string | null;
  photo: string | null;
  phone: string | null;
  email: string;
  bio: string | null;
  specialties: string[];
  languages: string[];
  featured: boolean;
}

/**
 * The shape `data/agents.json` carries.
 *
 * The roster records a `role` per agent as seed input, but it is deliberately
 * NOT carried into this shape: nothing on a public identity path may read it.
 * The roster has no licence-class column at all — its `title` is the evidence.
 */
export interface StaticAgentEntry {
  id: string;
  name: string;
  title: string;
  photo: string;
  phone: string;
  email: string;
  bio: string;
  specialties: string[];
  languages: string[];
  featured: boolean;
}

const PLACEHOLDER_PHOTO = '/images/agent-placeholder.svg';

/**
 * Normalise a canonical Agent row for public display.
 *
 * The title is DERIVED from the LICENCE CLASS, so neither a stale `title`
 * column nor the brokerage role can advertise a designation the licence does
 * not support.
 */
export function fromDatabase(a: DbAgentRow, fallbackSlug: string): PublicAgentProfile {
  return {
    id: a.public_slug || fallbackSlug,
    name: a.full_name || `${a.first_name} ${a.last_name}`,
    title: professionalTitle({ title: a.title, license_type: a.license_type }),
    photo: a.photo || PLACEHOLDER_PHOTO,
    phone: a.phone || '',
    email: a.email,
    bio: a.bio || '',
    specialties: a.specialties,
    languages: a.languages,
    featured: a.featured,
    source: 'database',
  };
}

/**
 * Normalise a static entry.
 *
 * RETAINED FOR THE SEED PATH AND ITS TESTS ONLY. It is no longer reachable from
 * any public surface — see the module note on why an outage must not publish a
 * stale professional identity.
 */
export function fromStatic(e: StaticAgentEntry): PublicAgentProfile {
  return {
    id: e.id,
    name: e.name,
    title: professionalTitle({ title: e.title, license_type: null }),
    photo: e.photo || PLACEHOLDER_PHOTO,
    phone: e.phone || '',
    email: e.email,
    bio: e.bio || '',
    specialties: e.specialties ?? [],
    languages: e.languages ?? [],
    featured: Boolean(e.featured),
    source: 'static',
  };
}

/**
 * Raised when the database cannot answer. Callers render "temporarily
 * unavailable" rather than substituting a stale identity.
 */
export class AgentDirectoryUnavailable extends Error {
  constructor(cause: unknown) {
    super('Agent directory temporarily unavailable');
    this.name = 'AgentDirectoryUnavailable';
    this.cause = cause;
  }
}

/**
 * Resolve one public profile under the authority rule.
 *
 * Returns null when the database replied and holds no matching ACTIVE agent —
 * authoritative, and a 404.
 *
 * THROWS AgentDirectoryUnavailable when the database could not answer. There is
 * deliberately no second source: a stale roster answering for a withdrawn
 * licensee is the failure mode this module exists to prevent.
 */
export async function resolvePublicAgent(
  slug: string,
  readDb: () => Promise<DbAgentRow | null>,
): Promise<PublicAgentProfile | null> {
  try {
    const row = await readDb();
    return row ? fromDatabase(row, slug) : null;
  } catch (err) {
    console.error(
      '[public-profile] database unreachable; refusing to serve a stale identity:',
      err instanceof Error ? err.message : err,
    );
    throw new AgentDirectoryUnavailable(err);
  }
}

/**
 * The directory shape: no contact columns AT ALL.
 *
 * `/api/agents/public` must not merely strip phone/email from its response - it
 * must not SELECT them. Fetching PII you intend to discard leaves one mapping
 * mistake between the database and a harvestable public endpoint, which is why
 * the compliance rule checks the select as well as the response.
 */
export type DbAgentDirectoryRow = Omit<DbAgentRow, 'phone' | 'email'>;
export type PublicAgentDirectoryEntry = Omit<PublicAgentProfile, 'phone' | 'email' | 'source'>;

export function directoryFromDatabase(
  a: DbAgentDirectoryRow,
  fallbackSlug: string,
): PublicAgentDirectoryEntry {
  return {
    id: a.public_slug || fallbackSlug,
    name: a.full_name || `${a.first_name} ${a.last_name}`,
    title: professionalTitle({ title: a.title, license_type: a.license_type }),
    photo: a.photo || PLACEHOLDER_PHOTO,
    bio: a.bio || '',
    specialties: a.specialties,
    languages: a.languages,
    featured: a.featured,
  };
}

/** Seed-path shape for the directory, contact fields dropped. Not a runtime source. */
export function directoryFromStatic(e: StaticAgentEntry): PublicAgentDirectoryEntry {
  const { phone: _p, email: _e, source: _s, ...rest } = fromStatic(e);
  return rest;
}
