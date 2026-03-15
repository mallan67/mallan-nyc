// /api/crm/buyer-demand-exchange — Anonymized buyer demand by building/neighborhood
// Aggregates buyer intent profiles + behavioral events into demand signals
// GET ?neighborhood=Upper+East+Side  — demand for a neighborhood
// GET                                 — all neighborhoods with active demand
import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const neighborhood = req.nextUrl.searchParams.get("neighborhood");

  try {
    // Get all active buyer intent profiles
    const profiles = await prisma.buyerIntentProfile.findMany({
      where: {
        intent_stage: { not: "gone" },
        ...(neighborhood
          ? {
              preferred_neighborhoods: { has: neighborhood },
            }
          : {}),
      },
      select: {
        intent_strength: true,
        intent_stage: true,
        price_min: true,
        price_max: true,
        preferred_neighborhoods: true,
        preferred_types: true,
        preferred_beds: true,
        event_count: true,
      },
    });

    if (neighborhood) {
      // Single neighborhood detail
      const buyers = profiles.filter((p) =>
        p.preferred_neighborhoods.includes(neighborhood)
      );

      if (buyers.length === 0) {
        return NextResponse.json({
          ok: true,
          neighborhood,
          active_buyers: 0,
          demand_level: "none",
          budget_range: null,
          preferred_layouts: [],
          stages: {},
        });
      }

      // Anonymized aggregation
      const prices = buyers
        .map((b) => [Number(b.price_min) || 0, Number(b.price_max) || 0])
        .filter(([min, max]) => min > 0 || max > 0);
      const allMins = prices.map(([m]) => m).filter((v) => v > 0);
      const allMaxs = prices.map(([, m]) => m).filter((v) => v > 0);

      const bedCounts: Record<string, number> = {};
      buyers.forEach((b) => {
        (b.preferred_beds || []).forEach((bed) => {
          const key = bed === 0 ? "Studio" : `${bed}BR`;
          bedCounts[key] = (bedCounts[key] || 0) + 1;
        });
      });

      const typeCounts: Record<string, number> = {};
      buyers.forEach((b) => {
        (b.preferred_types || []).forEach((t) => {
          typeCounts[t] = (typeCounts[t] || 0) + 1;
        });
      });

      const stages: Record<string, number> = {};
      buyers.forEach((b) => {
        const s = b.intent_stage || "browsing";
        stages[s] = (stages[s] || 0) + 1;
      });

      const avgStrength =
        buyers.reduce((s, b) => s + (b.intent_strength || 0), 0) /
        buyers.length;
      const demandLevel =
        buyers.length >= 10
          ? "very_high"
          : buyers.length >= 5
            ? "high"
            : buyers.length >= 2
              ? "moderate"
              : "low";

      return NextResponse.json({
        ok: true,
        neighborhood,
        active_buyers: buyers.length,
        demand_level: demandLevel,
        avg_intent_strength: Math.round(avgStrength),
        budget_range:
          allMins.length > 0
            ? {
                min: Math.min(...allMins),
                max: allMaxs.length > 0 ? Math.max(...allMaxs) : null,
              }
            : null,
        preferred_layouts: Object.entries(bedCounts)
          .sort(([, a], [, b]) => b - a)
          .map(([k, v]) => ({ layout: k, count: v })),
        preferred_types: Object.entries(typeCounts)
          .sort(([, a], [, b]) => b - a)
          .map(([k, v]) => ({ type: k, count: v })),
        stages,
      });
    }

    // All neighborhoods overview
    const nhMap: Record<string, { count: number; totalStrength: number }> = {};
    profiles.forEach((p) => {
      (p.preferred_neighborhoods || []).forEach((nh) => {
        if (!nhMap[nh]) nhMap[nh] = { count: 0, totalStrength: 0 };
        nhMap[nh].count++;
        nhMap[nh].totalStrength += p.intent_strength || 0;
      });
    });

    const neighborhoods = Object.entries(nhMap)
      .map(([nh, data]) => ({
        neighborhood: nh,
        active_buyers: data.count,
        avg_intent: Math.round(data.totalStrength / data.count),
        demand_level:
          data.count >= 10
            ? "very_high"
            : data.count >= 5
              ? "high"
              : data.count >= 2
                ? "moderate"
                : "low",
      }))
      .sort((a, b) => b.active_buyers - a.active_buyers);

    return NextResponse.json({
      ok: true,
      total_active_buyers: profiles.length,
      neighborhoods,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[buyer-demand-exchange] Error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
