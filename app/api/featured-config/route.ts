// /api/featured-config — Homepage featured listings config
// GET: Public (cached 5min). PATCH: Broker only (saves to DB).
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { safeJson } from "@/lib/api/safe-json";

export const revalidate = 300; // 5 minutes

const DEFAULT_CONFIG = {
  pinnedListingIds: [],
  filters: {
    type: "sale",
    boroughs: ["Manhattan"],
    neighborhoods: [],
    minPrice: 500000,
    maxPrice: 0,
    minBeds: 1,
  },
  sort: "newest",
  limit: 6,
};

export async function GET() {
  try {
    const config = await prisma.featuredConfig.findFirst({
      where: { is_active: true },
      orderBy: { updated_at: "desc" },
    });

    if (!config) {
      return NextResponse.json(DEFAULT_CONFIG, {
        headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
      });
    }

    const filters = (config.filters as Record<string, unknown>) || {};

    return NextResponse.json(
      {
        pinnedListingIds: config.pinned_ids || [],
        filters: {
          type: (filters.type as string) || "sale",
          boroughs: (filters.boroughs as string[]) || [],
          neighborhoods: (filters.neighborhoods as string[]) || [],
          minPrice: (filters.minPrice as number) || 0,
          maxPrice: (filters.maxPrice as number) || 0,
          minBeds: (filters.minBeds as number) || 0,
        },
        sort: config.sort || "price-desc",
        limit: config.display_limit || 6,
      },
      {
        headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
      }
    );
  } catch (err) {
    console.error("[featured-config] DB error, using defaults:", err);
    return NextResponse.json(DEFAULT_CONFIG);
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  if (auth.role !== "BROKER") {
    return NextResponse.json({ error: "Broker only" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const pinned_ids = Array.isArray(body.pinnedListingIds)
    ? body.pinnedListingIds.map(String)
    : undefined;
  const filters = body.filters as Record<string, unknown> | undefined;
  const sort = body.sort as string | undefined;
  const display_limit = body.limit != null ? Number(body.limit) : undefined;

  // Upsert: update active config or create new one
  const existing = await prisma.featuredConfig.findFirst({
    where: { is_active: true },
    orderBy: { updated_at: "desc" },
  });

  const data: Record<string, unknown> = {
    is_active: true,
    updated_by: auth.userId,
  };
  if (pinned_ids !== undefined) data.pinned_ids = pinned_ids;
  if (filters !== undefined) data.filters = filters;
  if (sort !== undefined) data.sort = sort;
  if (display_limit !== undefined) data.display_limit = display_limit;

  if (existing) {
    await prisma.featuredConfig.update({
      where: { id: existing.id },
      data,
    });
  } else {
    await prisma.featuredConfig.create({
      data: {
        pinned_ids: pinned_ids || [],
        filters: (filters || DEFAULT_CONFIG.filters) as Record<string, string | number | string[]>,
        sort: sort || "newest",
        display_limit: display_limit || 6,
        is_active: true,
        updated_by: auth.userId,
      },
    });
  }

  return NextResponse.json({ saved: true });
}
