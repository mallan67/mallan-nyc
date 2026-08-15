/// <reference types="jest" />
/**
 * Listing detail page — infrastructure errors must NOT become a (cached) 404.
 *
 * Regression for the PR #511 review: fetchFromDB/fetchListing previously caught EVERY
 * exception and returned null, and the page called notFound() on null. A Prisma/Neon
 * timeout, connection failure, or compute-quota error was therefore indistinguishable
 * from a genuine missing listing — and under ISR a valid cached listing could be
 * replaced with a 404.
 *
 * The page now resolves through `resolveListingResult`, which returns null ONLY on a
 * confirmed miss / display-gate rejection and PROPAGATES any thrown (infrastructure)
 * error, so `if (!result) notFound()` can never fire on an infra error.
 */
import fs from "fs";
import path from "path";
import { resolveListingResult } from "@/lib/listings/listing-fetch-result";

describe("resolveListingResult — confirmed miss vs. infrastructure error", () => {
  it("passes through a real result (the listing was found)", async () => {
    const dto = { listing: { id: "RLS1" } };
    await expect(resolveListingResult(async () => dto)).resolves.toBe(dto);
  });

  it("passes through null on a CONFIRMED miss (page may then notFound())", async () => {
    await expect(resolveListingResult(async () => null)).resolves.toBeNull();
  });

  it("PROPAGATES a Prisma-style infrastructure error (does NOT convert to null)", async () => {
    const infra = Object.assign(new Error("Timed out fetching a new connection from the pool"), {
      code: "P2024",
    });
    await expect(resolveListingResult(async () => { throw infra; })).rejects.toBe(infra);
  });

  it("PROPAGATES a Neon compute-quota error", async () => {
    const quota = new Error("Your account or project has exceeded the compute time quota");
    await expect(resolveListingResult(async () => { throw quota; })).rejects.toBe(quota);
  });

  it("a thrown error never surfaces as a falsy value the page would 404 on", async () => {
    let sawFalsy = false;
    try {
      const r = await resolveListingResult(async () => { throw new Error("ECONNRESET"); });
      // Reaching here means the error was swallowed into a value — the exact bug.
      sawFalsy = r == null;
    } catch {
      /* expected: the infrastructure error propagated */
    }
    expect(sawFalsy).toBe(false);
  });
});

describe("listing page wires the not-found-vs-error contract", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../app/listing/[...slug]/page.tsx"),
    "utf8",
  );

  it("imports and uses resolveListingResult at the page boundary", () => {
    expect(src).toMatch(/from ['"]@\/lib\/listings\/listing-fetch-result['"]/);
    expect(src).toMatch(/resolveListingResult\(/);
  });

  it("fetchListing delegates to fetchFromDB without a swallowing try/catch (W1 tag-attach happens AFTER resolution, outside any try)", () => {
    // Pin the post-W1 body: fetchFromDB is awaited bare (no try/catch — infra
    // errors still propagate so ISR can never cache a 404 over a valid
    // listing), and the One Cycle W1 tag attach runs only on a RESOLVED
    // result (attachListingCacheTags carries its own internal fail-open
    // handling and cannot swallow fetch errors).
    // REVISED 2026-08-15: fetchFromDB is now reached through the persistent Data Cache
    // (`unstable_cache`, keyed by resolved listing id) when an id is derivable, and called bare
    // otherwise. Both routes remain UNGUARDED — unstable_cache does not cache a rejected promise,
    // so infra errors still propagate and a 404 can never be frozen over a valid listing. The
    // invariant this test protects is unchanged; only the call shape moved.
    expect(src).toMatch(/const dataCacheId = derivedListingIdFromSlug\(slug, keyOverride\);/);
    expect(src).toMatch(/unstable_cache\(\s*\(\) => fetchFromDB\(slug, keyOverride\)/);
    expect(src).toMatch(/:\s*await fetchFromDB\(slug, keyOverride\);/);
    // No try/catch may wrap the fetchFromDB call inside fetchListing.
    const body = src.match(/const fetchListing = cache\([\s\S]*?\n\}\);/)?.[0] ?? "";
    expect(body).not.toMatch(/try\s*\{[\s\S]*fetchFromDB/);
  });

  it("no prisma.listing.findUnique lookup swallows DB errors with .catch(() => null)", () => {
    // Both the embedded-ID and final listing-ID lookups must let Prisma/Neon errors
    // propagate (a real miss returns null naturally). The supplementary prisma.AGENT
    // lookup keeps its .catch — that is graceful degradation of the agent card, not the
    // listing's existence, so it is out of scope.
    expect(src).not.toMatch(
      /prisma\.listing\.findUnique\(\{[\s\S]{0,240}?\}\)\s*\.catch\(\(\)\s*=>\s*null\)/,
    );
  });
});
