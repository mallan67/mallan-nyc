/**
 * Building-Neon-wake source contracts (building-only PR, 2026-07-23).
 *
 *   1. /api/buildings is a THIN pure-read shell — no prisma, no Trestle, no
 *      writes; ALL assembly lives in the shared cached module.
 *   2. The building page + generateMetadata consume the SAME accessor
 *      directly — the page→internal-HTTP hop is gone.
 *   3. The shared module performs ZERO Prisma writes; the dormant
 *      fire-and-forget building upsert is gone from every app path.
 */
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("thin pure-read building route + direct page accessor", () => {
  it("the API route contains no prisma, no Trestle, no upsert — only the shared accessor", () => {
    const route = read("app/api/buildings/route.ts");
    expect(route).toContain("getBuildingDataCached");
    expect(route).not.toMatch(/\bprisma\b/);
    expect(route).not.toContain("upsertBuildingFromRecords(");
    expect(route).not.toMatch(/from '@\/lib\/buildings\/upsert'/);
    expect(route).not.toContain("TRESTLE_URL");
  });

  it("the building page uses the accessor directly — no internal /api/buildings fetch", () => {
    const page = read("app/buildings/[slug]/page.tsx");
    expect(page).toContain("getBuildingDataCached");
    expect(page).not.toMatch(/fetch\(\s*[`'"][^`'"]*\/api\/buildings/);
  });

  it("the shared module performs ZERO Prisma writes and no fire-and-forget prisma promises", () => {
    const lib = read("lib/buildings/public-building-data.ts");
    expect(lib).not.toMatch(/prisma\.\w+\.(create|update|upsert|delete|createMany|updateMany|deleteMany)\b/);
    expect(lib).not.toContain("upsertBuildingFromRecords(");
    expect(lib).not.toMatch(/prisma\.[^\n]*\.catch\(\(\)\s*=>/);
  });

  it("upsertBuildingFromRecords is not called from ANY app route or page (sync-workflow ownership only)", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(entry.name) && read(rel).includes("upsertBuildingFromRecords(")) {
          offenders.push(rel);
        }
      }
    };
    walk("app");
    expect(offenders).toEqual([]);
  });

  it("warm clustering is wired: sync warms the manifest ONLY on a fully successful run, after the SyncState upsert", () => {
    const sync = read("lib/idx/sync.ts");
    const warmIdx = sync.indexOf("warmBuildingManifestShards()");
    const upsertIdx = sync.indexOf("prisma.syncState.upsert");
    expect(warmIdx).toBeGreaterThan(-1);
    expect(upsertIdx).toBeGreaterThan(-1);
    expect(warmIdx).toBeGreaterThan(upsertIdx); // after feed state is committed
    const guardIdx = sync.lastIndexOf("if (errors === 0)", warmIdx);
    expect(guardIdx).toBeGreaterThan(upsertIdx); // guarded on full success
  });
});
