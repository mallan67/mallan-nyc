// /api/crm/campaigns — GET: list, POST: create, PUT: update, DELETE: remove
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const url = new URL(req.url);
  const crmType = url.searchParams.get("crm_type"); // "sales" | "rentals"
  const limit = Math.min(Number(url.searchParams.get("limit") || "100"), 200);

  const where: Record<string, unknown> = {};

  if (auth.role !== "BROKER") {
    where.agent_id = auth.userId;
  }

  if (crmType) {
    where.crm_type = crmType;
  }

  const campaigns = await prisma.campaign.findMany({
    where,
    orderBy: { updated_at: "desc" },
    take: limit,
  });

  const enriched = campaigns.map((c) => ({
    ...c,
    id: String(c.id),
    agent_id: String(c.agent_id),
  }));

  return NextResponse.json({ campaigns: enriched });
}

export async function POST(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const writeCheck = assertWriteAllowed();
  if (writeCheck) return writeCheck;

  const body = await req.json();
  const { crm_type, name, audience_type, campaign_type, frequency } = body;

  if (!crm_type || !name || !audience_type || !campaign_type) {
    return NextResponse.json({ error: "crm_type, name, audience_type, campaign_type required" }, { status: 400 });
  }

  const campaign = await prisma.campaign.create({
    data: {
      agent_id: auth.userId,
      crm_type,
      name,
      audience_type,
      campaign_type,
      frequency: frequency || "one_time",
      status: "draft",
    },
  });

  await logAuditEvent(
    "create_campaign",
    "campaign",
    String(campaign.id),
    auth,
    { name, crm_type },
  );

  return NextResponse.json({
    campaign: { ...campaign, id: String(campaign.id), agent_id: String(campaign.agent_id) },
  }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const writeCheck = assertWriteAllowed();
  if (writeCheck) return writeCheck;

  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const existing = await prisma.campaign.findFirst({
    where: { id: BigInt(id), ...(auth.role !== "BROKER" ? { agent_id: auth.userId } : {}) },
  });

  if (!existing) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const allowed = ["name", "audience_type", "campaign_type", "status", "frequency", "template_id", "filters", "next_run_at"];
  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in updates) data[key] = updates[key];
  }

  const updated = await prisma.campaign.update({
    where: { id: BigInt(id) },
    data,
  });

  await logAuditEvent("update_campaign", "campaign", String(updated.id), auth, { fields: Object.keys(data) });

  return NextResponse.json({
    campaign: { ...updated, id: String(updated.id), agent_id: String(updated.agent_id) },
  });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const writeCheck = assertWriteAllowed();
  if (writeCheck) return writeCheck;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const existing = await prisma.campaign.findFirst({
    where: { id: BigInt(id), ...(auth.role !== "BROKER" ? { agent_id: auth.userId } : {}) },
  });

  if (!existing) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  await prisma.campaign.delete({ where: { id: BigInt(id) } });

  await logAuditEvent("delete_campaign", "campaign", id, auth, { name: existing.name });

  return NextResponse.json({ deleted: true });
}
