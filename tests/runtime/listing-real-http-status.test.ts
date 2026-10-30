/// <reference types="jest" />
/**
 * Listing pages must answer with REAL HTTP status codes (404 for a gone listing, 308 for a
 * non-canonical address), not 200.
 *
 * WHY THIS TEST EXISTS (Search Console, 2026-10-29, mallan.nyc):
 *   - 2,855 pages reported as "Soft 404" and 5,619 as "Excluded by 'noindex' tag": a listing that
 *     had left the market answered "200 OK" with a "Listing Not Found" page.
 *   - 8,780 pages reported as "Page with redirect" and ~2,500 as duplicates: a non-canonical
 *     address (dash instead of slash before the id, the bare id, an older short street name) also
 *     answered "200 OK" and moved the visitor with a browser-side redirect.
 *
 * ROOT CAUSE (measured on Next.js 16.2.4 with a throwaway app that mirrors this route: an
 * on-demand ISR catch-all with notFound() and permanentRedirect()):
 *
 *   loading.tsx in the app root     loading.tsx at /listing    notFound()   permanentRedirect()
 *   present (as this app had)       present                    200 + noindex  200 + meta refresh
 *   present                         removed                    200 + noindex  200 + meta refresh
 *   removed                         present                    200 + noindex  200 + meta refresh
 *   removed                         removed                    404            308 + Location
 *
 * A loading.tsx is a <Suspense> boundary. Once a boundary's fallback is sent the server has already
 * committed to "200 OK", so a later notFound() only injects <meta name="robots" content="noindex">
 * and a later redirect becomes a client-side redirect. Any loading.tsx on the path from the app
 * root to the page does this, including the app-wide one. Next's own guidance
 * (docs/01-app/02-guides/streaming.mdx, "The HTTP contract > Status codes") says the same.
 *
 * This test therefore fails if a loading boundary is put back on the path above the listing page.
 * It is a structural guard: the behaviour itself was proven by the measurements above and by a
 * probe of the preview deployment recorded in the pull request.
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");
const APP = path.join(ROOT, "app");
const LISTING_DIR = path.join(APP, "listing", "[...slug]");
const LOADING_NAMES = ["loading.tsx", "loading.ts", "loading.jsx", "loading.js"];

/** Every directory from `app/` down to the listing page's own directory. */
function directoriesAboveListingPage(): string[] {
  const dirs: string[] = [];
  let dir = LISTING_DIR;
  while (dir.startsWith(APP)) {
    dirs.push(dir);
    if (dir === APP) break;
    dir = path.dirname(dir);
  }
  return dirs;
}

describe("listing route: real HTTP status codes", () => {
  it("has no loading boundary anywhere between the app root and /listing/[...slug]", () => {
    const offenders: string[] = [];
    for (const dir of directoriesAboveListingPage()) {
      for (const name of LOADING_NAMES) {
        const file = path.join(dir, name);
        if (fs.existsSync(file)) offenders.push(path.relative(ROOT, file).replace(/\\/g, "/"));
      }
    }
    // A loading.tsx here makes a gone listing answer 200 (soft 404) and a non-canonical
    // address answer 200 with a browser-side redirect, instead of 404 and 308.
    expect(offenders).toEqual([]);
  });

  it("still decides 404 and the canonical redirect inside the page, before any Suspense", () => {
    const src = fs.readFileSync(path.join(LISTING_DIR, "page.tsx"), "utf8");
    expect(src).toMatch(/import \{[^}]*\bnotFound\b[^}]*\} from ['"]next\/navigation['"]/);
    expect(src).toMatch(/import \{[^}]*\bpermanentRedirect\b[^}]*\} from ['"]next\/navigation['"]/);
    // The confirmed-miss branch and the canonical-path enforcement both exist.
    expect(src).toMatch(/if \(!result\) \{\s*notFound\(\);/);
    expect(src).toMatch(/permanentRedirect\(canonicalPath\)/);
  });

  it("marks the not-found metadata noindex as a second signal", () => {
    const src = fs.readFileSync(path.join(LISTING_DIR, "page.tsx"), "utf8");
    expect(src).toMatch(
      /title: 'Listing Not Found \| Mallan Real Estate',\s*robots: \{ index: false, follow: true \}/,
    );
  });
});
