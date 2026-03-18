// GET /api/crm/showings — Agent's showings list with ownership enforcement.
// POST /api/crm/showings — Agent creates a showing for their client.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import { sendEmail } from "@/lib/email/sendgrid";
import { showingConfirmEmail } from "@/lib/email/templates";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
  const offset = parseInt(searchParams.get("offset") || "0");

  const where: Record<string, unknown> = {};

  // Ownership: agent sees own showings, broker sees all
  if (auth.role !== "BROKER") {
    where.agent_id = auth.userId;
  }

  const showingType = searchParams.get("type");
  if (status) where.status = status;
  if (showingType) where.type = showingType;
  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) (where.date as Record<string, unknown>).gte = new Date(dateFrom);
    if (dateTo) (where.date as Record<string, unknown>).lte = new Date(dateTo);
  }

  const [showings, total] = await Promise.all([
    prisma.showing.findMany({
      where,
      include: {
        lead: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
            phone: true,
          },
        },
        listing: {
          select: {
            id: true,
            listing_id: true,
            address: true,
            list_price: true,
            status: true,
            listing_type: true,
          },
        },
      },
      orderBy: { date: "asc" },
      take: limit,
      skip: offset,
    }),
    prisma.showing.count({ where }),
  ]);

  const serialized = showings.map((s) => ({
    id: s.id.toString(),
    lead_id: s.lead_id?.toString() ?? null,
    listing_id: s.listing_id.toString(),
    agent_id: s.agent_id.toString(),
    date: s.date,
    time: s.time,
    type: s.type,
    status: s.status,
    notes: s.notes,
    created_at: s.created_at,
    updated_at: s.updated_at,
    lead: s.lead
      ? { ...s.lead, id: s.lead.id.toString() }
      : null,
    listing: {
      ...s.listing,
      id: s.listing.id.toString(),
      list_price: s.listing.list_price.toString(),
    },
  }));

  return NextResponse.json({
    showings: serialized,
    total,
    limit,
    offset,
  });
}

/**
 * POST /api/crm/showings
 * Agent creates a showing for a client + listing.
 * Body: { listing_id: string, lead_id?: string, date: string, time?: string, type?: string, notes?: string }
 */
export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const listingIdStr = body.listing_id as string;
  const dateStr = body.date as string;

  if (!listingIdStr || !dateStr) {
    return NextResponse.json(
      { error: "listing_id and date are required" },
      { status: 400 }
    );
  }

  const showingDate = new Date(dateStr);
  if (isNaN(showingDate.getTime())) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  // Resolve listing by numeric ID or listing_id string
  const numericId = parseInt(listingIdStr);
  let listing;
  if (!isNaN(numericId)) {
    listing = await prisma.listing.findUnique({ where: { id: BigInt(numericId) } });
  }
  if (!listing) {
    listing = await prisma.listing.findUnique({ where: { listing_id: listingIdStr } });
  }
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  // Optional: resolve lead (client)
  let leadId: bigint | null = null;
  if (body.lead_id) {
    const lead = await prisma.lead.findUnique({
      where: { id: safeBigInt(body.lead_id as string) ?? BigInt(-1) },
      select: { id: true, agent_id: true },
    });
    if (!lead) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    // Agent can only create showings for their own clients (broker can for any)
    if (auth.role !== "BROKER" && lead.agent_id !== auth.userId) {
      return NextResponse.json({ error: "Client is not assigned to you" }, { status: 403 });
    }
    leadId = lead.id;
  }

  const showing = await prisma.showing.create({
    data: {
      listing_id: listing.id,
      agent_id: auth.userId,
      lead_id: leadId,
      date: showingDate,
      time: (body.time as string) ?? null,
      type: (body.type as string) ?? "private",
      status: "confirmed", // Agent-created showings are auto-confirmed
      notes: (body.notes as string) ?? null,
    },
  });

  await logAuditEvent(
    "create",
    "showing",
    showing.id.toString(),
    auth,
    { listing_id: listingIdStr, lead_id: leadId?.toString() ?? null },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  // Auto-create feedback task for the day after the showing
  if (leadId) {
    const client = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { first_name: true, last_name: true },
    });
    const clientName = client
      ? `${client.first_name || ""} ${client.last_name || ""}`.trim()
      : `Client`;
    const feedbackDue = new Date(showingDate.getTime() + 24 * 3600 * 1000);
    await prisma.followUpTask.create({
      data: {
        lead_id: leadId,
        agent_id: auth.userId,
        title: `Get feedback on ${listing?.address || listingIdStr} from ${clientName}`,
        description: `Showing was on ${showingDate.toLocaleDateString()}. Follow up for feedback and next steps.`,
        due_date: feedbackDue,
        priority: "high",
        task_type: "showing",
      },
    }).catch(() => {}); // Non-blocking
  }

  // ── Email confirmation to client (non-blocking) ──
  let emailSent = false;
  if (leadId) {
    const clientForEmail = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { first_name: true, last_name: true, email: true },
    });
    if (clientForEmail?.email) {
      const agentRecord = await prisma.agent.findUnique({
        where: { id: auth.userId },
        select: { first_name: true, last_name: true },
      });
      const agName = agentRecord
        ? `${agentRecord.first_name || ""} ${agentRecord.last_name || ""}`.trim() || "Your Agent"
        : "Your Agent";
      const clName = `${clientForEmail.first_name || ""} ${clientForEmail.last_name || ""}`.trim() || "there";
      const html = showingConfirmEmail({
        clientName: clName,
        address: String(listing?.address && typeof listing.address === "object"
          ? (listing.address as Record<string, unknown>).full || (listing.address as Record<string, unknown>).UnparsedAddress || listingIdStr
          : listing?.address || listingIdStr),
        date: showingDate.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
        time: (body.time as string) || "TBD",
        type: (body.type as string) || "private",
        agentName: agName,
        notes: (body.notes as string) || undefined,
      });
      // Showing confirmations: sent from company email (system notification),
      // reply-to goes to agent so client replies reach the right person
      const agentEmail = await prisma.agent.findUnique({
        where: { id: auth.userId },
        select: { email: true },
      });
      const result = await sendEmail(
        clientForEmail.email,
        `Showing confirmed: ${listing?.address || listingIdStr}`,
        html,
        undefined,
        { channel: "company", replyTo: agentEmail?.email || undefined }
      ).catch(() => ({ success: false }));
      emailSent = result.success;
    }
  }

  return NextResponse.json(
    {
      id: showing.id.toString(),
      status: "confirmed",
      date: showing.date,
      email_sent: emailSent,
    },
    { status: 201 }
  );
}
