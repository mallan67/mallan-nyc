// /api/crm/pipeline — Agent pipeline view
// GET: Returns leads grouped by pipeline_stage with counts
import { NextRequest, NextResponse } from "next/server";
import { CANONICAL_PIPELINE_STAGES, UNRECOGNIZED_STAGE_BUCKET, bucketStoredStage } from "@/lib/crm/client-pipeline-stage";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Every stage the shipped application writes, plus one bucket for anything stored that this source does
// not currently write. The old local nine silently excluded 24 shipped stages AND relabelled those leads
// as "new" via `(l.pipeline_stage || "new")` — inventing a workflow position for a real person. With the
// production stored-value census still unavailable, an unrecognized token is surfaced, never rewritten
// and never dropped.
const STAGES = [...CANONICAL_PIPELINE_STAGES, UNRECOGNIZED_STAGE_BUCKET];

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const where: Record<string, unknown> = {};
  if (auth.role !== "BROKER") where.agent_id = auth.userId;

  const leads = await prisma.lead.findMany({
    where,
    select: {
      id: true,
      first_name: true,
      last_name: true,
      email: true,
      phone: true,
      portal_role: true,
      pipeline_stage: true,
      status: true,
      source: true,
      next_follow_up: true,
      last_contacted_at: true,
      lease_end_date: true,
      pre_approved: true,
      annual_income: true,
      credit_score_range: true,
      created_at: true,
      updated_at: true,
      lead_score: { select: { score: true, grade: true } },
    },
    orderBy: { updated_at: "desc" },
  });

  const pipeline = STAGES.map((stage) => {
    const stageLeads = leads.filter((l) => bucketStoredStage(l.pipeline_stage) === stage);
    return {
      stage,
      count: stageLeads.length,
      leads: stageLeads.map((l) => ({
        id: l.id.toString(),
        name: `${l.first_name} ${l.last_name}`,
        email: l.email,
        phone: l.phone,
        role: l.portal_role,
        source: l.source,
        score: l.lead_score?.score ?? null,
        grade: l.lead_score?.grade ?? null,
        next_follow_up: l.next_follow_up,
        last_contacted: l.last_contacted_at,
        lease_end: l.lease_end_date,
        pre_approved: l.pre_approved,
        income: l.annual_income ? Number(l.annual_income) : null,
        credit: l.credit_score_range,
        created_at: l.created_at,
      })),
    };
  });

  // FACTUAL COUNTS ONLY. Two aggregates used to live here and both were fabrications once the canonical
  // 33-stage contract landed:
  //
  //   conversion_rate = pipeline_stage === "deal" || "closed"
  //   active          = !["closed", "past"].includes(pipeline_stage || "new")
  //
  // `active` counted 31 of the 33 shipped stages — a landlord whose unit is `rented`, a tenant who has
  // `moved_in`, a lead explicitly marked `viewed_not_rent`, and any unknown historic token all read as
  // active pursuits. `conversion_rate` was worse for what it could not see: `deal` exists only in the
  // generic board and `closed` in generic and seller, so NEITHER the Landlord NOR the Tenant ladder had
  // any conversion end-point it recognised, and completed rental placements were structurally invisible.
  //
  // The replacement is subtraction, not a better guess. Whether a tenancy is an active relationship or a
  // finished pursuit, and which of `lease_signed` / `moved_in` / `rented` marks a placement, are brokerage
  // definitions — and one global Lead.pipeline_stage cannot answer them for four differently shaped
  // ladders at once. A real conversion KPI belongs on transaction/role facts (a seller's closed
  // transaction, a buyer's closed purchase, a landlord's completed lease), not inferred from this column.
  //
  // The per-stage `pipeline` buckets above remain the authoritative detail; these are only the totals a
  // caller can trust without a definition.
  const total = leads.length;
  const unstaged = leads.filter(
    (l) => l.pipeline_stage === null || l.pipeline_stage === undefined || l.pipeline_stage === ""
  ).length;
  const unrecognized = leads.filter(
    (l) => bucketStoredStage(l.pipeline_stage) === UNRECOGNIZED_STAGE_BUCKET
  ).length;

  return NextResponse.json({
    pipeline,
    stats: {
      total,
      // An unset column genuinely means "not yet staged", so it is recognized AND reported as unstaged.
      recognized: total - unrecognized,
      unrecognized,
      unstaged,
    },
  });
}
