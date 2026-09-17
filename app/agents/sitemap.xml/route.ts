/**
 * /agents/sitemap.xml is not an agent. This returns a REAL HTTP 404.
 *
 * @module app/agents/sitemap.xml/route
 *
 * -- Why a Route Handler and not the page ------------------------------------
 * The [name] page already refuses this segment: isReservedAgentSegment rejects
 * it at the route boundary, before any Agent database read, so it never becomes
 * an identity question. That fixed the real defect. What it could not
 * guarantee was the STATUS LINE - a page reaches 404 through notFound(), and a
 * 404 rendered into a response whose headers have already been flushed arrives
 * as HTTP 200 carrying a not-found body.
 *
 * A Route Handler has no such problem: it returns an explicit Response with an
 * explicit status, before any rendering begins.
 *
 * -- Measured on the installed Next.js 16.2.4 --------------------------------
 * The earlier finding that a page cannot set an arbitrary status is still true,
 * and is still why an outage cannot answer 503. It was generalised too far.
 * Route Handlers are a different mechanism, and a STATIC segment outranks a
 * dynamic sibling. Built with `next build` and served with `next start`:
 *
 *   - `app/agents/sitemap.xml/route.ts` registers. A static path segment
 *     containing a dot is a real route: the build emitted
 *     `○ /agents/sitemap.xml` alongside `ƒ /agents/[name]`.
 *   - It takes precedence over [name]. A log statement inside the dynamic page
 *     fired for `/agents/maya-allan` and `/agents/nobody` and NEVER for
 *     `/agents/sitemap.xml`.
 *   - The status line genuinely reads `HTTP/1.1 404 Not Found`, not a 404 body
 *     inside a 200.
 *
 * Confirmed again on the real application, not only in isolation. `next build`
 * registers "/agents/sitemap.xml/route" -> "/agents/sitemap.xml" beside
 * "/agents/[name]", and `next start` answers:
 *
 *   GET /agents/sitemap.xml   HTTP/1.1 404 Not Found
 *   GET /sitemap.xml          HTTP/1.1 200 OK        (root sitemap unaffected)
 *   GET /sitemap-agents.xml   HTTP/1.1 404 Not Found (unchanged)
 *
 * -- Scope: this file only, deliberately -------------------------------------
 * NOT repeated for `/agents/robots.txt` or `/agents/favicon.ico`.
 *
 * Stating the cost of that choice honestly: those paths currently answer HTTP
 * 200 carrying the "Agent Not Found" body. Measured -
 * `GET /agents/robots.txt` returns 200 with <title>Agent Not Found</title>.
 * The guard is doing its job (no database is touched and the body is right),
 * but a page reaches 404 via notFound(), and once the response has begun
 * streaming the status can no longer be changed. That is the same framework
 * limitation already accepted for the outage case.
 *
 * A Route Handler is warranted where a specific static path is ACTUALLY
 * requested by real clients and was OBSERVED to collide. That is sitemap.xml.
 * robots.txt is root-only by RFC 9309 and favicon.ico is root-only by
 * convention; nothing fetches either one per-directory. Adding permanent routes
 * for traffic nobody sends is speculation, and the same argument would justify
 * a route file for every string that is not an agent name, which is unbounded.
 *
 * If a genuine collision is ever OBSERVED at another /agents/ path, add that
 * one file here and record the observation - do not pre-empt it.
 *
 * Touches no Prisma, no proxy, no middleware, and no Agent authority. Its
 * answer cannot depend on whether the database is reachable, because it never
 * asks.
 */

/**
 * MUST be a function, never a prerendered artifact.
 *
 * Without this, `next build` PRERENDERS this handler and Vercel then serves its
 * BODY as a static file. Measured on the deployed Preview: the 9 bytes
 * "Not Found" came back with `Content-Length: 9`, `Etag`, `Last-Modified`,
 * `Accept-Ranges: bytes`, `Content-Disposition: inline; filename="sitemap.xml"`
 * -- and `HTTP/1.1 200 OK`. The body survived the freeze; the 404 status line
 * did not, because no handler was invoked to emit it.
 *
 * That is also why `next build && next start` disagreed with Vercel and both
 * were right: `next start` invokes the handler, the deployed static artifact
 * does not. Local evidence could never have caught this. The status line has to
 * be measured on the deployment.
 *
 * `force-dynamic` keeps it out of the prerender manifest so it deploys as a
 * function. Confirm after any change here that the build no longer lists
 * /agents/sitemap.xml as a prerendered route.
 */
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return new Response('Not Found', {
    status: 404,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // Never a search result, and never cached as though it were content.
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
