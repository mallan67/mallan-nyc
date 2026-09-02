// GET /api/idx/search
// Authenticated broker/agent Search against the live Cotality API (read-only).
// Provider facts come only from Cotality. REBNY/UCBA obligations are enforced
// separately at the compliance/output boundary.

import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { hasCredentials } from "@/lib/idx/auth";
import { fetchFromTrestle } from "@/lib/idx/fetch";
import { checkDistributionGates } from "@/lib/idx/trestle-mapper";
import { generateAttributionText } from "@/lib/idx/mapping";
import { logFetchAttempt } from "@/lib/idx/logger";
import {
  buildCrmIdxODataFilter,
  UnsupportedSearchCriterionError,
} from "@/lib/search/crm-idx-filter";
import { trestleExcludeMallanReturnCopiesClause } from "@/lib/listings/mallan-source-identity";
import {
  InvalidContinuationError,
  continuationFingerprint,
  decodeContinuation,
  expectedPageFor,
  isContinuationAvailable,
  nextContinuation,
} from "@/lib/search/continuation";
import {
  readOpenHouseMembershipForWindow,
} from "@/lib/search/open-house-provider";
import {
  resolveOpenHouseWindow,
  OpenHouseWindowError,
  type OpenHousePreset,
} from "@/lib/search/open-house-window";
import {
  assembleFinalUniverse,
  CountMeaning,
  MoreResults,
  providerBudgetFor,
} from "@/lib/search/final-universe";
import {
  KeysetPhase,
  keysetResumePredicate,
  phaseODataOrderBy,
  phaseScopeClause,
  resolveSort,
  sortODataClause,
  UnsupportedSortError,
} from "@/lib/search/canonical/sort-contract";
import { UnknownPropertySubTypeError } from "@/lib/search/canonical/property-subtype-contract";
import { UnsupportedStatusCriterionError } from "@/lib/search/canonical/status-token-contract";
import { UnsupportedGeographyError } from "@/lib/search/canonical/geography";
import { hasUsableListingIdentity, mapTrestleToCrmListing } from "@/lib/search/crm-idx-mapper";



/**
 * Fields consumed by authenticated Search.
 *
 * Every entry must exist on live Cotality Property. `cotality:verify` checks this
 * list against live $metadata and fails on drift. ListingKey is load-bearing:
 * live Cotality declares it non-nullable and it is the provider identity used by
 * Media.ResourceRecordKey. ListingId and SourceSystemKey remain separate facts.
 */
export const SEARCH_SELECT_FIELDS = [
  // Provider identity / lineage
  "ListingKey", "ListingId", "SourceSystemKey",

  // Address / geography evidence
  "StreetNumber", "StreetName", "StreetDirPrefix", "StreetDirSuffix",
  "StreetSuffix", "UnitNumber", "City", "CityRegion", "SubdivisionName", "PostalCity",
  "PostalCode", "StateOrProvince", "CountyOrParish", "CrossStreet",
  "Latitude", "Longitude",

  // Classification
  "PropertyType", "PropertySubType", "CommonInterest", "OwnershipType", "NewConstructionYN",

  // Status & dates
  "StandardStatus", "MlsStatus", "ModificationTimestamp", "ListingContractDate",
  "OnMarketDate", "CloseDate", "ClosePrice", "ActivationDate",
  "DaysOnMarket", "CumulativeDaysOnMarket", "OriginalListPrice", "PreviousListPrice",
  "AvailabilityDate", "PriceChangeTimestamp",

  // Pricing / rental
  "ListPrice", "LeaseAmount", "LeaseAmountFrequency",

  // Rooms / size / building evidence
  "BedroomsTotal", "BathroomsFull", "BathroomsHalf", "BathroomsTotalInteger",
  "LivingArea", "LotSizeArea", "YearBuilt", "RoomsTotal", "StoriesTotal",
  "BuildingName", "NumberOfUnitsTotal", "BuildingKeyNumeric",

  // Carrying costs
  "AssociationFee", "AssociationFeeFrequency", "TaxAnnualAmount",

  // Other direct Property facts
  "DownPaymentAssistanceAmount", "DownPaymentAssistanceCount",
  "ListAgentMlsId", "ListAgentFullName", "ListAgentEmail", "ListAgentDirectPhone",
  "ListOfficeMlsId", "ListOfficeName",
  "PhotosCount", "VirtualTourURLBranded", "VirtualTourURLUnbranded",
  // GATE INPUT, not a display field. isParticipantOnly reads Permission for
  // "Private" and isOwnerOptOut reads it for an opt-out token. Without it in
  // this list the gate read undefined and returned displayable — output
  // indistinguishable from a gate that had checked and approved.
  //
  // Live 2026-08-26: multi-enum ListingPermission, 18 members, IDX alone on
  // 591,292 rows. Private and AgentOnly are currently ZERO, so this was a
  // LATENT fail-open rather than an active breach — but a count is a claim
  // about which rows a broker may see, and a gate that cannot read its own
  // input makes that claim unverifiable.
  "Permission",
  "PublicRemarks", "InternetEntireListingDisplayYN", "InternetAddressDisplayYN",
  // All SIX canonical FARE fields. MoveInCostsAmount (Edm.Decimal 14,2) and
  // MoveInCostsComments (Edm.String 1024) were verified live 2026-08-26; both
  // were missing from this select, so the amount a tenant must pay and its
  // explanation were never fetched at all. Not rendered on the Agent grid —
  // carried for downstream tenant-facing outputs.
  "PetsAllowed", "Furnished", "MoveInCosts", "MoveInCostsAmount", "MoveInCostsComments",
  "OngoingFees", "TenantPays", "TenantPaysDescription",

  // Raw fields used by existing authenticated render/detail surfaces. Presence
  // in this list does NOT make them verified Search criteria.
  "ListingAgreement", "LandLeaseYN", "CoolingYN", "GarageYN", "DirectionFaces", "View", "OwnerPays",
  "ArchitecturalStyle", "StructureType", "BusinessType", "AccessibilityFeatures",
  "ExteriorFeatures", "BuildingFeatures", "LaundryFeatures", "SecurityFeatures", "PoolFeatures",
  "PetsAllowedYN", "AvailableLeaseType", "ExistingLeaseType", "ConstructionMaterials",
  "PatioAndPorchFeatures", "AssociationAmenities", "CurrentFinancing",
];

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 100;

