import { NextResponse } from 'next/server';
import { fetchFromTrestle } from '@/lib/idx/fetch';
import { checkDistributionGates } from '@/lib/idx/trestle-mapper';
import { isMallanRlsReturnCopy } from "@/lib/listings/mallan-source-identity";
import {
  classifySuggestQuery,
  isAddressDisplayablePerSuggest,
} from '@/lib/search/suggest-classify';
import prisma from '@/lib/prisma';
import { professionalTitle } from '@/lib/agents/professional-title';

// Neighborhood data for local matching (loaded once at module level)
import manhattanData from '@/data/manhattan-neighborhoods.json';
import brooklynData from '@/data/brooklyn-neighborhoods.json';
import queensData from '@/data/queens-neighborhoods.json';
import bronxData from '@/data/bronx-neighborhoods.json';
import statenIslandData from '@/data/staten-island-neighborhoods.json';

type NeighborhoodRow = { slug?: string; id?: string; name: string };

const ALL_NEIGHBORHOODS: { slug: string; name: string; borough: string }[] = [
  ...manhattanData.neighborhoods.map((n: NeighborhoodRow) => ({ slug: n.slug || n.id || '', name: n.name, borough: 'Manhattan' })),
  ...brooklynData.neighborhoods.map((n: NeighborhoodRow) => ({ slug: n.slug || n.id || '', name: n.name, borough: 'Brooklyn' })),
  ...queensData.neighborhoods.map((n: NeighborhoodRow) => ({ slug: n.slug || n.id || '', name: n.name, borough: 'Queens' })),
  ...bronxData.neighborhoods.map((n: NeighborhoodRow) => ({ slug: n.slug || n.id || '', name: n.name, borough: 'Bronx' })),
  ...statenIslandData.neighborhoods.map((n: NeighborhoodRow) => ({ slug: n.slug || n.id || '', name: n.name, borough: 'Staten Island' })),
];

/**
 * Simple in-memory rate limiter (60 requests per minute per IP)
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

/**
 * PR-S.1c + PR-S.1d (2026-05-15) — minimal `$select` for suggest's Trestle calls.
 *
 * Default `fetchFromTrestle()` pulls all 902 `IDX_PLUS_SELECT_FIELDS`. For
 * autocomplete that's wasteful (latency + payload bloat). We only need:
 *   - Gate fields (so `checkDistributionGates(raw)` and the secondary
 *     address-suppression check can evaluate correctly)
 *   - Identifier fields (`ListingId`, `ListingKey`)
 *   - Address components used to build the suggestion label
 *
 * Gate-input audit (vs `lib/compliance/gates.ts` `evaluateDisplayGate`,
 * via `checkDistributionGates` wrapper in `lib/idx/trestle-mapper.ts`):
 *
 *   - `Permission`                       → `isOwnerOptOut`, `isParticipantOnly`
 *   - `StandardStatus`                   → `readStatus`, terminal-status gate
 *   - `MlsStatus`                        → `readStatus` + `OwnerOptOut` sentinel
 *   - `InternetEntireListingDisplayYN`   → Gate 3 (entire-listing display)
 *   - `InternetAddressDisplayYN`         → Gate 4 (address display)
 *   - `CloseDate`                        → Gate 5 (closed past 24h) +
 *                                          `isClosedWithin24Hours` 24h grace
 *   - `ActivationDate`                   → Coming Soon badge (status path)
 *
 * PR-S.1d (2026-05-15): Codex review on PR #127 caught the missing
 * `CloseDate`. Without it, terminal-status listing-id suggestions could
 * either over-display past-24h closes OR under-display within-24h closes
 * because `evaluateDisplayGate` would see `rawDate === undefined` and treat
 * the row as "not closed at all" — silently mis-classifying §2.05 windows.
 *
 * Exported so tests can pin the gate-field coverage as a hard guarantee
 * against future drift. Next.js App Router ignores non-handler exports
 * from route files at runtime.
 */
