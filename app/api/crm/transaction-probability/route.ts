// /api/crm/transaction-probability — Transaction Probability Model
// GET ?listing_id=RLS20071059  — single listing
// GET ?agent_id=1              — all active listings for agent
import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import {
  computeTransactionProbability,
  computeBatchProbability,
} from "@/lib/transaction-probability/scorer";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const listingId = req.nextUrl.searchParams.get("listing_id");
  const agentId = req.nextUrl.searchParams.get("agent_id");

  try {
    // Single listing
    if (listingId) {
      const result = await computeTransactionProbability(listingId);
      if (!result) {
        return NextResponse.json(
          { ok: false, error: "Listing not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ ok: true, ...result });
    }

    // Batch: all active listings for an agent
    if (agentId) {
      const listings = await prisma.listing.findMany({
        where: {
          agent_id: BigInt(agentId),
          status: { in: ["Active", "active", "ACTIVE"] },
        },
        select: { listing_id: true },
        take: 50,
      });

      const ids = listings.map((l) => l.listing_id);
      const results = await computeBatchProbability(ids);

      return NextResponse.json({
        ok: true,
        count: results.length,
        listings: results,
      });
    }

    return NextResponse.json(
      { ok: false, error: "listing_id or agent_id required" },
      { status: 400 }
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[transaction-probability] Error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
