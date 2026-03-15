// /api/crm/buyer-clusters — Buyer Preference Graph
// Clusters buyers by price range, neighborhood, property type preferences
import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import prisma from "@/lib/prisma";

interface BuyerCluster {
  name: string;
  description: string;
  count: number;
  avg_intent: number;
  price_range: { min: number; max: number };
  top_neighborhoods: string[];
  top_types: string[];
  top_beds: number[];
  stages: Record<string, number>;
}

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  try {
    const profiles = await prisma.buyerIntentProfile.findMany({
      where: { intent_stage: { not: "gone" } },
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

    if (profiles.length === 0) {
      return NextResponse.json({ ok: true, clusters: [], total_buyers: 0 });
    }

    // Define price-based clusters
    const priceRanges = [
      { name: "Starter", min: 0, max: 500000, desc: "First-time buyers & studios" },
      { name: "Mid-Market", min: 500000, max: 1000000, desc: "Young professionals, 1-2BR" },
      { name: "Move-Up", min: 1000000, max: 2000000, desc: "Growing families, 2-3BR" },
      { name: "Premium", min: 2000000, max: 5000000, desc: "Luxury buyers, 3-4BR" },
      { name: "Ultra-Luxury", min: 5000000, max: Infinity, desc: "Trophy properties" },
    ];

    const clusters: BuyerCluster[] = priceRanges.map((range) => {
      const members = profiles.filter((p) => {
        const mid =
          (Number(p.price_min) || 0 + Number(p.price_max) || 0) / 2 ||
          Number(p.price_max) ||
          Number(p.price_min) ||
          0;
        return mid >= range.min && mid < range.max;
      });

      if (members.length === 0) {
        return {
          name: range.name,
          description: range.desc,
          count: 0,
          avg_intent: 0,
          price_range: { min: range.min, max: range.max === Infinity ? 0 : range.max },
          top_neighborhoods: [],
          top_types: [],
          top_beds: [],
          stages: {},
        };
      }

      // Aggregate preferences
      const nhCounts: Record<string, number> = {};
      const typeCounts: Record<string, number> = {};
      const bedCounts: Record<number, number> = {};
      const stages: Record<string, number> = {};

      members.forEach((m) => {
        (m.preferred_neighborhoods || []).forEach((n) => {
          nhCounts[n] = (nhCounts[n] || 0) + 1;
        });
        (m.preferred_types || []).forEach((t) => {
          typeCounts[t] = (typeCounts[t] || 0) + 1;
        });
        (m.preferred_beds || []).forEach((b) => {
          bedCounts[b] = (bedCounts[b] || 0) + 1;
        });
        const s = m.intent_stage || "browsing";
        stages[s] = (stages[s] || 0) + 1;
      });

      const avgIntent =
        Math.round(
          members.reduce((s, m) => s + (m.intent_strength || 0), 0) /
            members.length
        );

      return {
        name: range.name,
        description: range.desc,
        count: members.length,
        avg_intent: avgIntent,
        price_range: {
          min: range.min,
          max: range.max === Infinity ? 0 : range.max,
        },
        top_neighborhoods: Object.entries(nhCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([k]) => k),
        top_types: Object.entries(typeCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 3)
          .map(([k]) => k),
        top_beds: Object.entries(bedCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 3)
          .map(([k]) => Number(k)),
        stages,
      };
    });

    return NextResponse.json({
      ok: true,
      total_buyers: profiles.length,
      clusters: clusters.filter((c) => c.count > 0),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[buyer-clusters] Error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