export const SUGGEST_SELECT_FIELDS = [
  // Identifiers
  'ListingId',
  'ListingKey',
  // Distribution-gate inputs (see REBNY compliance §2 + gates.ts above)
  'StandardStatus',
  'MlsStatus',
  'Permission',
  'InternetEntireListingDisplayYN',
  'InternetAddressDisplayYN',
  // AUTHORITATIVE LIST-SIDE IDENTITY. Required to recognise a Mallan RLS
  // return-copy (CHARTER Section 1A). Without this field the route cannot
  // classify provenance at all and would suggest Mallan's own returned Cotality
  // row as a public listing. Never inferred from brokerage-name text.
  'ListOfficeMlsId',
  'CloseDate',
  'ActivationDate',
  // Address components used in suggestion labels
  'StreetNumber',
  'StreetDirPrefix',
  'StreetName',
  'StreetSuffix',
  'StreetDirSuffix',
  'PostalCode',
  'CountyOrParish',
  'CityRegion',
  // Used by the text-search OData filter (BuildingName) — kept in select so
  // future label use does not break.
  'BuildingName',
];

export type SuggestionType = 'address' | 'neighborhood' | 'zip' | 'agent' | 'listing';

export interface Suggestion {
  type: SuggestionType;
  label: string;
  sublabel: string;
  value: string;
}

/**
 * PR-S.1b (2026-05-15) — observability for the suggest endpoint's Trestle
 * fetch failures.
 *
 * Logs ONLY safe diagnostic fields: branch label, truncated query, error
 * name/message, HTTP status (parsed from the error message when fetch.ts
 * formats it as "(NNN)"), and the Trestle endpoint host (parsed via URL —
 * never the full tokenized URL).
 *
 * NEVER logs: access tokens, client secrets, full Authorization headers,
 * env-var values, or user PII.
 *
 * Pure observability — does not change response behavior. Replaces the two
 * previously-silent inner catch blocks in the route. Output goes to
 * console.error → Vercel Function logs.
 */
function logSuggestTrestleError(
  branch: 'listing-id' | 'zip' | 'address' | 'text',
  query: string,
  error: unknown,
): void {
  const err = error instanceof Error ? error : new Error(String(error));
  // fetch.ts formats upstream errors as e.g. "[IDX Fetch] Trestle API error after token refresh (401)".
  // Best-effort status extraction; null when no parenthesized 3-digit code present.
  const statusMatch = err.message.match(/\((\d{3})\)/);
  const trestleBase =
    process.env.TRESTLE_API_URL ||
    process.env.IDX_ENDPOINT ||
    'https://api.cotality.com/trestle';
  let host = 'trestle';
  try {
    host = new URL(trestleBase).host;
  } catch {
    // Keep the safe default if env value is malformed.
  }
  console.error('[suggest] Trestle fetch failed', {
    branch,
    query: query.slice(0, 80),
    errorName: err.name,
    errorMessage: err.message.slice(0, 240),
    httpStatus: statusMatch ? Number(statusMatch[1]) : null,
    host,
  });
}

/**
 * GET /api/listings/suggest?q=...
 *
 * Unified autocomplete for frontend search.
 * Searches across: address, neighborhood, zip, agent (Mallan only), Web #, RLS #, Listing #.
 * Returns top 8 categorized suggestions.
 *
 * COMPLIANCE: Distribution gates enforced. No agent PII from Trestle. No listing agent info.
 * Agents returned are Mallan brokerage agents only (from DB, not MLS).
 */