function getCached(key: string): unknown | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: unknown): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * A live Cotality Property row must carry ListingKey. If it does not, the row is
 * an integrity failure and cannot enter any broker/client workflow.
 */
export function partitionByListingIdentity(
  records: readonly Record<string, unknown>[],
): { usable: Record<string, unknown>[]; identityless: number } {
  const usable: Record<string, unknown>[] = [];
  let identityless = 0;
  for (const record of records) {
    if (hasUsableListingIdentity(record)) usable.push(record);
    else identityless++;
  }
  return { usable, identityless };
}

/**
 * Exclusion accounting for one traversed prefix.
 *
 * TELEMETRY IS EVIDENCE, so each exclusion class stays separate and the totals
 * balance. `distributionGateFailures` used to be derived as
 * `identified - displayable`, where `displayable` is the count AFTER
 * provider-row dedupe — so every repeated provider row was charged to the
 * distribution gates. A compliance or missing-result investigation reading that
 * would see a gate rejecting rows it never saw.
 *
 * The identity that must hold over the traversed prefix:
 *
 *   providerRowsRead
 *     = identityless + gated + providerDuplicates + finalSurvivorsTraversed
 */
export function searchIntegrityCounts(args: {
  providerRowsFetched: number;
  identityless: number;
  /** Rows that PASSED the gates, counted BEFORE dedupe. */
  gatePassedBeforeDedupe?: number;
  providerDuplicates?: number;
  /** Survivors after the whole chain. */
  displayable: number;
}): {
  providerRowsFetched: number;
  identityFailures: number;
  distributionGateFailures: number;
  providerDuplicates: number;
  finalSurvivorsTraversed: number;
  returnedRows: number;
  balances: boolean;
} {
  const identified = args.providerRowsFetched - args.identityless;
  // Callers predating the split still get the old derivation, which is correct
  // whenever nothing was deduped.
  const gatePassed = args.gatePassedBeforeDedupe ?? args.displayable;
  const duplicates = args.providerDuplicates ?? 0;
  const gateFailures = Math.max(0, identified - gatePassed);
  return {
    providerRowsFetched: args.providerRowsFetched,
    identityFailures: args.identityless,
    distributionGateFailures: gateFailures,
    providerDuplicates: duplicates,
    finalSurvivorsTraversed: args.displayable,
    returnedRows: args.displayable,
    balances:
      args.identityless + gateFailures + duplicates + args.displayable ===
      args.providerRowsFetched,
  };
}

