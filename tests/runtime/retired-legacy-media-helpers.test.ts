/**
 * ANTI-RESURRECTION — the retired legacy media helpers must stay retired.
 *
 * This file previously did the opposite of its name. It asserted that
 * `backfillEmptyMedia` STILL EXISTED in `lib/idx/sync.ts` while documenting that
 * the helper was unreachable — so it protected the corpse instead of preventing
 * its return. Both helpers are now deleted and this file guards their absence.
 *
 * WHAT WAS RETIRED, AND WHAT REPLACED IT
 *
 *   backfillEmptyMedia()  — refilled the legacy `listings.media` JSON column by
 *                           re-fetching photos from the Trestle Media endpoint.
 *   migrateMediaToR2()    — rewrote Trestle media URLs in that same JSON column
 *                           to R2 URLs; its own comment said it "runs after
 *                           backfillEmptyMedia in the media-backfill cron".
 *
 *   The `/api/cron/media-backfill` route that called both was deleted by PR #471
 *   (OPS-008, 2026-07-03), leaving the helpers uncalled library code. The
 *   canonical owner today is the `listing_media` table driven by `media-sync`,
 *   with R2 admission policy and `/api/media/proxy` delivery.
 *
 * SCOPE OF THE ASSERTIONS
 *
 * These invariants apply to EXECUTABLE SOURCE ONLY. Historical audits, incident
 * reports, dated plans and recovery evidence are allowed — and expected — to
 * name the retired architecture; erasing those would rewrite history rather
 * than clean up code.
 */

import * as fs from "fs";
import * as path from "path";

const REPO = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), "utf8");
const exists = (rel: string) => fs.existsSync(path.join(REPO, rel));

/** Executable source trees. Deliberately excludes docs/, memory/ and artifacts/. */
const CODE_DIRS = ["app", "lib", "scripts"];

function walk(dir: string, out: string[] = []): string[] {
  const abs = path.join(REPO, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(rel, out);
    } else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

/** Strip comments so a doc-comment explaining the retirement cannot fail us. */
function executableCode(src: string): string {
  return src
    .replace(/\r\n?/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const RETIRED = ["backfillEmptyMedia", "migrateMediaToR2"] as const;

describe("retired legacy media helpers stay retired", () => {
  it("the media-backfill route remains absent", () => {
    expect(exists("app/api/cron/media-backfill")).toBe(false);
    expect(exists("app/api/cron/media-backfill/route.ts")).toBe(false);
  });

  it("neither symbol is defined anywhere in executable source", () => {
    const offenders: string[] = [];
    for (const dir of CODE_DIRS) {
      for (const file of walk(dir)) {
        const code = executableCode(read(file));
        for (const sym of RETIRED) {
          // Definition or call — not a mention inside a comment.
          if (new RegExp(`\\b${sym}\\s*\\(`).test(code) || new RegExp(`function\\s+${sym}\\b`).test(code)) {
            offenders.push(`${file} :: ${sym}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("lib/idx/sync.ts no longer exports either helper", () => {
    const code = executableCode(read("lib/idx/sync.ts"));
    expect(code).not.toMatch(/export\s+async\s+function\s+backfillEmptyMedia\b/);
    expect(code).not.toMatch(/export\s+async\s+function\s+migrateMediaToR2\b/);
  });

  it("vercel.json does not schedule the retired cron", () => {
    const vercel = JSON.parse(read("vercel.json")) as { crons?: { path?: string }[] };
    const paths = (vercel.crons ?? []).map((c) => c.path ?? "");
    expect(paths.filter((p) => p.includes("media-backfill"))).toEqual([]);
  });

  it("package.json exposes no operator command for the retired paths", () => {
    const scripts = (JSON.parse(read("package.json")) as { scripts?: Record<string, string> }).scripts ?? {};
    const offenders = Object.entries(scripts)
      .filter(([, cmd]) => /media-backfill|backfillEmptyMedia|migrateMediaToR2/.test(cmd))
      .map(([name]) => name);
    expect(offenders).toEqual([]);
  });

  it("the generated route catalog does not advertise the retired route", () => {
    // Generated artifact: regenerate via scripts/reso/route-catalog.js, never
    // hand-edit. A stale catalog is how a deleted route keeps looking alive.
    expect(read("artifacts/api-route-catalog.json")).not.toContain("/api/cron/media-backfill");
  });

  it("historical documentation is still permitted to mention them", () => {
    // Guard against over-zealous cleanup: this suite must never be extended to
    // scrub dated audits, incident reports or recovery evidence.
    const registry = read("docs/PLATFORM-ISSUE-REGISTRY.md");
    expect(registry).toContain("backfillEmptyMedia");
  });
});
