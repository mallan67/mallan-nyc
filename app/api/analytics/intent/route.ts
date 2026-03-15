// /api/analytics/intent — Record buyer intent events from the frontend
// Accepts both anonymous (session-based) and identified (lead-linked) events.
// Bridges behavioral signals into the IntentEvent pipeline that feeds
// BuyerIntentProfile, Buyer Clusters, Buyer Demand Exchange.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";

// Map frontend event types to intent event types
const EVENT_MAP: Record<string, string> = {
  // Direct intent signals
  page_view: "page_view",
  listing_view: "page_view",
  favorite_add: "favorite",
  favorite_remove: "favorite",
  inquiry_submit: "inquiry",
  inquiry_start: "inquiry",
  showing_request: "showing_request",
  search_query: "search_query",
  filter_change: "filter_change",
  map_interaction: "map_interaction",
  // Behavioral signals that indicate intent
  photo_dwell: "page_view",
  calculator_depth: "page_view",
  comparison_add: "favorite",
  share: "inquiry",
  transit_check: "page_view",
  school_check: "page_view",
  virtual_tour_start: "page_view",
  floor_plan_view: "page_view",
  building_deep_dive: "page_view",
  return_visit: "page_view",
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      event_type,
      listing_id,
      session_id,
      lead_id,
      payload,
    } = body;

    if (!event_type) {
      return NextResponse.json({ error: "event_type required" }, { status: 400 });
    }

    // Map to intent event type
    const intentType = EVENT_MAP[event_type] || "page_view";

    // Build payload with listing and search context
    const eventPayload: Record<string, unknown> = {
      original_event: event_type,
      ...(payload || {}),
    };
    if (listing_id) eventPayload.listing_id = listing_id;

    // Try to resolve lead from session if not provided
    let resolvedLeadId = lead_id ? BigInt(lead_id) : null;

    if (!resolvedLeadId && session_id) {
      // Check if this session is linked to a lead
      const linkedEvent = await prisma.behavioralEvent.findFirst({
        where: {
          session_id,
          lead_id: { not: null },
        },
        select: { lead_id: true },
      });
      if (linkedEvent?.lead_id) {
        resolvedLeadId = linkedEvent.lead_id;
      }
    }

    // Also check session cookie for logged-in users
    if (!resolvedLeadId) {
      const sessionToken = req.cookies.get("session_token")?.value;
      if (sessionToken) {
        const session = await prisma.session.findFirst({
          where: { token: sessionToken, user_type: "lead" },
          select: { user_id: true },
        });
        if (session?.user_id) {
          resolvedLeadId = session.user_id;

          // Link this session to the lead in behavioral events too
          if (session_id) {
            await prisma.behavioralEvent.updateMany({
              where: { session_id, lead_id: null },
              data: { lead_id: session.user_id },
            }).catch(() => {});
          }
        }
      }
    }

    // Create intent event (only if we have a lead)
    if (resolvedLeadId) {
      await prisma.intentEvent.create({
        data: {
          lead_id: resolvedLeadId,
          event_type: intentType,
          payload: eventPayload as Prisma.InputJsonValue,
          session_id: session_id || null,
        },
      });
    }

    // Also create behavioral event for anonymous tracking
    await prisma.behavioralEvent.create({
      data: {
        session_id: session_id || "unknown",
        lead_id: resolvedLeadId,
        listing_id: listing_id ? String(listing_id) : null,
        event_type,
        value: 1,
        metadata: eventPayload as Prisma.InputJsonValue,
        page_path: (payload as Record<string, string>)?.path || null,
      },
    }).catch(() => {});

    return NextResponse.json({ ok: true, linked: !!resolvedLeadId });
  } catch (e: unknown) {
    // Fire-and-forget — don't let tracking errors break the user experience
    console.error("[analytics/intent] Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: true });
  }
}