export function idxSearchErrorResponse(error: unknown): {
  status: number;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
} {
  if (error instanceof InvalidContinuationError) {
    // Refused BY NAME rather than silently restarting at page one, which would
    // hand a broker page 1 while the pager says page 40.
    return {
      status: 400,
      body: {
        error: "Invalid search continuation.",
        code: "INVALID_CONTINUATION",
        criterion: "continuation",
        reason: error.reason,
        detail: error.message,
      },
    };
  }

  if (error instanceof UnsupportedSortError) {
    // Same canonical unsupported-criterion protocol: a named 400 the caller can
    // act on, never a silent substitution of a different order.
    return {
      status: 400,
      body: {
        error: "Unsupported sort.",
        code: "UNSUPPORTED_SORT",
        criterion: "sort",
        requested: error.requested,
        supported: [...error.supported],
        detail: error.message,
      },
    };
  }

  if (error instanceof UnsupportedSearchCriterionError) {
    return {
      status: 400,
      body: {
        error: "Unsupported search criterion.",
        code: "UNSUPPORTED_CRITERION",
        criterion: error.criterion,
        unsupportedValues: [...error.unsupportedValues],
      },
    };
  }

  // Checkbox criteria use their own error type so the registry can carry a
  // per-value REASON. It joins the SAME canonical unsupported-criterion protocol
  // rather than inventing a second one — without this it fell through to a
  // generic 502 "Search failed", so the contract's promise to "fail locally by
  // criterion/value name" was not actually kept at the route boundary.
  if (error instanceof UnsupportedCheckboxCriterionError) {
    return {
      status: 400,
      body: {
        error: "Unsupported search criterion.",
        code: "UNSUPPORTED_CRITERION",
        criterion: error.criterion,
        unsupportedValues: [...error.unsupportedValues],
        // The registry's reason travels with it: an unresolved value is a
        // different fact from an invalid one, and the broker needs to know which.
        detail: error.message,
      },
    };
  }

  if (error instanceof UnsupportedStatusCriterionError) {
    return {
      status: 400,
      body: {
        error: "Unsupported search criterion.",
        code: "UNSUPPORTED_CRITERION",
        criterion: "status",
        unsupportedValues: [...error.unsupportedTokens],
      },
    };
  }

  if (error instanceof UnknownPropertySubTypeError) {
    return {
      status: 400,
      body: {
        error: "Unsupported search criterion.",
        code: "UNSUPPORTED_CRITERION",
        criterion: "propertySubType",
        unsupportedValues: [...error.unknownTokens],
      },
    };
  }

  // Geography refuses a borough or neighbourhood with no live Cotality
  // counterpart, so a dead value cannot become a valid-looking filter that
  // matches zero rows under HTTP 200. That refusal was correct and was NOT
  // REACHING THE BROKER: it fell through to the generic 502 below, which invites
  // a retry of the exact action that cannot succeed and discards WHICH of several
  // selected neighbourhoods was the dead one — the only fact the broker needs to
  // fix their own search.
  if (error instanceof UnsupportedGeographyError) {
    return {
      status: 400,
      body: {
        error: "Unsupported search criterion.",
        code: "UNSUPPORTED_CRITERION",
        criterion: error.criterion,
        unsupportedValues: [...error.unsupportedValues],
        // NOT-LIVE AND AMBIGUOUS ARE DIFFERENT FACTS, and the broker's next action
        // differs. A not-live name is a dead end; an ambiguous one is a real
        // Cotality neighbourhood that names more than one place and needs a
        // borough. Both fail closed; only the explanation differs, and telling a
        // broker that Bay Terrace "is not a live Cotality value" sends them to fix
        // the wrong thing.
        refusal: error.refusal,
        options: [...error.options],
        detail: error.message,
      },
    };
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  if (message.includes("429") || message.includes("rate limit")) {
    return {
      status: 503,
      body: { error: "Search temporarily unavailable. Please try again shortly." },
      headers: { "Retry-After": "30" },
    };
  }
  return { status: 502, body: { error: "Search failed. Please try again later." } };
}

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const logger = logFetchAttempt("/api/idx/search");

  try {
    const enabled = process.env.IDX_ENABLED === "true";
    if (!enabled || !hasCredentials()) {
      logger.complete("disabled", "Cotality Search not enabled or missing credentials");
      return NextResponse.json(
        { error: "Search not available", code: "IDX_UNAVAILABLE" },
        { status: 503, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const params = req.nextUrl.searchParams;
    const limit = Math.min(Number(params.get("limit")) || 50, 500);
    const skip = Number(params.get("skip")) || 0;
    // PAGES OF THE FINAL UNIVERSE.
    //
    // `skip` is a PROVIDER offset and stays supported for existing callers, but
    // it cannot express a broker page: gated and deduped rows mean provider
    // offset 50 is not the 51st result. `page` is 1-based over the FINAL
    // universe, so page 2 begins at the 51st row a broker may actually see.
    // An explicit page always wins; otherwise it is derived from skip so the
    // legacy shape keeps working.
    const requestedPage = Number(params.get("page"));
    const page =
      Number.isFinite(requestedPage) && requestedPage >= 1
        ? Math.floor(requestedPage)
        : Math.floor(skip / Math.max(1, limit)) + 1;
    const sort = params.get("sort");

    // SponsorUnitYN is observed inside CustomProperty.CustomFields, not a live
    // Property field. This route does not currently expand a verified
    // CustomProperty contract, so pretending to support this filter would return
    // a page-local/false universe. Fail by name instead.
    if (params.get("sponsorUnit") === "true") {
      throw new UnsupportedSearchCriterionError("sponsorUnit", ["true"]);
    }

    const criteriaFilter = buildCrmIdxODataFilter(params);

    // MALLAN CANONICAL LISTING IDENTITY, applied at the provider boundary.
    //
    // A Mallan-authored listing and the Cotality return-copy of that same
    // listing are ONE canonical Mallan listing. The Mallan-authored row is the
    // canonical, editable identity; the provider copy is a COMPETING listing and
    // is suppressed — by office, and whether or not a matching twin is found.
    // Deduping on ListingKey could never express that: the two rows live in
    // different identity domains and do not share a provider key.
    //
    // Live 2026-08-26: ListOfficeMlsId eq '7041' -> 35 rows on the feed, 2 of
    // them Active. Applying the clause takes Active from 7,863 to 7,861, which
    // is exactly the two Mallan rows and confirms no null-office row is lost —
    // the clause is written as `(office eq null or office ne ...)` precisely
    // because a bare `ne` against null is not reliably inclusive in OData.
    //
    // The clause already existed and had no live-Trestle caller; every consumer
    // was Prisma-side. No new identity system, no schema.
    const returnCopyClause = trestleExcludeMallanReturnCopiesClause();
    const filter = returnCopyClause
      ? `(${criteriaFilter}) and ${returnCopyClause}`
      : criteriaFilter;

    // Sort is part of result identity, so it is a CLOSED CONTRACT rather than a
    // caller-authored $orderby with a silent default. `sort || "Modification-
    // Timestamp desc"` accepted any provider fragment a caller invented, offered
    // DaysOnMarket (which the licence suppresses for ordering, so it 400s the
    // whole search), and mapped "listed" onto ModificationTimestamp, which is a
    // different fact. resolveSort refuses an unrecognised value BY NAME, and
    // sortODataClause appends the ListingKey tie-break — without it, rows
    // sharing a price have no defined order and adjacent pages can repeat one
    // listing while dropping another.
    const resolvedSort = resolveSort(sort);
    const effectiveSort = sortODataClause(resolvedSort.key);
    // PAGE IS PART OF THE CACHE KEY.
    //
    // It was `...:${limit}:${skip}`, and once paging moved to final-universe
    // coordinates `skip` stopped varying between pages — so pages 2 and 3 were
    // served page 1's cached rows. The key must name every input that changes
    // the answer, and `exactCount` changes what `count` MEANS, so it is in here
    // too rather than letting a cheap lower-bound response satisfy a request
    // that asked for an exact total.
    // SEQUENTIAL CONTINUATION.
    //
    // The read budget bounds the WORK of one request. Without a way to resume,
    // it also bounds how much inventory is reachable at all — result 60,001
    // would be permanently invisible, and the authorized provider population is
    // already around 591,000 rows. A continuation lets "Next" pick up where the
    // previous request stopped instead of re-walking the prefix and hitting the
    // same ceiling forever.
    //
    // The token is a POSITION, not an authority: the criteria, the return-copy
    // suppression, the gates and the dedupe are all re-applied here from this
    // request's own parameters, so a continuation can never widen a search or
    // reach a row the caller could not otherwise reach.
    // Page size is part of the sequence identity, so it is bound into the
    // fingerprint: a position captured at 20 rows a page is meaningless at 50.
    const fingerprint = continuationFingerprint(filter, effectiveSort, limit);
    const continuationParam = params.get("continuation");
    const decoded = continuationParam
      ? decodeContinuation(continuationParam, fingerprint)
      : null;

    // THE PAGE IS DERIVED FROM THE SEALED TOKEN, NOT ASSERTED BY THE CALLER.
    //
    // Without this a valid page-1 continuation could be sent with `page=99` and
    // the server would return the next rows and label them page 99. It also
    // keeps an UNFINISHED page on itself: 20 survivors consumed at 50 to a page
    // is still page 1, so assembly continues rather than the caller moving on.
    if (decoded) {
      const expected = expectedPageFor(decoded.survivorsConsumed, limit);
      if (page !== expected) {
        throw new InvalidContinuationError(
          `page ${page} does not match this continuation, which describes page ${expected}`,
        );
      }
    }

    // Carries only what the keyset cannot: how many survivors earlier requests
    // already emitted, and the boundary keys needed to dedupe across the seam.
    // Position itself is the keyset predicate's job.
    const resume = decoded
      ? { survivorsConsumed: decoded.survivorsConsumed, tail: decoded.tail }
      : undefined;

    // The provider query itself is narrowed to "after this position in the
    // order", so a withdrawal or an insertion ahead of the boundary cannot move
    // it — there is no distance-from-the-start left to be invalidated.
    // THE ORDERED BUCKETS OF THIS SORT.
    //
    // Known values in the requested order, then unknown values by ListingKey.
    // That is a Mallan policy, declared — the provider's implicit null
    // placement could not be established live, and guessing it silently drops
    // whichever bucket guessed wrong.
    const sortPhases = [
      {
        label: KeysetPhase.KNOWN as string,
        scope: phaseScopeClause(resolvedSort.key, KeysetPhase.KNOWN),
        orderBy: phaseODataOrderBy(resolvedSort.key, KeysetPhase.KNOWN),
      },
      {
        label: KeysetPhase.NULLS as string,
        scope: phaseScopeClause(resolvedSort.key, KeysetPhase.NULLS),
        orderBy: phaseODataOrderBy(resolvedSort.key, KeysetPhase.NULLS),
      },
    ];

    const startPhaseIndex = decoded
      ? sortPhases.findIndex((p) => p.label === decoded.phase)
      : 0;
    const startPredicate = decoded
      ? keysetResumePredicate(
          decoded.sortKey,
          decoded.phase === "NULLS" ? KeysetPhase.NULLS : KeysetPhase.KNOWN,
          decoded.sortValue,
          decoded.lastListingKey,
        )
      : null;

    const cacheKey = `idx:${filter}:${effectiveSort}:${limit}:${skip}:p${page}:x${params.get("exactCount") === "true" ? 1 : 0}:c${continuationParam ?? ""}`;
    const cached = getCached(cacheKey);
    if (cached) {
      logger.complete("success");
      return NextResponse.json(cached, { headers: { "Cache-Control": "private, no-store" } });
    }

    // THE FINAL SEARCH UNIVERSE, assembled by one owner.
    //
    // This used to fetch `limit` provider rows, drop the identityless and gated
    // ones, and return the survivors alongside `@odata.count` as `total`. Those
    // are two different universes. A live Manhattan Active-residential search
    // matches 4,622 listings; the broker received at most 200 rows and a count
    // that described neither what they were shown nor what actually matched.
    //
    // assembleFinalUniverse owns the chain — identity, then gates, then
    // canonical dedupe — and cuts the page from what SURVIVES, so a gated row
    // pulls the next survivor forward instead of leaving a hole in the page.
    // Property query only: media is loaded by the dedicated media path so this
    // request does not depend on an unverified $expand behavior.
    // ── OPEN HOUSE MEMBERSHIP, SETTLED BEFORE COUNT AND PAGINATION ──
    //
    // This route previously had NO OpenHouse code, and the UI disabled Today /
    // This Weekend / Next 7 / Next 30 / Custom saying the backend did not
    // support it. The provider does: probed live 2026-09-01, the OpenHouse
    // resource answers $count and accepts `OpenHouseDate ge X and le Y`, and
    // OpenHouse.ListingKey reconciles to Property.ListingKey (count 1) and not
    // to Property.ListingId (count 0).
    //
    // Membership is resolved HERE, as a corpus filter, so the count describes
    // the open-house universe and page 4's open houses are reachable. The
    // rejected alternative — cut the page, then intersect — answers only
    // whether the current page happens to contain one.
    const ohPreset = params.get("openHouse");
    const ohFrom = params.get("openHouseDateFrom");
    const ohTo = params.get("openHouseDateTo");
    let openHouseKeys: ReadonlySet<string> | null = null;

    if (ohPreset || ohFrom || ohTo) {
      let window;
      try {
        window = resolveOpenHouseWindow({
          preset: (ohPreset as OpenHousePreset) || "custom",
          from: ohFrom,
          to: ohTo,
        });
      } catch (e) {
        // A window we cannot resolve is REFUSED BY NAME. Running the search
        // without the criterion would silently widen it to every listing.
        if (e instanceof OpenHouseWindowError) {
          logger.complete("error", e.message);
          return NextResponse.json(
            { error: "Unsupported open-house range", criterion: "openHouse", detail: e.message },
            { status: 400, headers: { "Cache-Control": "private, no-store" } },
          );
        }
        throw e;
      }

      const membership = await readOpenHouseMembershipForWindow(window);
      if (membership.state !== "resolved") {
        // FAIL CLOSED. An unresolvable membership set may never become an
        // empty one (which reads as "no open houses") nor be dropped (which
        // returns the UNFILTERED population under an open-house request).
        logger.complete("error", `open house membership unavailable: ${membership.reason}`);
        return NextResponse.json(
          {
            error: "Open house availability could not be established, so no results are shown.",
            criterion: "openHouse",
            detail: membership.reason,
          },
          { status: 503, headers: { "Cache-Control": "private, no-store" } },
        );
      }
      openHouseKeys = membership.listingKeys;
    }

    const universe = await assembleFinalUniverse<Record<string, unknown>>({
      fetchPage: async (
        providerSkip: number,
        top: number,
        ph?: { scope: string; orderBy: string; predicate: string | null },
      ) => {
        // The phase SCOPE and the keyset PREDICATE both narrow the query, so
        // the walk starts at offset 0 of what it actually asked for. The scope
        // is what makes the null bucket reachable at all — without it the
        // traversal ran one unphased query and called its end the end of the
        // provider.
        const clauses = [`(${filter})`];
        if (ph?.scope) clauses.push(ph.scope);
        if (ph?.predicate) clauses.push(ph.predicate);
        const page = await fetchFromTrestle({
          filter: clauses.join(" and "),
          select: SEARCH_SELECT_FIELDS,
          top,
          // The engine walks the provider from the top and cuts the broker's
          // page out of what SURVIVES. Adding `skip` here as well would page
          // twice — once in provider coordinates and once in final-universe
          // coordinates — and silently step over rows. `skip` is honoured by
          // being folded into `page` above, not by offsetting the walk.
          skip: providerSkip,
          orderby: ph?.orderBy || effectiveSort,
          maxTotal: top,
          count: true,
          expandMedia: false,
          // CustomProperty carries the financing observation.
          //
          // `MaximumFinancingPercent` is not a Property field — it is a key
          // inside `CustomProperty.CustomFields`, a declared nullable Edm.String.
          // Without this expansion the authenticated Search path never RECEIVES
          // it, so the criterion could not execute no matter how the client was
          // wired: the census traced the break to exactly here.
          //
          // The expand is bare `CustomProperty`. The inner
          // `$select=DownPaymentAssistance…,CustomFields` form is what Trestle
          // rejected with HTTP 400 in the 2026-05-15 production logs, so the
          // opt-in deliberately asks for the whole entity and the mapper stays
          // defensive about which fields come back.
          expandCustomProperty: true,
        });
        return {
          records: page.records,
          providerMatched: page.odataCount ?? null,
          // ABSENCE OF A nextLink, not `hasMore`.
          //
          // fetchFromTrestle returns `hasMore || allRecords.length >= maxTotal`,
          // and that second clause fires whenever a page happens to fill
          // exactly — 50 rows out of a 50-row universe reports "more". Using it
          // here would make an EXACT count almost unreachable. `nextLink` is
          // the provider's own statement that something follows, so its absence
          // is the only honest licence for EXACT.
          exhausted: !page.nextLink,
        };
      },
      // The identity predicate the rest of the codebase already uses, rather
      // than a second opinion about what a usable ListingKey is.
      identity: (record: Record<string, unknown>) =>
        hasUsableListingIdentity(record) ? String(record.ListingKey ?? "") : null,
      gate: (record: Record<string, unknown>) => checkDistributionGates(record),
      // PROVIDER-ROW identity only. Two Cotality rows carrying the same
      // ListingKey are one provider row and the repeat is dropped. This is not
      // Mallan canonical reconciliation, which is handled above by suppressing
      // Mallan-office return-copies at the provider boundary.
      providerRowKey: (record: Record<string, unknown>) => String(record.ListingKey ?? ""),
      // Membership by the PROVIDER-VERIFIED identity. OpenHouse.ListingKey
      // reconciles to Property.ListingKey; a listing holding both a Saturday
      // and a Sunday open house is ONE member of the set, so this is a set
      // test rather than a join and cannot duplicate the property.
      corpusFilter: openHouseKeys
        ? (record: Record<string, unknown>) => openHouseKeys.has(String(record.ListingKey ?? ""))
        : undefined,
      page,
      pageSize: limit,
      // SCALED TO THE REQUESTED PAGE, not a flat ceiling.
      //
      // A fixed 1,000-row budget made deep pages unreachable: a universe of
      // 4,622 matches could honestly report "1000+ Results" and never return
      // result 1,001, because page 21 at 50 rows a page needs the 1,001st
      // survivor and the request was forbidden from reading that far. A read
      // budget may bound work per request; it may not become a hidden maximum
      // searchable inventory.
      providerBudget: providerBudgetFor(page, limit),
      // A page read, not a census. An exact count over 4,622 rows costs ~93
      // provider round trips, so it is opt-in per request rather than charged
      // to every search; `countMeaning` tells the caller which one they hold.
      exactCount: params.get("exactCount") === "true",
      resume,
      phases: sortPhases,
      startPhaseIndex: startPhaseIndex < 0 ? 0 : startPhaseIndex,
      startPredicate,
    });

    const identityless = universe.exclusions.identityless;
    if (identityless > 0) {
      console.error(`[Cotality Search] INTEGRITY: ${identityless} Property row(s) missing required ListingKey were excluded.`);
    }
    const gateBlockedReasons = universe.exclusions.gated;
    const result = {
      records: universe.rows,
      odataCount: universe.providerMatched ?? undefined,
      hasMore: universe.hasMore,
      totalFetched: universe.providerRowsRead,
    };

    // Search GET is read-only. It no longer mutates the Building workspace as a
    // side effect. Building projection/writes belong to their explicit writer.
    const listings = universe.rows.map((record, i) => mapTrestleToCrmListing(record, (page - 1) * limit + i));

    const response = {
      listings,
      // THE COUNT CARRIES ITS OWN MEANING.
      //
      // `total` and `totalCount` used to be `@odata.count` — the PROVIDER
      // matching universe, before identity, gates and dedupe removed rows. That
      // is a different set from the one the broker may see, so it could never
      // be a result count. They now describe the FINAL universe, and `count`
      // below says whether that number is exact or a declared floor. A bare
      // number cannot say which it is, and an approximation that looks exact is
      // the one answer this route will not give.
      total: universe.count,
      totalCount: universe.count,
      count: {
        value: universe.count,
        meaning: universe.countMeaning,
        isExact: universe.countMeaning === CountMeaning.EXACT,
        /**
         * `@odata.count` FOR THE QUERY THAT WAS ACTUALLY RUN.
         *
         * On an initial request that is the provider matching universe. On a
         * RESUMED request the query is narrowed by the phase scope and the
         * keyset predicate, so the same number describes the remainder after
         * the boundary — a different fact under the same name.
         *
         * Both are reported, and only where each is actually known. Carrying an
         * initial count forward in a token would describe the observation at
         * the moment it was taken, not a current total, on a feed that moves.
         */
        providerMatchedForThisQuery: universe.providerMatched,
        originalProviderMatched: decoded ? null : universe.providerMatched,
        remainingAfterBoundary: decoded ? universe.providerMatched : null,
        truncatedAtBudget: universe.truncatedAtBudget,
        more: universe.more,
        /** NULL when the traversal stopped early — see totalPages below. */
        totalPagesKnown: universe.totalPages !== null,
        providerRowsRead: universe.providerRowsRead,
        excluded: universe.exclusions,
      },
      page,
      pageSize: limit,
      // NULL when the count is a LOWER BOUND. "1000+ Results / Page 1 of 5" is
      // a self-contradiction, so the last page number is withheld until an
      // exhausted traversal proves it and navigation stays open-ended.
      // CAPABILITY, STATED. A client must never assume deep continuation exists
      // merely because the code supports it: the sealing secret is a protected
      // env requirement and is not set.
      continuationAvailable: isContinuationAvailable(),
      continuationMode: isContinuationAvailable() ? "keyset" : "bounded_rescan",
      // WHAT PAGING THROUGH THIS UNIVERSE ACTUALLY GUARANTEES.
      //
      // Stated in the response rather than assumed, because the honest answer
      // depends on something Mallan does not control. Verified live 2026-08-26:
      // the Cotality service exposes EntitySets only — no $delta, no
      // deltatoken, no snapshot endpoint — and @odata.nextLink is a plain
      // `$skip=N`. Snapshot isolation is UNAVAILABLE from this provider.
      //
      // Keyset removes distance-from-start instability. It cannot freeze a live
      // feed, and no cursor design can.
      consistency: {
        stableUniverse: "no duplicates, no gaps",
        mutatingUniverse:
          "live-moving universe; a row whose sort value moves behind the " +
          "boundary is missed and one that moves ahead may repeat",
        providerSnapshotIsolation: "UNAVAILABLE",
        selectionsAreDurableBy: "ListingKey",
      },
      totalPages: universe.totalPages,
      // Fail-SAFE: true whenever more results MAY exist, including the
      // unresolved case. `more` carries the precise state, and no client may
      // turn UNKNOWN into "no listings found".
      hasMore: universe.hasMore,
      more: universe.more,
      // Whether THIS page was finished. A short page because the budget ended
      // is not the same claim as a short page because the universe ended, and a
      // client must finish the first before advancing.
      pageCompleteness: universe.pageCompleteness,
      hasPrevious: universe.hasPrevious,
      // The position the NEXT request should send. Absent once the provider is
      // exhausted — there is nothing left to resume.
      // FAIL-CLOSED: no token at all unless it can be SEALED. An unsigned
      // position that a caller can edit and re-encode is not a validated
      // continuation, and offering one while calling it validated is the kind of
      // claim this codebase keeps removing. Without the secret, deep traversal
      // falls back to the bounded rescan.
      continuation:
        !isContinuationAvailable() ||
        universe.more === MoreResults.NO ||
        universe.rows.length === 0
          ? null
          : nextContinuation({
              fingerprint,
              sortKey: resolvedSort.key,
              // The boundary value comes from the RAW provider record, never a
              // mapped or formatted one — it is written straight back into an
              // OData filter, and a value that has been through a renderer is a
              // different value.
              // The phase the BOUNDARY ROW is in, as the engine reports it —
              // a page can cross the bucket boundary, so deriving it from the
              // row's value alone would be right by luck rather than by design.
              phase: sortPhases[universe.boundaryPhaseIndex]?.label ?? "KNOWN",
              sortValue:
                universe.boundaryRow == null
                  ? null
                  : ((universe.boundaryRow[resolvedSort.spec.cotalityField] ?? null) as
                      | string
                      | number
                      | null),
              lastListingKey: String(universe.boundaryRow?.ListingKey ?? ""),
              survivorsConsumed: universe.survivorsConsumedBefore + universe.rows.length,
              pageRowKeys: universe.pageRowKeys,
              previousTail: resume?.tail,
            }),
      skip,
      limit,
      attribution: generateAttributionText(),
      mediaMode: "lazy" as const,
      _meta: {
        source: "cotality",
        fetchedAt: new Date().toISOString(),
        filter,
        sort: effectiveSort,
        // `totalFromAPI` used to sit here holding rows READ, not the
        // provider's total. A telemetry name describing the wrong number is how
        // a bounded read gets mistaken for a complete one, so the count is now
        // reported once, under providerRowsRead, by the accounting block below.
        odataCount: result.odataCount,
        ...(() => {
          // SEGMENT vs CUMULATIVE. providerRowsRead describes THIS segment,
          // while universe.count is cumulative — it includes the survivors
          // earlier requests already emitted. Feeding both into one accounting
          // identity makes it fail on every resumed request even when Search is
          // perfectly correct, which would train a reader to ignore it.
          const segmentSurvivors = universe.count - universe.survivorsConsumedBefore;
          const c = searchIntegrityCounts({
            providerRowsFetched: universe.providerRowsRead,
            identityless,
            gatePassedBeforeDedupe: universe.gatePassedBeforeDedupe,
            providerDuplicates: universe.exclusions.providerDuplicates,
            displayable: segmentSurvivors,
          });
          return {
            gatedOut: c.distributionGateFailures,
            identityless: c.identityFailures,
            // UNDER ITS OWN NAME. These used to be folded into gatedOut,
            // because the derivation subtracted a POST-dedupe count from the
            // identified rows — so the distribution gates took credit for
            // rejecting rows they never saw.
            providerDuplicates: c.providerDuplicates,
            // Named for what they are. The identity balances over the SEGMENT:
            //   segmentProviderRowsRead
            //     = identityless + gated + providerDuplicates + segmentSurvivors
            segmentSurvivorsTraversed: c.finalSurvivorsTraversed,
            segmentProviderRowsRead: c.providerRowsFetched,
            // The running lower bound across every segment so far — a different
            // number answering a different question.
            cumulativeSurvivorsObserved: universe.count,
            survivorsConsumedBefore: universe.survivorsConsumedBefore,
            rowsReturnedThisResponse: universe.rows.length,
            exclusionsBalance: c.balances,
          };
        })(),
        // CORRECTED. `total` on the response IS the final universe now; it is
        // `count.providerMatched` that remains pre-Mallan. Leaving this flag
        // saying otherwise would have a reader distrust the one number that
        // became trustworthy.
        providerMatchedIsPreFinalUniverse: true,
        mediaStrategy: "lazy" as const,
      },
    };

    setCache(cacheKey, response);

    const imagesWithMedia = listings.filter(
      (l) => Array.isArray((l as { images?: unknown[] }).images) && ((l as { images?: unknown[] }).images?.length ?? 0) > 0,
    ).length;
    console.log(
      JSON.stringify({
        evt: "cotality_search_telemetry",
        ts: new Date().toISOString(),
        params_keys: Array.from(params.keys()).sort(),
        type_value: params.get("type") || null,
        status_value: params.get("status") || null,
        ownership_value: params.get("ownership") || null,
        propertySubType_value: params.get("propertySubType") || null,
        minBeds_value: params.get("minBeds") || params.get("beds") || null,
        maxBeds_value: params.get("maxBeds") || null,
        minBaths_value: params.get("minBaths") || null,
        maxBaths_value: params.get("maxBaths") || null,
        minPrice_value: params.get("minPrice") || null,
        maxPrice_value: params.get("maxPrice") || null,
        has_neighborhood: !!params.get("neighborhood"),
        has_borough: !!params.get("borough"),
        has_address: !!params.get("address"),
        has_keyword: !!params.get("keyword"),
        has_zip: !!params.get("zip"),
        has_listing_id: !!params.get("listingId"),
        has_buildingName: !!params.get("buildingName"),
        has_unit: !!params.get("unit"),
        has_managementCompany: !!params.get("managementCompany"),
        has_checkboxFilters: !!params.get("checkboxFilters"),
        limit,
        skip,
        filter_length: filter.length,
        // EVERY NAME HERE HAS ONE MEANING.
        //
        // `provider_rows` used to hold `result.records.length`, which is
        // FINAL-UNIVERSE rows after the whole chain, not provider rows.
        // `gate_passed` used to hold `universe.count`, which is CUMULATIVE
        // across resumed segments, not what this request's gates passed. Both
        // names described the wrong number, which is worse than no telemetry:
        // an investigation reads them as fact.
        segment_provider_rows_read: universe.providerRowsRead,
        segment_identityless: identityless,
        segment_gated: Object.values(gateBlockedReasons).reduce((a, b) => a + b, 0),
        segment_provider_duplicates: universe.exclusions.providerDuplicates,
        segment_survivors_traversed: universe.count - universe.survivorsConsumedBefore,
        cumulative_survivors_observed: universe.count,
        rows_returned_this_response: universe.rows.length,
        // @odata.count for the query ACTUALLY RUN — narrowed on a resume.
        provider_matched_for_this_query: result.odataCount ?? null,
        gate_blocked_by_reason: gateBlockedReasons,
        mapper_returned: listings.length,
        listings_with_images: imagesWithMedia,
        listings_without_images: listings.length - imagesWithMedia,
      }),
    );

    logger.complete("success");
    return NextResponse.json(response, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const mapped = idxSearchErrorResponse(error);
    logger.complete("error", message);
    if (mapped.status !== 400) console.error("[Cotality Search] Error:", message);
    return NextResponse.json(mapped.body, {
      status: mapped.status,
      headers: { "Cache-Control": "private, no-store", ...(mapped.headers ?? {}) },
    });
  }
}
import { UnsupportedCheckboxCriterionError } from "@/lib/search/canonical/checkbox-criteria";
