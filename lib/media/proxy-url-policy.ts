/**
 * Canonical public media-URL policy — ONE owner, shared by every consumer.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * The allowlist previously lived only inside `app/api/media/proxy/route.ts`, so
 * nothing else could validate against it. Tests had to re-declare their own
 * approximation — and a test that defines its own expected implementation can
 * pass while production regresses. Worse, the approximations were WIDER than the
 * real rule: a regex like `/(^|\.)(cotality|corelogic)\.com$/` accepts
 * `evil.cotality.com`, which the production exact-Set rejects.
 *
 * The proxy route imports `ALLOWED_MEDIA_HOSTS` / `isAllowedMediaUrl` from here,
 * so validating against this module IS validating against production.
 *
 * THE DEFECT THIS POLICY PREVENTS
 * -------------------------------
 * `resolveDbListingMedia` already proxies relational Cotality rows. The detail
 * route then re-proxied them using a SUBSTRING test for `cotality.com`, which
 * still matches inside the encoded `url=` parameter of an already-proxied
 * relative URL. That produced a nested proxy URL whose inner value is relative,
 * so `new URL()` throws, the allowlist rejects it, and the route returns 403 —
 * proven live 2026-08-06 (nested -> 403, single-proxied -> 200, 1,356,147 bytes).
 *
 * `toPublicMediaUrl` is therefore IDEMPOTENT BY CONSTRUCTION: applying it twice
 * always equals applying it once.
 */

/**
 * EXACT hostnames the media proxy may fetch. Not a suffix match — a suffix rule
 * would admit `evil.cotality.com`. Widening this set is a policy change.
 *
 * Old CoreLogic hosts deprecated — deadline April 30, 2026. Old media URLs still
 * work through 2026 warranty per Cotality email.
 */
export const ALLOWED_MEDIA_HOSTS: ReadonlySet<string> = new Set([
  "api.cotality.com",
  "api-trestle.corelogic.com",
  "api-prod.corelogic.com",
]);

/** The public proxy path. Never use this as an ASSET IDENTITY — every proxied
 *  photo shares it, so keying on it collapses a whole gallery to one image. */
export const MEDIA_PROXY_PATH = "/api/media/proxy";
const MEDIA_PROXY_PREFIX = `${MEDIA_PROXY_PATH}?url=`;

/**
 * Exactly the production predicate: parse, then require an EXACT host match.
 * A relative URL throws and is rejected — which is what makes a nested proxy
 * URL fail closed rather than reaching Cotality.
 */
export function isAllowedMediaUrl(url: string): boolean {
  try {
    return ALLOWED_MEDIA_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Is this already a canonical single-proxied URL? */
export function isProxiedMediaUrl(url: string): boolean {
  return typeof url === "string" && url.startsWith(MEDIA_PROXY_PREFIX);
}

/**
 * Recover the source URL from a canonical proxied URL. Returns null when the
 * input is not proxied or its inner value is not an approved absolute URL —
 * which is exactly how a NESTED proxy URL is detected.
 */
export function unwrapProxiedMediaUrl(url: string): string | null {
  if (!isProxiedMediaUrl(url)) return null;
  let inner: string;
  try {
    inner = decodeURIComponent(url.slice(MEDIA_PROXY_PREFIX.length));
  } catch {
    return null;
  }
  return isAllowedMediaUrl(inner) ? inner : null;
}

/** A proxy URL whose inner value is not an approved absolute URL — i.e. corrupt. */
export function isNestedOrInvalidProxyUrl(url: string): boolean {
  return isProxiedMediaUrl(url) && unwrapProxiedMediaUrl(url) === null;
}

/**
 * THE canonical public media URL.
 *
 *   approved absolute source  -> wrapped exactly once
 *   already-proxied (valid)   -> returned UNCHANGED  (idempotence)
 *   R2 / Mallan / other https -> returned unchanged
 *   relative / unparseable    -> returned unchanged, never wrapped
 *   unapproved host           -> returned unchanged, never wrapped
 *
 * Never wraps twice, because the already-proxied case returns early and a
 * relative URL can never satisfy `isAllowedMediaUrl`.
 */
export function toPublicMediaUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== "string") return rawUrl;
  if (isProxiedMediaUrl(rawUrl)) return rawUrl; // idempotent: already canonical
  if (!isAllowedMediaUrl(rawUrl)) return rawUrl; // R2, Mallan, relative, unapproved
  return `${MEDIA_PROXY_PREFIX}${encodeURIComponent(rawUrl)}`;
}
