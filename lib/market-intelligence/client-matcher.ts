/**
 * Market Intelligence — Client Matcher
 *
 * Matches Trestle listings to client preferences from the DB.
 * Used by auto-send engine and the "My Market" dashboard.
 *
 * COMPLIANCE:
 * - Respects distribution gates (IDX display, owner opt-out, etc.) for client-facing sends
 * - No compensation fields exposed
 * - Fair Housing: matching is based on property criteria only, never demographics
 */

import prisma from "@/lib/prisma";
import { fetchListingsForPreferences, type TrestleListing } from "./fetcher";
import { scoreListingMatch } from "./calculator";

// ─── Types ────────────────────────────────────────────────

export interface ClientMatchResult {
  clientId: bigint;
  clientName: string;
  clientEmail: string;
  clientRole: string; // buyer | renter | seller | landlord
  pipelineStage: string;
  leaseEndDate: Date | null;
  daysToLeaseEnd: number | null;
  preferences: {
    neighborhoods: string[];
    propertyTypes: string[];
    minBeds: number | null;
    maxBeds: number | null;
    minPrice: number | null;
    maxPrice: number | null;
  } | null;
  matchingListings: MatchedListing[];
  marketContext: {
    totalActiveInAreas: number;
    avgDomInAreas: number;
    priceDropsInAreas: number;
    newListingsInAreas: number;
  };
}

export interface MatchedListing {
  listing: TrestleListing;
  matchScore: number;
  matchReasons: string[];
}

// ─── Fetch Agent's Clients with Preferences ───────────────

export async function getAgentClientsWithPrefs(
  agentId: bigint,
  options?: {
    pipelineStages?: string[];
    roles?: string[];
    limit?: number;
  }
): Promise<
  {
    id: bigint;
    firstName: string;
    lastName: string;
    email: string;
    roles: string[];
    pipelineStage: string;
    leaseEndDate: Date | null;
    preferences: {
      neighborhoods: string[];
      propertyTypes: string[];
      minBeds: number | null;
      maxBeds: number | null;
      minPrice: number | null;
      maxPrice: number | null;
      boroughs: string[];
    } | null;
  }[]
> {
  const where: Record<string, unknown> = { agent_id: agentId };

  if (options?.pipelineStages) {
    where.pipeline_stage = { in: options.pipelineStages };
  }

  const clients = await prisma.lead.findMany({
    where,
    select: {
      id: true,
      first_name: true,
      last_name: true,
      email: true,
      roles: true,
      pipeline_stage: true,
      lease_end_date: true,
      preferences: {
        select: {
          neighborhoods: true,
          property_types: true,
          min_beds: true,
          max_beds: true,
          min_price: true,
          max_price: true,
          boroughs: true,
        },
      },
    },
    take: options?.limit || 100,
    orderBy: { updated_at: "desc" },
  });

  // Filter by role if specified
  let filtered = clients;
  if (options?.roles) {
    filtered = clients.filter((c) =>
      c.roles.some((r) => options.roles!.includes(r))
    );
  }

  return filtered.map((c) => ({
    id: c.id,
    firstName: c.first_name,
    lastName: c.last_name,
    email: c.email,
    roles: c.roles,
    pipelineStage: c.pipeline_stage,
    leaseEndDate: c.lease_end_date,
    preferences: c.preferences
      ? {
          neighborhoods: c.preferences.neighborhoods,
          propertyTypes: c.preferences.property_types,
          minBeds: c.preferences.min_beds,
          maxBeds: c.preferences.max_beds,
          minPrice: c.preferences.min_price
            ? Number(c.preferences.min_price)
            : null,
          maxPrice: c.preferences.max_price
            ? Number(c.preferences.max_price)
            : null,
          boroughs: c.preferences.boroughs,
        }
      : null,
  }));
}

// ─── Match Listings to a Single Client ────────────────────

