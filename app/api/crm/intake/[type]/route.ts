// GET/POST /api/crm/intake/[type] — intake form config and data
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeJson } from "@/lib/api/safe-json";

const INTAKE_FIELDS: Record<string, string[]> = {
  buyer: [
    "first_name", "last_name", "email", "phone",
    "secondary_first_name", "secondary_last_name", "secondary_email", "secondary_phone", "secondary_relationship",
    "entity_name", "entity_type", "authorized_signatories",
    "annual_income", "bonuses", "credit_score_range", "pre_approved", "pre_approved_amount",
    "down_payment", "available_funds", "monthly_debt", "employer", "work_title",
    "attorney_name", "attorney_firm", "attorney_email", "attorney_phone",
    "buyer_rep_agreement", "buyer_rep_agreement_date",
    "source", "notes",
  ],
  investor: [
    // All buyer fields plus investor-specific
    "is_investor", "investment_strategy", "cap_rate_target", "cash_on_cash_target",
    "holding_period_years", "exchange_1031_status", "exchange_1031_deadline", "current_portfolio",
  ],
  seller: [
    "first_name", "last_name", "email", "phone",
    "secondary_first_name", "secondary_last_name", "secondary_email", "secondary_phone", "secondary_relationship",
    "entity_name", "entity_type", "authorized_signatories", "legal_ownership_name",
    "property_address", "unit_number",
    "attorney_name", "attorney_firm", "attorney_email", "attorney_phone",
    "home_prep_checklist", "building_mgmt_requirements", "disclosures", "documents_collected", "marketing_strategy",
    "source", "notes",
  ],
  landlord: [
    "first_name", "last_name", "email", "phone",
    "secondary_first_name", "secondary_last_name", "secondary_email", "secondary_phone", "secondary_relationship",
    "entity_name", "entity_type", "authorized_signatories",
    "property_address", "unit_number",
    "property_disclosures", "lease_terms", "fee_structure",
    "vacancy_risk", "relist_reminder_date",
    "source", "notes",
  ],
  renter: [
    "first_name", "last_name", "email", "phone",
    "secondary_first_name", "secondary_last_name", "secondary_email", "secondary_phone", "secondary_relationship",
    "entity_name", "entity_type",
    "no_fee_only", "exclusive_acceptable", "building_type_pref", "guarantor_needed", "docs_readiness",
    "rent_per_month",
    "source", "notes",
  ],
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { type } = await params;
  const fields = INTAKE_FIELDS[type];

  if (!fields) {
    return NextResponse.json({ error: "Invalid intake type. Must be: buyer, investor, seller, landlord, renter" }, { status: 400 });
  }

  // Merge buyer + investor fields for investor type
  const allFields = type === "investor"
    ? [...INTAKE_FIELDS.buyer, ...fields]
    : fields;

  return NextResponse.json({ type, fields: [...new Set(allFields)] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const writeCheck = assertWriteAllowed();
  if (writeCheck) return writeCheck;

  const { type } = await params;
  const [body, _parseErr] = await safeJson(req);
  if (_parseErr) return _parseErr;
  const { lead_id, ...intakeData } = body as Record<string, any>;

  if (!lead_id) {
    return NextResponse.json({ error: "lead_id required" }, { status: 400 });
  }

  // Verify access
  const lead = await prisma.lead.findUnique({
    where: { id: BigInt(lead_id) },
    select: { agent_id: true },
  });

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  if (auth.role !== "BROKER" && lead.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Filter to only allowed fields
  const fields = type === "investor"
    ? [...INTAKE_FIELDS.buyer, ...INTAKE_FIELDS.investor]
    : (INTAKE_FIELDS[type] || []);

  const allowedFields = new Set(fields);
  const updateData: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(intakeData)) {
    if (allowedFields.has(key) && value !== undefined) {
      // Handle type conversions
      if (["pre_approved", "buyer_rep_agreement", "is_investor", "no_fee_only", "exclusive_acceptable", "guarantor_needed"].includes(key)) {
        updateData[key] = Boolean(value);
      } else if (["annual_income", "bonuses", "pre_approved_amount", "down_payment", "available_funds", "monthly_debt", "cap_rate_target", "cash_on_cash_target", "rent_per_month"].includes(key)) {
        updateData[key] = value ? Number(value) : null;
      } else if (["holding_period_years", "login_count"].includes(key)) {
        updateData[key] = value ? parseInt(String(value), 10) : null;
      } else if (["buyer_rep_agreement_date", "exchange_1031_deadline", "relist_reminder_date"].includes(key)) {
        updateData[key] = value ? new Date(String(value)) : null;
      } else {
        updateData[key] = value;
      }
    }
  }

  await prisma.lead.update({
    where: { id: BigInt(lead_id) },
    data: updateData,
  });

  await logAuditEvent(
    "update_intake",
    "lead",
    String(lead_id),
    auth,
    { type, fields_updated: Object.keys(updateData) },
  );

  return NextResponse.json({ success: true, type, updated: Object.keys(updateData).length });
}
