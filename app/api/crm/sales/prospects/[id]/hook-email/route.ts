/**
 * POST /api/crm/sales/prospects/[id]/hook-email
 *
 * First-touch prospecting email — shows the owner their estimated current value
 * and equity gain since purchase, backed by curated comps from pitch_data.
 *
 * Flow:
 *  1. Auth + write guard
 *  2. Load prospect (ownership-scoped)
 *  3. Require owner_email
 *  4. TCPA: block if consent_opt_out_at is set
 *  5. Require ≥1 comp in pitch_data.comps
 *  6. Compute estimated value (override or median $/sqft × sqft)
 *  7. Compute equity gain vs last_purchase_price
 *  8. Build personal-feeling HTML email with top-3 comps
 *  9. Send via M365 SMTP (agent channel)
 * 10. Update pitch_data.hook_email_sent_at
 * 11. Create OutreachEvent + audit log
 * 12. Return success
 *
 * COMPLIANCE: REBNY attribution, Fair Housing, commission-negotiability footer.
 * TCPA: hard-blocked if consent_opt_out_at is set on the prospect.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import { serializeBigInts } from "@/lib/api/serialize";
import { sendEmail } from "@/lib/email/sendgrid";
import { escapeHtml } from "@/lib/sanitize";

type RouteParams = { params: Promise<{ id: string }> };

// ─── Money helpers ───────────────────────────────────────────────────────────

function formatUSD(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

// ─── Comp type ───────────────────────────────────────────────────────────────

interface Comp {
  mls_id: string;
  address?: string;
  close_price: number;
  close_date?: string | null;
  sqft?: number | null;
  beds?: number | null;
  baths?: number | null;
}

// ─── Email template ──────────────────────────────────────────────────────────

function buildHookEmail(params: {
  ownerName: string;
  address: string;
  hasPurchaseData: boolean;
  purchasePrice: number;
  purchaseYear: number;
  estimatedValue: number;
  equityGain: number;
  comps: Comp[];
  agentName: string;
  agentTitle: string;
  attributionDate: string;
}): string {
  const {
    ownerName,
    address,
    hasPurchaseData,
    purchasePrice,
    purchaseYear,
    estimatedValue,
    equityGain,
    comps,
    agentName,
    agentTitle,
    attributionDate,
  } = params;

  // Top 3 comps only
  const topComps = comps.slice(0, 3);

  const compRows = topComps
    .map(
      (c) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;font-size:13px;">${escapeHtml(c.address || c.mls_id)}</td>
      <td style="text-align:right;padding:8px;border-bottom:1px solid #eee;font-size:13px;">${formatUSD(c.close_price)}</td>
      <td style="text-align:right;padding:8px;border-bottom:1px solid #eee;font-size:13px;white-space:nowrap;">${escapeHtml(c.close_date ? fmtDate(c.close_date) : "—")}</td>
    </tr>`,
    )
    .join("");

  // Purchase section — only rendered when we have real purchase data
  const purchaseSection = hasPurchaseData
    ? `<p><strong>You purchased ${escapeHtml(address)} for ${formatUSD(purchasePrice)} in ${purchaseYear}.</strong></p>`
    : "";

  // Equity badge — only rendered when equity gain is positive
  const equityBadge =
    hasPurchaseData && equityGain > 0
      ? `<div style="font-size:16px;color:#059669;margin-top:8px;font-weight:bold;">+${formatUSD(equityGain)} in equity since ${purchaseYear}</div>`
      : "";

  const compCountLabel =
    comps.length === 1
      ? "1 recent comparable sale"
      : `${comps.length} recent comparable sales`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background-color:#ffffff;">
<div style="max-width:600px;margin:0 auto;padding:32px 24px;font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;line-height:1.7;">

  <p>Dear ${escapeHtml(ownerName)},</p>

  <p>I hope this finds you well. I'm reaching out because I've been tracking the market
  at ${escapeHtml(address)} and thought you might find this interesting.</p>

  ${purchaseSection}

  <p>Based on ${escapeHtml(compCountLabel)} in your building and area, your home is now
  estimated at approximately:</p>

  <!-- The number that makes them stop -->
  <div style="text-align:center;margin:24px 0;padding:20px;background:#FAF9F6;border-left:3px solid #B8860B;">
    <div style="font-size:28px;font-weight:bold;color:#B8860B;">${formatUSD(estimatedValue)}</div>
    <div style="font-size:14px;color:#666;margin-top:4px;">Estimated Current Value</div>
    ${equityBadge}
  </div>

  <p style="font-size:13px;color:#666;margin-bottom:4px;">Based on these recent sales:</p>

  <table style="width:100%;border-collapse:collapse;font-size:13px;margin:12px 0 24px;">
    <tr style="background:#f5f5f0;">
      <th style="text-align:left;padding:8px;font-weight:600;">Address</th>
      <th style="text-align:right;padding:8px;font-weight:600;">Sale Price</th>
      <th style="text-align:right;padding:8px;font-weight:600;">Date</th>
    </tr>
    ${compRows}
  </table>

  <p>I'd be happy to prepare a detailed market analysis specifically for your unit —
  including a pricing strategy, net proceeds estimate, and marketing plan.
  <strong>No obligation whatsoever.</strong></p>

  <p>Simply reply to this email or call me at (646) 258-4460.</p>

  <p>Warm regards,<br>
  <strong>${escapeHtml(agentName)}</strong><br>
  <span style="font-size:13px;color:#666;">${escapeHtml(agentTitle)}<br>
  Mallan Real Estate Inc.<br>
  (646) 258-4460</span></p>

  <!-- Required compliance footer -->
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;font-size:10px;color:#999;line-height:1.6;">
    <p style="margin:0 0 6px;">Based on information from the REBNY Listing Service for the period ${escapeHtml(attributionDate)}. This information is provided for consumers&rsquo; personal, non-commercial use and may not be used for any purpose other than to identify prospective properties consumers may be interested in purchasing or renting.</p>
    <p style="margin:0 0 6px;">Mallan Real Estate Inc. | 400 East 90th Street, Suite 17C, New York, NY 10128 | License #10991205323</p>
    <p style="margin:0 0 6px;">Commission rates are not set by law and are fully negotiable.</p>
    <p style="margin:0 0 6px;">Equal Housing Opportunity. Committed to compliance with the Fair Housing Act,
    NY Human Rights Law, and NYC Human Rights Law Title 8. We do not discriminate on the basis of
    race, color, religion, sex, national origin, familial status, disability, sexual orientation,
    gender identity, marital status, age, lawful source of income, or any other protected class.</p>
    <p style="margin:0;">If you do not wish to receive further communications from us, please reply with &ldquo;unsubscribe&rdquo; in the subject line.</p>
  </div>

</div>
</body>
</html>`;
}

// ─── Median helper ────────────────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST — Send first-touch hook email with equity gain
// ═══════════════════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const writeCheck = assertWriteAllowed();
  if (writeCheck) return writeCheck;

  const { id } = await params;
  const prospectId = safeBigInt(id);
  if (!prospectId) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  // ── Load prospect (ownership-scoped) ────────────────────────────────────────
  const prospect = await prisma.sellerLead.findFirst({
    where: {
      id: prospectId,
      ...(auth.role !== "BROKER" ? { assigned_agent_id: auth.userId } : {}),
    },
  });

  if (!prospect) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  // ── Require owner_email ──────────────────────────────────────────────────────
  if (!prospect.owner_email) {
    return NextResponse.json(
      { error: "Prospect has no owner_email. Update the prospect first." },
      { status: 400 },
    );
  }

  // ── TCPA: hard block if opted out ───────────────────────────────────────────
  if (prospect.consent_opt_out_at) {
    return NextResponse.json(
      { error: "Prospect has unsubscribed" },
      { status: 403 },
    );
  }

  // ── Require comps ────────────────────────────────────────────────────────────
  const pitchData =
    prospect.pitch_data && typeof prospect.pitch_data === "object"
      ? (prospect.pitch_data as Record<string, unknown>)
      : {};

  const comps: Comp[] = Array.isArray(pitchData.comps)
    ? (pitchData.comps as Comp[])
    : [];

  if (comps.length === 0) {
    return NextResponse.json(
      { error: "Add comps before sending hook email" },
      { status: 400 },
    );
  }

  // ── Compute estimated value ──────────────────────────────────────────────────
  // Priority: overrides.estimated_value → median $/sqft × prospect.sqft → median comp price
  const overrides =
    pitchData.overrides &&
    typeof pitchData.overrides === "object" &&
    !Array.isArray(pitchData.overrides)
      ? (pitchData.overrides as Record<string, unknown>)
      : {};

  let estimatedValue: number;

  if (
    typeof overrides.estimated_value === "number" &&
    overrides.estimated_value > 0
  ) {
    estimatedValue = overrides.estimated_value;
  } else if (prospect.sqft && prospect.sqft > 0) {
    // Median $/sqft from comps that have sqft data
    const pricePerSqft = comps
      .filter((c) => c.sqft && c.sqft > 0)
      .map((c) => c.close_price / c.sqft!);

    if (pricePerSqft.length > 0) {
      estimatedValue = Math.round(median(pricePerSqft) * prospect.sqft);
    } else {
      // Fall back to median comp price
      estimatedValue = Math.round(median(comps.map((c) => c.close_price)));
    }
  } else {
    // No sqft — use median close price of comps as best approximation
    estimatedValue = Math.round(median(comps.map((c) => c.close_price)));
  }

  // ── Compute equity gain ──────────────────────────────────────────────────────
  const lastPurchasePrice = prospect.last_purchase_price
    ? Number(prospect.last_purchase_price)
    : 0;
  const hasPurchaseData = lastPurchasePrice > 0;
  const equityGain = hasPurchaseData
    ? estimatedValue - lastPurchasePrice
    : 0;

  const purchaseYear = prospect.last_purchase_date
    ? new Date(prospect.last_purchase_date).getFullYear()
    : 0;

  // ── Agent info ───────────────────────────────────────────────────────────────
  const agent = await prisma.agent.findUnique({
    where: { id: auth.userId },
    select: { first_name: true, last_name: true, email: true, title: true },
  });
  const agentName = agent
    ? `${agent.first_name} ${agent.last_name}`
    : "Your Agent";
  const agentTitle = agent?.title || "Licensed Real Estate Salesperson";

  // ── REBNY attribution dates ───────────────────────────────────────────────────
  const now = new Date();
  const yearAgo = new Date(now);
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const fmtLong = (d: Date) =>
    d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  const attributionDate = `${fmtLong(yearAgo)} through ${fmtLong(now)}`;

  // ── Build email subject ───────────────────────────────────────────────────────
  const fullAddress =
    prospect.address + (prospect.unit ? `, ${prospect.unit}` : "");

  const emailSubject =
    hasPurchaseData && equityGain > 0
      ? `Your Home at ${fullAddress} — ${formatUSD(equityGain)} in Equity Since ${purchaseYear}`
      : `Your Home at ${fullAddress} — What It's Worth Today`;

  // ── Build HTML ────────────────────────────────────────────────────────────────
  const html = buildHookEmail({
    ownerName: prospect.owner_name || "Homeowner",
    address: fullAddress,
    hasPurchaseData,
    purchasePrice: lastPurchasePrice,
    purchaseYear,
    estimatedValue,
    equityGain,
    comps,
    agentName,
    agentTitle,
    attributionDate,
  });

  // ── Send via M365 SMTP (agent channel) ───────────────────────────────────────
  const result = await sendEmail(
    prospect.owner_email,
    emailSubject,
    html,
    // The real session, not a hand-rebuilt copy. A field-by-field literal
    // silently drops anything added to SessionUser later — which is exactly
    // how actorUserId (the broker actor during delegated access) would have
    // gone missing from this email's audit row.
    auth,
    {
      channel: "agent",
      from: agent?.email
        ? { email: agent.email, name: agentName }
        : { email: "maya@mallan.nyc", name: agentName },
      replyTo: agent?.email || "maya@mallan.nyc",
    },
  );

  if (!result.success) {
    return NextResponse.json(
      { error: `Failed to send email: ${result.error}` },
      { status: 500 },
    );
  }

  // ── Update pitch_data.hook_email_sent_at ─────────────────────────────────────
  const updatedPitchData: Record<string, unknown> = {
    ...(typeof pitchData === "object" ? pitchData : {}),
    hook_email_sent_at: now.toISOString(),
  };

  const updatedProspect = await prisma.sellerLead.update({
    where: { id: prospectId },
    data: {
      pitch_data: JSON.parse(JSON.stringify(updatedPitchData)),
      last_contacted_at: now,
    },
  });

  // ── OutreachEvent record ─────────────────────────────────────────────────────
  await prisma.outreachEvent.create({
    data: {
      seller_lead_id: prospectId,
      channel: "email",
      direction: "outbound",
      template_id: "hook_email",
      subject: emailSubject,
      body_preview: `Hook email sent. Estimated value: ${formatUSD(estimatedValue)}`.slice(
        0,
        500,
      ),
      outcome: "sent",
      consent_verified: true,
      agent_id: auth.userId,
    },
  });

  // ── Audit log ────────────────────────────────────────────────────────────────
  await logAuditEvent(
    "seller_prospect_hook_email_sent",
    "seller_lead",
    String(prospectId),
    auth,
    {
      email: prospect.owner_email,
      message_id: result.messageId,
      estimated_value: estimatedValue,
      equity_gain: equityGain,
      comps_used: comps.length,
    },
  );

  return NextResponse.json({
    success: true,
    message_id: result.messageId,
    sent_to: prospect.owner_email,
    estimated_value: estimatedValue,
    equity_gain: equityGain,
    prospect: serializeBigInts(updatedProspect),
  });
}