export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { success: false, error: 'Rate limit exceeded.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim();

    if (!query || query.length < 2) {
      return NextResponse.json({ success: true, suggestions: [] });
    }

    const suggestions: Suggestion[] = [];
    const queryLower = query.toLowerCase();

    // ── 1. Borough matches (local, instant) ──
    const BOROUGHS = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'];
    for (const b of BOROUGHS) {
      if (b.toLowerCase().includes(queryLower)) {
        suggestions.push({
          type: 'neighborhood',
          label: b,
          sublabel: 'Borough',
          value: b, // full name — search page routes to ?borough=
        });
      }
    }

    // ── 2. Neighborhood matches (local, instant) ──
    const neighborhoodMatches = ALL_NEIGHBORHOODS.filter(
      (n) => n.name.toLowerCase().includes(queryLower)
    ).slice(0, 3);

    for (const n of neighborhoodMatches) {
      suggestions.push({
        type: 'neighborhood',
        label: n.name,
        sublabel: n.borough,
        value: n.name, // full name — API filters CityRegion by name
      });
    }

    // ── 2. Agent matches (DB, Mallan agents only) ──
    try {
      const agents = await prisma.agent.findMany({
        where: {
          status: 'active',
          OR: [
            { full_name: { contains: query, mode: 'insensitive' } },
            { first_name: { contains: query, mode: 'insensitive' } },
            { last_name: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: {
          public_slug: true,
          full_name: true,
          first_name: true,
          last_name: true,
          title: true,
          // The LICENCE CLASS alone DERIVES the designation. Without it the
          // route had to guess, and its guess was the salesperson default.
          // `role` is an authorisation grant and is NOT an identity input.
          license_type: true,
        },
        take: 2,
      });

      for (const a of agents) {
        const name = a.full_name || `${a.first_name} ${a.last_name}`;
        const slug = a.public_slug || `${a.first_name}-${a.last_name}`.toLowerCase().replace(/\s+/g, '-');
        // Derived through the ONE title authority, never defaulted.
        //
        // This read `a.title || 'Licensed Real Estate Salesperson'`, so an
        // agent whose stored title was empty was published to this PUBLIC
        // autocomplete as a salesperson — including a NY Associate Broker, who
        // holds a BROKER licence. That is a false statement about a licensee
        // under NY DOS 19 NYCRR 175.25, and it is a second title authority: a
        // designation asserted here that nothing in the Agent record supports.
        //
        // professionalTitle() returns '' when neither the licence class nor a
        // stored title resolves one, and the sub-label then renders as nothing
        // — every consumer already guards on `suggestion.sublabel &&`. Saying
        // nothing is correct; inventing a designation is not. The field stays a
        // required string so the shared Suggestion contract is untouched.
        suggestions.push({
          type: 'agent',
          label: name,
          sublabel: professionalTitle(a),
          value: slug,
        });
      }
    } catch {
      // DB unavailable — skip agent results
    }

    // ── 3. Listing ID matches (Web #, RLS #, Listing #) ──
    // PR-S.1 (2026-05-14): listing-ID detection moved to lib/search/suggest-classify.ts.
    // Previously `/^(RLS|rls)?\d{3,}$/` over-matched: any 3+ digit pure numeric
    // (e.g., "425") was classified as a listing ID and skipped the address-search
    // branch. Now requires explicit RLS prefix OR alphanumeric form.
    const classification = classifySuggestQuery(query);
    const isListingId = classification.isListingId;

    const useIDX = process.env.IDX_ENABLED === 'true';

    if (isListingId && useIDX) {
      try {
        const escapedQuery = query.replace(/'/g, "''");
        // Search by ListingId (Web #) or ListingKey (RLS/SourceSystemKey).
        // PR-S.1c (2026-05-15): explicit minimal $select; default expandMedia=false.
        const result = await fetchFromTrestle({
          filter: `(ListingId eq '${escapedQuery}' or ListingKey eq '${escapedQuery}')`,
          select: SUGGEST_SELECT_FIELDS,
          top: 3,
          maxTotal: 3,
        });

        for (const raw of result.records) {
          const gates = checkDistributionGates(raw);
          if (!gates.displayable) continue;
          // PR-S.1 (2026-05-14): InternetAddressDisplayYN is provider-gated by REBNY.
          // Null = REBNY pre-filter passed = displayable. Only explicit false
          // suppresses. See lib/search/suggest-classify.ts and the
          // 2026-04-30 IDX-Plus pre-filter learning in REBNY skill §2.1.1.
          if (!isAddressDisplayablePerSuggest(raw.InternetAddressDisplayYN)) continue;

          const streetNumber = String(raw.StreetNumber || '');
          const streetName = [raw.StreetDirPrefix, raw.StreetName, raw.StreetSuffix, raw.StreetDirSuffix]
            .filter(Boolean).map(String).join(' ');
          const fullAddress = `${streetNumber} ${streetName}`.trim();
          const listingId = String(raw.ListingId || '');

          const county = String(raw.CountyOrParish || '').toLowerCase();
          let borough = String(raw.CountyOrParish || '');
          if (county.includes('new york')) borough = 'Manhattan';
          else if (county.includes('kings')) borough = 'Brooklyn';
          else if (county.includes('queens')) borough = 'Queens';
          else if (county.includes('bronx')) borough = 'Bronx';
          else if (county.includes('richmond')) borough = 'Staten Island';

          suggestions.push({
            type: 'listing',
            label: fullAddress || `Listing ${listingId}`,
            sublabel: `${borough}${raw.PostalCode ? ` ${raw.PostalCode}` : ''} — ${listingId}`,
            value: listingId,
          });
        }
      } catch (error) {
        // PR-S.1b: was silently swallowed; now logged for diagnosis.
        // Response continues — listing-id results are skipped, other branches remain.
        logSuggestTrestleError('listing-id', query, error);
      }
    }

    // ── 4. Address / Zip search (Trestle IDX) ──
    if (useIDX && suggestions.length < 8) {
      // PR-S.1: ZIP detection moved to lib/search/suggest-classify.ts.
      // Previously `/^\d{3,5}$/` matched "425" (3 digits) and routed it to
      // a ZIP-prefix search that returned 0 (no NYC ZIP starts with "425").
      // Now restricted to exactly 5 digits.
      const isZip = classification.isZip;
      const isPureNumeric = classification.isPureNumeric;
      const escapedQuery = query.replace(/'/g, "''");

      const filterParts = [
        "(StandardStatus eq 'Active' or StandardStatus eq 'ComingSoon' or StandardStatus eq 'ActiveUnderContract')",
      ];

      if (isZip) {
        filterParts.push(`startswith(PostalCode, '${escapedQuery}')`);
      } else if (!isListingId) {
        // Address search — split into StreetNumber + StreetDirPrefix + StreetName
        // Trestle stores these as separate fields, not one combined string.
        // Uses tolower() for case-insensitive OData matching.
        const rawAddr = query.trim();

        function stripSuffix(s: string): string {
          return s.replace(/\s+(STREET|ST|AVENUE|AVE|BOULEVARD|BLVD|PLACE|PL|DRIVE|DR|ROAD|RD|LANE|LN|WAY|COURT|CT)\s*$/i, '').trim();
        }
        function stripOrdinal(s: string): string {
          return s.replace(/(\d+)(ST|ND|RD|TH)\b/gi, '$1').trim();
        }
        function odataSafe(s: string): string {
          return s.toLowerCase().replace(/'/g, "''");
        }

        const dirWithNum = rawAddr.match(/^(\d+)\s+(E|W|N|S|EAST|WEST|NORTH|SOUTH)\.?\s+(.*)/i);
        const dirNoNum = rawAddr.match(/^(E|W|N|S|EAST|WEST|NORTH|SOUTH)\.?\s+(.*)/i);
        const numOnly = rawAddr.match(/^(\d+)\s+(.*)/);

        if (dirWithNum) {
          const streetNum = dirWithNum[1];
          const dir = dirWithNum[2].charAt(0).toUpperCase();
          const street = odataSafe(stripOrdinal(stripSuffix(dirWithNum[3])));
          const conds = [`startswith(StreetNumber,'${streetNum}')`, `StreetDirPrefix eq '${dir}'`];
          if (street) conds.push(`contains(tolower(StreetName),'${street}')`);
          filterParts.push(`(${conds.join(' and ')})`);
        } else if (dirNoNum) {
          const dir = dirNoNum[1].charAt(0).toUpperCase();
          const street = odataSafe(stripOrdinal(stripSuffix(dirNoNum[2])));
          const conds = [`StreetDirPrefix eq '${dir}'`];
          if (street) conds.push(`contains(tolower(StreetName),'${street}')`);
          filterParts.push(`(${conds.join(' and ')})`);
        } else if (numOnly && numOnly[1]) {
          const streetNum = numOnly[1];
          const street = odataSafe(stripOrdinal(stripSuffix(numOnly[2] || '')));
          if (street) {
            filterParts.push(`(startswith(StreetNumber,'${streetNum}') and contains(tolower(StreetName),'${street}'))`);
          } else {
            filterParts.push(`startswith(StreetNumber,'${streetNum}')`);
          }
        } else if (isPureNumeric) {
          // PR-S.1: standalone numeric (e.g., "425", "4259") — search by
          // StreetNumber prefix. Previously fell through to the text-only
          // branch which searched StreetName for the digits (always missed
          // because StreetName never contains the street number).
          filterParts.push(`startswith(StreetNumber,'${escapedQuery}')`);
        } else {
          // Text only — street name or building name
          const cleaned = odataSafe(stripSuffix(rawAddr));
          if (cleaned) {
            filterParts.push(`(contains(tolower(StreetName),'${cleaned}') or contains(tolower(BuildingName),'${cleaned}'))`);
          }
        }
      } else {
        // Skip address search for listing IDs — already handled above
      }

      if (!isListingId || isZip) {
        try {
          // PR-S.1c (2026-05-15): explicit minimal $select; default expandMedia=false.
          const result = await fetchFromTrestle({
            filter: filterParts.join(' and '),
            select: SUGGEST_SELECT_FIELDS,
            top: 20,
            maxTotal: 20,
          });

          const displayable = result.records.filter(
            (raw) =>
              checkDistributionGates(raw).displayable &&
              // MALLAN RLS RETURN-COPY SUPPRESSION — CHARTER Section 1A.
              // Mallan's own returned Cotality row is not the public canonical
              // listing, so it must never be suggested. Third-party IDX
              // suggestions are unaffected: the classifier fails closed on
              // SUPPRESSION, so an absent/blank office id stays visible.
              !isMallanRlsReturnCopy({
                listing_id: raw.ListingId ? String(raw.ListingId) : null,
                list_office_mls_id: raw.ListOfficeMlsId ? String(raw.ListOfficeMlsId) : null,
                rls_eligible: true,
              })
          );

          const seen = new Set<string>();

          for (const raw of displayable) {
            if (suggestions.length >= 8) break;

            const streetNumber = String(raw.StreetNumber || '');
            const streetName = [raw.StreetDirPrefix, raw.StreetName, raw.StreetSuffix, raw.StreetDirSuffix]
              .filter(Boolean).map(String).join(' ');
            const fullAddress = `${streetNumber} ${streetName}`.trim();

            // PR-S.1 (2026-05-14): provider-gated. Null = REBNY pre-filter
            // passed = displayable; only explicit false suppresses. Mirrors
            // the writer policy at lib/idx/trestle-mapper.ts:834.
            if (!isAddressDisplayablePerSuggest(raw.InternetAddressDisplayYN)) continue;

            const key = `${fullAddress}-${raw.PostalCode}`;
            if (seen.has(key)) continue;
            seen.add(key);

            const county = String(raw.CountyOrParish || '').toLowerCase();
            let borough = String(raw.CountyOrParish || '');
            if (county.includes('new york')) borough = 'Manhattan';
            else if (county.includes('kings')) borough = 'Brooklyn';
            else if (county.includes('queens')) borough = 'Queens';
            else if (county.includes('bronx')) borough = 'Bronx';
            else if (county.includes('richmond')) borough = 'Staten Island';

            const neighborhood = String(raw.CityRegion || '');

            if (isZip) {
              suggestions.push({
                type: 'zip',
                label: `${raw.PostalCode}${neighborhood ? ` — ${neighborhood}` : ''}`,
                sublabel: borough,
                value: String(raw.PostalCode || ''),
              });
              // Deduplicate zip results
              seen.add(`zip-${raw.PostalCode}`);
            } else {
              suggestions.push({
                type: 'address',
                label: fullAddress,
                sublabel: `${neighborhood ? `${neighborhood}, ` : ''}${borough}${raw.PostalCode ? ` ${raw.PostalCode}` : ''}`,
                value: fullAddress,
              });
            }
          }
        } catch (error) {
          // PR-S.1b: was silently swallowed; now logged for diagnosis.
          // Response continues — local/dictionary suggestions remain in the array.
          const branch: 'zip' | 'address' | 'text' =
            isZip ? 'zip' : /^\d/.test(query) ? 'address' : 'text';
          logSuggestTrestleError(branch, query, error);
        }
      }
    }

    // Deduplicate and limit to 8
    const uniqueSuggestions: Suggestion[] = [];
    const seenKeys = new Set<string>();
    for (const s of suggestions) {
      const key = `${s.type}-${s.value}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      uniqueSuggestions.push(s);
      if (uniqueSuggestions.length >= 8) break;
    }

    return NextResponse.json(
      { success: true, suggestions: uniqueSuggestions },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        },
      }
    );
  } catch (error) {
    console.error('[/api/listings/suggest] Error:', error);
    return NextResponse.json(
      { success: true, suggestions: [] },
      { status: 200 }
    );
  }
}
