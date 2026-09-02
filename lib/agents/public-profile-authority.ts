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
 * The Agent record is the authority. When the database CAN answer, its answer
 * is final — including "no active agent", which must produce a 404.
 *
 * The static roster is an OUTAGE fallback only: it is consulted when the
 * database is unreachable, so a database incident degrades the site rather than
 * blanking every agent page. It can never contradict a database that replied.
 *
 * Both paths run the professional title through the one title authority, so
 * neither can advertise a designation that disagrees with the licence.
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
  license_type: string | null;
  role: string | null;
  photo: string | null;
  phone: string | null;
  email: string;
  bio: string | null;
  specialties: string[];
  languages: string[];
  featured: boolean;
}

/** The shape `data/agents.json` carries. It has no licence or role columns. */
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
 * The title is DERIVED from licence class + authorisation role, so a stale
 * `title` column cannot advertise a designation the licence does not support.
 */
export function fromDatabase(a: DbAgentRow, fallbackSlug: string): PublicAgentProfile {
  return {
    id: a.public_slug || fallbackSlug,
    name: a.full_name || `${a.first_name} ${a.last_name}`,
    title: professionalTitle({ title: a.title, license_type: a.license_type, role: a.role }),
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
 * Normalise a static entry, used ONLY when the database is unreachable.
 *
 * The static file has no licence or role, so `professionalTitle` falls through
 * to its stored title rather than inventing a designation.
 */
export function fromStatic(e: StaticAgentEntry): PublicAgentProfile {
  return {
    id: e.id,
    name: e.name,
    title: professionalTitle({ title: e.title, license_type: null, role: null }),
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
 * Resolve one public profile under the authority rule.
 *
 * `readDb` MUST throw when the database is unreachable and resolve to null when
 * the database replied and holds no matching ACTIVE agent. That distinction is
 * the whole rule: a null is authoritative and produces a 404; only a throw
 * permits the static fallback.
 */
export async function resolvePublicAgent(
  slug: string,
  readDb: () => Promise<DbAgentRow | null>,
  readStatic: () => StaticAgentEntry | undefined,
): Promise<PublicAgentProfile | null> {
  try {
    const row = await readDb();
    // AUTHORITATIVE, including the negative. The static roster does not get a
    // second opinion — that is how a deleted agent stayed live.
    return row ? fromDatabase(row, slug) : null;
  } catch (err) {
    console.error(
      '[public-profile] database unreachable; serving the static roster for continuity:',
      err instanceof Error ? err.message : err,
    );
    const entry = readStatic();
    return entry ? fromStatic(entry) : null;
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
    title: professionalTitle({ title: a.title, license_type: a.license_type, role: a.role }),
    photo: a.photo || PLACEHOLDER_PHOTO,
    bio: a.bio || '',
    specialties: a.specialties,
    languages: a.languages,
    featured: a.featured,
  };
}

/** Static outage fallback for the directory, contact fields dropped. */
export function directoryFromStatic(e: StaticAgentEntry): PublicAgentDirectoryEntry {
  const { phone: _p, email: _e, source: _s, ...rest } = fromStatic(e);
  return rest;
}