export async function matchListingsForClient(
  client: {
    roles: string[];
    preferences: {
      neighborhoods: string[];
      propertyTypes: string[];
      minBeds: number | null;
      maxBeds: number | null;
      minPrice: number | null;
      maxPrice: number | null;
      boroughs: string[];
    } | null;
  },
  options?: { limit?: number; includeSale?: boolean; includeRental?: boolean }
): Promise<MatchedListing[]> {
  if (!client.preferences || client.preferences.neighborhoods.length === 0) {
    return [];
  }

  const prefs = client.preferences;
  const isBuyer = client.roles.includes("buyer");
  const isRenter =
    client.roles.includes("renter") || client.roles.includes("tenant");

  const results: MatchedListing[] = [];

  // Determine which listing types to fetch
  const fetchSale =
    options?.includeSale ?? isBuyer;
  const fetchRental =
    options?.includeRental ?? isRenter;

  const priceRange = prefs.minPrice || prefs.maxPrice
    ? {
        min: prefs.minPrice || undefined,
        max: prefs.maxPrice || undefined,
      }
    : undefined;

  const bedroomRange = prefs.minBeds != null || prefs.maxBeds != null
    ? {
        min: prefs.minBeds || undefined,
        max: prefs.maxBeds || undefined,
      }
    : undefined;

  if (fetchSale) {
    const saleListings = await fetchListingsForPreferences({
      listingType: "sale",
      neighborhoods: prefs.neighborhoods,
      propertyTypes:
        prefs.propertyTypes.length > 0 ? prefs.propertyTypes : undefined,
      priceRange,
      bedroomRange,
      limit: options?.limit || 20,
    });

    for (const listing of saleListings) {
      const { score, reasons } = scoreListingMatch(listing, {
        neighborhoods: prefs.neighborhoods,
        propertyTypes: prefs.propertyTypes,
        minBeds: prefs.minBeds || undefined,
        maxBeds: prefs.maxBeds || undefined,
        minPrice: prefs.minPrice || undefined,
        maxPrice: prefs.maxPrice || undefined,
      });
      results.push({ listing, matchScore: score, matchReasons: reasons });
    }
  }

  if (fetchRental) {
    const rentalListings = await fetchListingsForPreferences({
      listingType: "rent",
      neighborhoods: prefs.neighborhoods,
      propertyTypes:
        prefs.propertyTypes.length > 0 ? prefs.propertyTypes : undefined,
      priceRange,
      bedroomRange,
      limit: options?.limit || 20,
    });

    for (const listing of rentalListings) {
      const { score, reasons } = scoreListingMatch(listing, {
        neighborhoods: prefs.neighborhoods,
        propertyTypes: prefs.propertyTypes,
        minBeds: prefs.minBeds || undefined,
        maxBeds: prefs.maxBeds || undefined,
        minPrice: prefs.minPrice || undefined,
        maxPrice: prefs.maxPrice || undefined,
      });
      results.push({ listing, matchScore: score, matchReasons: reasons });
    }
  }

  // Sort by match score descending
  return results.sort((a, b) => b.matchScore - a.matchScore);
}

// ─── Get Lease Expiration Candidates ──────────────────────

/**
 * Find clients whose leases are expiring within a given window.
 * Used by lifecycle triggers.
 */
export async function getLeaseExpirationCandidates(
  agentId: bigint | null,
  daysFromNow: number,
  windowDays: number = 7
): Promise<
  {
    id: bigint;
    firstName: string;
    lastName: string;
    email: string;
    roles: string[];
    pipelineStage: string;
    leaseEndDate: Date;
    daysToExpiry: number;
    annualIncome: number | null;
    creditScoreRange: string | null;
    preApproved: boolean;
    isBuyerCandidate: boolean;
  }[]
> {
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysFromNow);

  const windowStart = new Date(targetDate);
  windowStart.setDate(windowStart.getDate() - windowDays);
  const windowEnd = new Date(targetDate);
  windowEnd.setDate(windowEnd.getDate() + windowDays);

  const where: Record<string, unknown> = {
    lease_end_date: { gte: windowStart, lte: windowEnd },
    pipeline_stage: {
      in: ["new", "contacted", "nurturing", "active", "showing"],
    },
    roles: { hasSome: ["renter", "tenant"] },
  };

  if (agentId) {
    where.agent_id = agentId;
  }

  const clients = await prisma.lead.findMany({
    where,
    select: {
      id: true,
      first_name: true,
      last_name: true,
      email: true,
      roles: true,
      pipeline_stage: true,
      lease_end_date: true,
      annual_income: true,
      credit_score_range: true,
      pre_approved: true,
    },
  });

  return clients
    .filter((c) => c.lease_end_date != null)
    .map((c) => {
      const daysToExpiry = Math.ceil(
        (c.lease_end_date!.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      const income = c.annual_income ? Number(c.annual_income) : null;
      const isBuyerCandidate =
        (income != null && income >= 80000) &&
        (c.credit_score_range === "excellent" ||
          c.credit_score_range === "good");

      return {
        id: c.id,
        firstName: c.first_name,
        lastName: c.last_name,
        email: c.email,
        roles: c.roles,
        pipelineStage: c.pipeline_stage,
        leaseEndDate: c.lease_end_date!,
        daysToExpiry,
        annualIncome: income,
        creditScoreRange: c.credit_score_range,
        preApproved: c.pre_approved,
        isBuyerCandidate,
      };
    });
}
