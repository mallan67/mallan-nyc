// lib/listings/alias-index.ts
//
// Durable alias→canonical index for public listing URLs (Neon public-DB-wakeups P0).
//
// A public alias request (bare id, Option-D hybrid, or legacy address-only slug) must
// resolve to its canonical /listing/{address}/{id} WITHOUT touching Prisma/Neon. This
// module is the read/write surface over that index, stored in the EXISTING Upstash Redis
// (lib/redis.ts — no new env). It imports NO Prisma and issues NO Neon request — its only
// lookup is Upstash — so the resolver `proxy.ts` calls (Next 16's Proxy runs BEFORE route
// rendering; Node.js runtime) resolves aliases with a single Redis GET and nothing else.
//
// KEYS (one listing writes several):
//   idx:alias:id:{LISTING_ID_UPPER}   → canonical path   (covers id-only + hybrid)
//   idx:alias:addr:{address-slug}     → canonical path   (covers legacy address-only)
// A `idx:alias:ver` integer namespaces the space so a future full rebuild is atomic.
//
// SEMANTICS of lookupAlias():
//   string     → known alias → 308 to this canonical path
//   null       → AUTHORITATIVE miss (index is complete) → 404 without DB
//   undefined  → Redis unavailable → caller must fail OPEN (fall through to the page)
//
// The index is populated by the IDX sync/reconcile (writeAliasEntries on each listing
// change) plus a one-time backfill (scripts/backfill-alias-index.ts). It is authoritative
// ONLY once backfilled — until then callers should fail open (see FEATURE FLAG below).

import redis from "@/lib/redis";
import {
  isMlsIdSlug,
  extractMlsIdFromSlug,
  extractListingIdFromSlug,
  stripListingIdSuffix,
} from "@/lib/listing-slug";
import { normalizeListingIdCase } from "@/lib/listing-canonical-url";

const NS = "idx:alias";

/**
 * Authoritative mode: when "true", an index MISS on a Redis that is UP means the listing
 * genuinely does not exist → 404 without DB. Until the backfill has run in an environment,
 * leave this OFF so a not-yet-indexed valid alias falls through to the page instead of a
 * false 404. Read from env WITHOUT adding a new var name to production config — it simply
 * defaults off when unset.
 */
export function aliasIndexAuthoritative(): boolean {
  return process.env.ALIAS_INDEX_AUTHORITATIVE === "true";
}

export type AliasLookupKey =
  | { kind: "canonical" } // already canonical (2-seg or listing-{id}) → render, no redirect
  | { kind: "alias"; redisKey: string };

/**
 * Derive the index lookup key from a single `/listing/<segment>` — PURE, no I/O.
 * Two-segment canonical paths and the suppressed `listing-{id}` form return "canonical".
 */
export function deriveAliasLookup(slugParts: string[]): AliasLookupKey {
  if (slugParts.length >= 2) return { kind: "canonical" }; // {address}/{id}
  const seg = slugParts[0] ?? "";
  if (!seg) return { kind: "canonical" };
  if (isMlsIdSlug(seg)) return { kind: "canonical" }; // `listing-{id}` IS canonical (suppressed)

  // id-only (`rls20088635`) or hybrid (`{address}-rls20088635`) → key by the id.
  const embedded = extractListingIdFromSlug(seg); // hybrid → RLS...
  const bareId = normalizeListingIdCase(seg); // id-shaped bare slug → RLS..., else unchanged
  const id = embedded || (bareId !== seg ? bareId : null);
  if (id) return { kind: "alias", redisKey: `${NS}:id:${id.toUpperCase()}` };

  // legacy address-only slug (no embedded id) → key by the address slug.
  return { kind: "alias", redisKey: `${NS}:addr:${stripListingIdSuffix(seg)}` };
}

/** Parse `/listing/a/b` → ['a','b']; returns null for non-listing paths. */
export function slugPartsFromPathname(pathname: string): string[] | null {
  const m = pathname.match(/^\/listing\/(.+)$/);
  if (!m) return null;
  return m[1].split("/").filter(Boolean);
}

/**
 * Look up a derived key. Returns the canonical path (hit), null (authoritative miss),
 * or undefined (Redis down / not configured → caller fails OPEN). Never throws.
 */
export async function lookupAlias(redisKey: string): Promise<string | null | undefined> {
  if (!redis) return undefined; // not configured → fail open
  try {
    const v = await redis.get<string>(redisKey);
    if (typeof v === "string" && v.length > 0) return v;
    return aliasIndexAuthoritative() ? null : undefined; // miss: 404 only when authoritative
  } catch {
    return undefined; // Redis error → fail open (never a false 404 from an outage)
  }
}

/**
 * The two lookup keys (id + address) for a listing, given its id and its canonical
 * address slug (the slug the render would emit, WITHOUT the -{id} hybrid suffix).
 */
export function aliasKeysForListing(listingId: string, addressSlug: string | null): string[] {
  const keys = [`${NS}:id:${listingId.toUpperCase()}`];
  if (addressSlug && !isMlsIdSlug(addressSlug)) {
    keys.push(`${NS}:addr:${stripListingIdSuffix(addressSlug)}`);
  }
  return keys;
}

/**
 * Write/refresh the alias→canonical entries for one listing. Called by the sync seams
 * (cron/background, never a public request). Best-effort: a Redis failure never breaks
 * the DB write that preceded it. `addressSlug` is the render's address slug (may be the
 * suppressed `listing-{id}` form, in which case only the id key is written — no address key,
 * so a suppressed address never enters the index).
 *
 * KEY LIFETIME: entries are PERSISTENT (no TTL). There is no periodic full rebuild that is
 * guaranteed to run before a TTL, so an expiring key would silently drop a valid alias and
 * push it back to the DB. Freshness is CHANGE-DRIVEN: the sync rewrites the entry whenever
 * the listing changes, and `removeAliasEntries` tombstones it on withdrawal/deletion.
 */
export async function writeAliasEntries(
  listingId: string,
  addressSlug: string | null,
  canonicalPath: string,
): Promise<void> {
  if (!redis) return;
  try {
    const keys = aliasKeysForListing(listingId, addressSlug);
    await Promise.all(keys.map((k) => redis!.set(k, canonicalPath))); // persistent — change-driven
  } catch {
    /* best-effort */
  }
}

/**
 * Tombstone (remove) a listing's alias entries — called when a listing is withdrawn/deleted
 * so a stale alias cannot outlive the listing. With the id key gone, an authoritative index
 * returns a DB-free 404 for that alias. (If only the id is known — e.g. a feed-reconcile
 * ghost row that doesn't carry the address — the id key is removed; the address key, if any,
 * is corrected on the next full backfill/rebuild.) Best-effort; never throws.
 */
export async function removeAliasEntries(listingId: string, addressSlug: string | null): Promise<void> {
  if (!redis) return;
  try {
    await redis.del(...aliasKeysForListing(listingId, addressSlug));
  } catch {
    /* best-effort */
  }
}

/** Also expose the raw MLS-id extractor so middleware can log without another import. */
export { extractMlsIdFromSlug };
