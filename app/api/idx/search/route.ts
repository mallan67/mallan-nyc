// GET /api/idx/search
// Authenticated backend Search over ONE settled universe:
//   Cotality provider rows (Mallan's own office copies suppressed inside the query)
//   + Mallan-authored SL-/RL- rows under the same criteria
//   -> one global order -> exact total -> page -> hydrate (rows + media) -> CRM DTO.
//
// Nothing is filtered after the page is cut. Criteria this checkpoint does not
// execute are REFUSED by name (HTTP 400, code UNSUPPORTED_CRITERION), never
// ignored. Auth: agent or broker session cookie required. Read-only.
//
// Provider contract: docs/search/evidence/2026-09-05-live-cotality-checkpoint-contract.md,
// the Validator re-check, and docs/search/evidence/2026-09-05-builder-execution-probes.md.

import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { hasCredentials } from "@/lib/idx/auth";
import { generateAttributionText } from "@/lib/idx/attribution";
import { logFetchAttempt } from "@/lib/idx/logger";
import { criteriaFromParams } from "@/lib/search/engine/criteria";
import { executeSearch } from "@/lib/search/engine/executor";
import { SEARCH_SELECT_FIELDS as ENGINE_SELECT_FIELDS } from "@/lib/search/engine/select";
import { ProviderError } from "@/lib/search/engine/provider-client";

// The hydrated-page select list lives in the engine (lib/search/engine/select.ts) so every
// executor consumer selects the same fields. Re-exported here because idx:validate and
// tests/runtime/idx-search-select-fields.test.ts read it from this route.
export const SEARCH_SELECT_FIELDS = ENGINE_SELECT_FIELDS;

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const logger = logFetchAttempt("/api/idx/search");
  try {
    if (process.env.IDX_ENABLED !== "true" || !hasCredentials()) {
      logger.complete("disabled", "IDX not enabled or missing credentials");
      return NextResponse.json({ error: "IDX search not available", code: "IDX_UNAVAILABLE" }, { status: 503, headers: NO_STORE });
    }

    const parsed = criteriaFromParams(req.nextUrl.searchParams);
    if (!parsed.ok) {
      logger.complete("error", "criteria refused");
      return NextResponse.json(
        {
          error: "One or more search criteria cannot be executed.",
          code: parsed.refusal.unsupported.length ? "UNSUPPORTED_CRITERION" : "INVALID_CRITERION",
          unsupported: parsed.refusal.unsupported,
          invalid: parsed.refusal.invalid,
        },
        { status: 400, headers: NO_STORE },
      );
    }
    const c = parsed.criteria;
    const { limit, offset } = c;
    const run = await executeSearch(c, { select: SEARCH_SELECT_FIELDS });
    const { universe, hydrated, page, universeFromCache, countMeaning } = run;

    const response = {
      listings: run.listings,
      total: run.total,
      totalCount: run.total,
      countMeaning,
      hasMore: run.hasMore,
      skip: offset,
      limit,
      attribution: generateAttributionText(),
      mediaMode: "inline" as const,
      selectionsAreDurableBy: "ListingKey" as const,
      _meta: {
        source: "cotality+mallan",
        fetchedAt: new Date().toISOString(),
        workflow: c.workflow,
        filter: universe.filter,
        orderby: universe.orderby,
        universeFromCache,
        providerCount: universe.providerCount,
        providerRows: universe.providerRows,
        providerPages: universe.providerPages,
        mallanRows: universe.mallanRows,
        mallanExcludedUnresolvedType: universe.mallanExcludedUnresolvedType,
        suppressedOfficeIds: universe.suppressedOfficeIds,
        page: {
          requested: page.length, hydrated: hydrated.listings.length,
          providerHydrated: hydrated.providerHydrated, mallanHydrated: hydrated.mallanHydrated,
          missing: hydrated.missing, gateExcluded: hydrated.gateExcluded,
        },
        media: { rows: hydrated.mediaRows, complete: hydrated.mediaComplete },
      },
    };

    // Count-only telemetry. No PII, no free text, no tokens.
    console.log(JSON.stringify({
      evt: "idx_search_telemetry", ts: response._meta.fetchedAt, workflow: c.workflow,
      statuses: c.standardStatus, boroughs: c.cityRegion, commonInterest: c.commonInterest, structureType: c.structureType,
      has_neighborhood: c.subdivisionName.length > 0, has_zip: c.postalCode.length > 0, has_listing_id: c.listingId.length > 0,
      limit, skip: offset, total: universe.total, countMeaning, providerRows: universe.providerRows, mallanRows: universe.mallanRows,
      page_hydrated: hydrated.listings.length, page_missing: hydrated.missing.length, page_gate_excluded: hydrated.gateExcluded.length,
      universe_from_cache: universeFromCache,
    }));

    logger.complete("success");
    return NextResponse.json(response, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof ProviderError) {
      logger.complete("error", "provider " + String(error.status ?? "?"));
      let path = "?";
      try { path = new URL(error.url).pathname; } catch { /* keep "?" */ }
      console.error("[IDX Search] provider error", { status: error.status, path });
      if (error.status === 429) {
        return NextResponse.json(
          { error: "Search temporarily unavailable. Please try again shortly.", code: "PROVIDER_RATE_LIMITED" },
          { status: 503, headers: { ...NO_STORE, "Retry-After": "30" } },
        );
      }
      return NextResponse.json(
        { error: "Search failed at the provider.", code: "PROVIDER_ERROR", providerStatus: error.status },
        { status: 502, headers: NO_STORE },
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.complete("error", message);
    console.error("[IDX Search] Error:", message);
    return NextResponse.json({ error: "Search failed. Please try again later.", code: "SEARCH_ERROR" }, { status: 502, headers: NO_STORE });
  }
}
