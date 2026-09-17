/**
 * Segments under /agents/ that can never be an agent slug.
 *
 * @module lib/agents/reserved-slug
 *
 * -- The defect --------------------------------------------------------------
 * GET /agents/sitemap.xml returned HTTP 200 rendering the agent-profile
 * "temporarily unavailable" template. The dynamic segment [name] accepted any
 * path component and handed it straight to the Agent lookup, which does
 * slug.replace(/-/g, ' ') and queries the database. A static asset name became
 * an Agent identity question, and during an authority outage it inherited the
 * unavailable page -- so a file that is not and could never be an agent was
 * publicly presented as an agent whose profile was temporarily down.
 *
 * -- Why the ORDER is the fix, not just the answer ---------------------------
 * This guard runs at the ROUTE BOUNDARY, before any Agent database read. That
 * placement is the requirement.
 *
 * A guard that ran after resolution would still be wrong during an outage: the
 * lookup would throw AgentDirectoryUnavailable before the guard was ever
 * consulted, and /agents/sitemap.xml would go back to rendering "temporarily
 * unavailable". The truth "this segment is not an agent" is knowable from the
 * segment alone, so it must never be made to depend on whether the database
 * can answer. Correctness here is independent of availability, and the code
 * has to express that.
 *
 * The result is 404: it is not an agent and never could be one. That is a
 * different question from the accepted framework limitation on outage status
 * codes, and it is not blocked by it.
 *
 * -- What counts as impossible -----------------------------------------------
 * Deliberately narrow. Two rules, both structural:
 *
 *   1. a segment containing a dot   -- every file-extension-bearing name
 *      (sitemap.xml, robots.txt, favicon.ico, anything.php) and every dotted
 *      well-known path. No NY licensee's name-derived slug contains a dot;
 *      slugs are produced as first-last, lower-cased, spaces to hyphens.
 *   2. a segment starting with an underscore -- the framework's reserved
 *      namespace (_next and friends).
 *
 * There is deliberately NO list of reserved WORDS. Every real collision today
 * carries an extension and is already caught by rule 1, and a word list is the
 * beginning of a slug-validation framework: it would start deciding which
 * human names are permissible, which is a different and much worse problem
 * than the one being fixed. If an extension-less reserved route is ever added
 * under /agents/, add it here explicitly and say why.
 */

/**
 * True when this path segment cannot possibly identify an agent.
 *
 * Pure and synchronous by design -- it must be callable before, and without,
 * any database access.
 */
export function isReservedAgentSegment(segment: string | null | undefined): boolean {
  const s = (segment ?? '').trim();

  // An empty segment identifies nobody.
  if (!s) return true;

  // Rule 1 -- file extensions and dotted well-known names.
  if (s.includes('.')) return true;

  // Rule 2 -- the framework's reserved namespace.
  if (s.startsWith('_')) return true;

  return false;
}
