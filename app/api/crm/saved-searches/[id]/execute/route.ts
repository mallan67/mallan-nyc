// POST /api/crm/saved-searches/[id]/execute
// Execute a saved search — run criteria against local listings DB.
// Updates last_run and result_count.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireAgentOrBroker,
  isAuthError,
  logAuditEvent,
} from "@/lib/auth";
import type { Prisma } from "@prisma/client";

type RouteContext = { params: Promise<{ id: string }> };

/** Convert saved search criteria JSON to a Prisma where clause. */
function criteriaToPrismaWhere(criteria: Record<string, unknown>): Prisma.ListingWhereInput {
  const where: Prisma.ListingWhereInput = {};

  if (criteria.listing_type) {
    where.listing_type = criteria.listing_type === "sale" ? "sale" : "rent";
  }

  if (criteria.property_type && Array.isArray(criteria.property_type)) {
    where.property_type = { in: criteria.property_type as string[] };
  }

  if (criteria.borough) {
    where.borough = criteria.borough as string;
  }

  if (criteria.neighborhoods && Array.isArray(criteria.neighborhoods) && criteria.neighborhoods.length > 0) {
    where.neighborhood = { in: criteria.neighborhoods as string[] };
  }

  if (criteria.min_price || criteria.max_price) {
    where.list_price = {};
    if (criteria.min_price) {
      where.list_price.gte = criteria.min_price as number;
    }
    if (criteria.max_price) {
      where.list_price.lte = criteria.max_price as number;
    }
  }

  if (criteria.min_beds) {
    where.bedrooms_total = { gte: criteria.min_beds as number };
  }

  if (criteria.min_baths) {
    where.bathrooms_full = { gte: criteria.min_baths as number };
  }

  if (criteria.min_sqft) {
    where.living_area = { gte: criteria.min_sqft as number };
  }

  if (criteria.status && Array.isArray(criteria.status)) {
    where.status = { in: criteria.status as string[] };
  } else {
    // Default to active listings only
    where.status = "Active";
  }

  // Always filter to displayable listings
  where.idx_display_yn = true;
  where.owner_opt_out = false;

  return where;
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await ctx.params;

  try {
    const search = await prisma.savedSearch.findUnique({
      where: { id: BigInt(id) },
    });

    if (!search) {
      return NextResponse.json({ error: "Saved search not found" }, { status: 404 });
    }

    if (auth.role !== "BROKER" && search.agent_id !== auth.userId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const criteria = search.criteria as Record<string, unknown>;
    const where = criteriaToPrismaWhere(criteria);

    // Parse optional pagination from request body
    let limit = 100;
    let offset = 0;
    try {
      const body = await req.json();
      if (body.limit && typeof body.limit === "number") limit = Math.min(body.limit, 100);
      if (body.offset && typeof body.offset === "number") offset = body.offset;
    } catch {
      // No body is fine — use defaults
    }

    const [listings, total] = await Promise.all([
      prisma.listing.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { modification_timestamp: "desc" },
        select: {
          id: true,
          listing_id: true,
          status: true,
          listing_type: true,
          property_type: true,
          property_sub_type: true,
          list_price: true,
          bedrooms_total: true,
          bathrooms_full: true,
          bathrooms_half: true,
          living_area: true,
          borough: true,
          neighborhood: true,
          address: true,
          media: true,
          modification_timestamp: true,
        },
      }),
      prisma.listing.count({ where }),
    ]);

    // Update last_run and result_count
    await prisma.savedSearch.update({
      where: { id: BigInt(id) },
      data: {
        last_run: new Date(),
        result_count: total,
      },
    });

    await logAuditEvent("execute", "saved_search", id, auth, {
      resultCount: total,
    });

    // Serialize BigInt
    const serialized = listings.map((l) => ({
      ...l,
      id: l.id.toString(),
      list_price: l.list_price.toString(),
      living_area: l.living_area?.toString() ?? null,
    }));

    return NextResponse.json({
      listings: serialized,
      total,
      limit,
      offset,
      searchName: search.name,
    });
  } catch (err) {
    console.error("Execute saved search error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
