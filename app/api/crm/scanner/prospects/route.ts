/**
 * GET /api/crm/scanner/prospects
 *
 * Returns the off-market scanner's ranked seller-intent queue. Reads from
 * `data/scanner/scored-prospects.json` (produced by `scripts/scanner/
 * build-prospects.ts`). Agent/broker-auth required.
 *
 * Query params:
 *   limit          (default 100, max 500)
 *   offset         (default 0)
 *   confidence     filter to one of: high|medium|low|all (default: all)
 *   bbl            filter to a single BBL
 *   include_suppressed  default false
 *
 * NOTE: this endpoint READS pre-computed flat-file output. To refresh the
 * data, an operator runs `npm run scanner:build-prospects`. We don't
 * recompute on request — the corridor join over PLUTO + ACRIS + DOS is
 * minutes of work and not appropriate inside an HTTP handler.
 */
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { isAuthError, requireAgentOrBroker } from "@/lib/auth";
import type { ScoredProspect } from "@/lib/scanner/scoring/types";

const DATA_PATH = path.join(process.cwd(), "data", "scanner", "scored-prospects.json");
const MANIFEST_PATH = path.join(process.cwd(), "data", "scanner", "build-prospects-manifest.json");

interface ProspectsResponse {
  prospects: ScoredProspect[];
  total: number;
  manifest: unknown | null;
  data_source: string;
  filters_applied: Record<string, string | number | boolean | null>;
}

async function loadProspects(): Promise<ScoredProspect[]> {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ScoredProspect[];
  } catch {
    return [];
  }
}

async function loadManifest(): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const sp = req.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number(sp.get("limit") || "100"), 1), 500);
  const offset = Math.max(Number(sp.get("offset") || "0"), 0);
  const confidence = (sp.get("confidence") || "all").toLowerCase();
  const bblFilter = sp.get("bbl");
  const includeSuppressed = sp.get("include_suppressed") === "true";

  const all = await loadProspects();
  const manifest = await loadManifest();

  let filtered = all;
  if (!includeSuppressed) filtered = filtered.filter((p) => !p.suppressed);
  if (confidence !== "all") filtered = filtered.filter((p) => p.confidence === confidence);
  if (bblFilter) filtered = filtered.filter((p) => p.bbl === bblFilter);

  const sliced = filtered.slice(offset, offset + limit);

  const response: ProspectsResponse = {
    prospects: sliced,
    total: filtered.length,
    manifest,
    data_source: path.relative(process.cwd(), DATA_PATH).split(path.sep).join("/"),
    filters_applied: {
      limit, offset, confidence, bbl: bblFilter, include_suppressed: includeSuppressed,
    },
  };

  return NextResponse.json(response, {
    headers: {
      // Internal data only — do not allow caching at the edge
      "Cache-Control": "private, no-store",
    },
  });
}
