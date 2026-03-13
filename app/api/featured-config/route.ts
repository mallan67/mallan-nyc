// /api/featured-config — Public endpoint for homepage featured config
// Cached with 5-minute revalidation (matches ISR)
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

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
