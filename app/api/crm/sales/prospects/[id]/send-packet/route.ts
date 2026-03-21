/**
 * POST /api/crm/sales/prospects/[id]/send-packet
 *
 * Email the pitch packet highlights to the prospect.
 * - Requires: prospect has owner_email
 * - TCPA guard: consent_captured_at OR consent_given
 * - Fetches pitch-packet data internally (server-side)
 * - Sends HTML email via M365 SMTP (lib/email/sendgrid.ts)
 * - Updates SellerLead.pitch_sent_at
 * - Creates OutreachEvent record
 * - Logs audit: "seller_prospect_pitch_sent"
 *
 * NOTE: PDF attachment will be added in Task 5/6.
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

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://mallan.nyc";
const BRAND_GOLD = "#C4A052";
const BRAND_DARK = "#1a1a1a";

// ── Email template ──────────────────────────────────────────────────────

function buildPitchEmail(data: {
  ownerName: string;
  address: string;
  agentName: string;
  recommendedPrice: string;
  conservativePrice: string;
  aspirationalPrice: string;
  buyerCount: number;
  activeCompetition: number;
  netProceeds: string;
  attribution: string;
}): string {
  const {
    ownerName,
    address,
    agentName,
    recommendedPrice,
    conservativePrice,
    aspirationalPrice,
    buyerCount,
    activeCompetition,
    netProceeds,
    attribution,
  } = data;

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style type="text/css">
  body, table, td { font-family: Arial, Helvetica, sans-serif; }
  img { border: 0; display: block; }
  a { color: ${BRAND_GOLD}; }
</style>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;width:100%;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;">
  <tr><td align="center" style="padding:24px 16px;">
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border:1px solid #e5e7eb;">
      <!-- Header -->
      <tr><td align="center" style="padding:28px 32px 20px;">
        <span style="font-size:22px;font-weight:700;color:${BRAND_DARK};letter-spacing:2px;">MALLAN</span>
        <span style="font-size:22px;font-weight:300;color:${BRAND_GOLD};letter-spacing:2px;">&nbsp;NYC</span>
      </td></tr>
      <!-- Content -->
      <tr><td style="padding:0 32px 32px;">
        <h1 style="font-size:22px;color:${BRAND_DARK};margin:0 0 16px;">Your Home's Market Value</h1>
        <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
          Dear ${escapeHtml(ownerName || "Homeowner")},
        </p>
        <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 20px;">
          I've prepared a personalized market analysis for your property at
          <strong>${escapeHtml(address)}</strong>. Below are the key highlights:
        </p>

        <!-- Price Box -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border:1px solid #e5e7eb;margin:0 0 24px;">
          <tr><td style="padding:20px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-size:13px;color:#6b7280;padding:0 0 4px;">Estimated Market Value</td>
              </tr>
              <tr>
                <td style="font-size:28px;font-weight:800;color:${BRAND_GOLD};padding:0 0 12px;">
                  ${escapeHtml(recommendedPrice)}
                </td>
              </tr>
              <tr>
                <td style="font-size:13px;color:#6b7280;padding:0;">
                  Range: ${escapeHtml(conservativePrice)} &ndash; ${escapeHtml(aspirationalPrice)}
                </td>
              </tr>
            </table>
          </td></tr>
        </table>

        <!-- Key Stats -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
          <tr>
            <td width="50%" style="padding:12px;background:#f0fdf4;border:1px solid #bbf7d0;text-align:center;">
              <div style="font-size:24px;font-weight:700;color:#16a34a;">${buyerCount.toLocaleString()}</div>
              <div style="font-size:12px;color:#6b7280;margin-top:4px;">Active Buyers</div>
            </td>
            <td width="50%" style="padding:12px;background:#fefce8;border:1px solid #fde68a;text-align:center;">
              <div style="font-size:24px;font-weight:700;color:#ca8a04;">${activeCompetition}</div>
              <div style="font-size:12px;color:#6b7280;margin-top:4px;">Competing Listings</div>
            </td>
          </tr>
        </table>

        <!-- Net Proceeds -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
          <tr><td style="padding:16px;background:#eff6ff;border:1px solid #bfdbfe;">
            <div style="font-size:13px;color:#6b7280;">Estimated Net Proceeds</div>
            <div style="font-size:22px;font-weight:700;color:#1d4ed8;margin-top:4px;">${escapeHtml(netProceeds)}</div>
          </td></tr>
        </table>

        <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 20px;">
          I'd love to walk you through the full analysis in detail. Would you be available
          for a brief call this week?
        </p>

        <!-- CTA -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="padding:0 0 24px;">
            <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${BASE_URL}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="13%" fillcolor="${BRAND_GOLD}" stroke="f">
              <w:anchorlock/><center style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;">Schedule a Consultation</center>
            </v:roundrect>
            <![endif]-->
            <!--[if !mso]><!-->
            <a href="${BASE_URL}" style="display:inline-block;padding:14px 40px;background-color:${BRAND_GOLD};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:6px;">Schedule a Consultation</a>
            <!--<![endif]-->
          </td></tr>
        </table>

        <p style="font-size:13px;color:#6b7280;line-height:1.5;margin:0 0 8px;">
          Best regards,<br>${escapeHtml(agentName)}<br>
          Mallan Real Estate Inc. | 646-258-4460
        </p>

        <!-- REBNY Attribution -->
        <p style="font-size:11px;color:#9ca3af;line-height:1.5;margin:16px 0 0;">
          ${escapeHtml(attribution)}
        </p>

        <!-- Footer -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e5e7eb;margin-top:24px;">
          <tr><td style="padding:16px 0 8px;font-size:11px;color:#9ca3af;line-height:1.5;">
            Mallan Real Estate Inc. | 400 East 90th Street, Suite 17C, New York, NY 10128
          </td></tr>
          <tr><td style="padding:0 0 8px;font-size:11px;color:#9ca3af;line-height:1.5;">
            Licensed Real Estate Broker | NY DOS #10991205323 | 646-258-4460
          </td></tr>
          <tr><td style="padding:0 0 8px;font-size:11px;color:#9ca3af;line-height:1.5;">
            Mallan Real Estate Inc. is committed to compliance with the Fair Housing Act,
            the New York State Human Rights Law, and the NYC Human Rights Law (Title 8).
            We do not discriminate on the basis of race, color, religion, sex, national origin,
            familial status, disability, sexual orientation, gender identity, marital status,
            age, lawful source of income, or any other protected class.
          </td></tr>
          <tr><td style="padding:0;font-size:11px;">
            <a href="${BASE_URL}/fair-housing" style="color:${BRAND_GOLD};text-decoration:underline;">Fair Housing Policy</a> |
            <a href="${BASE_URL}/privacy" style="color:${BRAND_GOLD};text-decoration:underline;">Privacy Policy</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// POST — Send pitch packet email
// ═══════════════════════════════════════════════════════════════════════════

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

  // Ownership check
  const prospect = await prisma.sellerLead.findFirst({
    where: {
      id: prospectId,
      ...(auth.role !== "BROKER" ? { assigned_agent_id: auth.userId } : {}),
    },
  });

  if (!prospect) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  // Must have owner_email
  if (!prospect.owner_email) {
    return NextResponse.json(
      { error: "Prospect has no owner_email. Update the prospect first." },
      { status: 400 },
    );
  }

  // TCPA guard
  if (!prospect.consent_captured_at && !prospect.consent_given) {
    return NextResponse.json(
      {
        error:
          "Cannot send pitch packet without TCPA consent. Set consent_captured_at or consent_given first.",
      },
      { status: 403 },
    );
  }

  // ── Fetch pitch packet data (internal server-side call) ─────────────────
  // Instead of making an HTTP call to ourselves, we replicate the core logic
  // to get the key numbers. This avoids self-request issues in serverless.

  const agent = await prisma.agent.findUnique({
    where: { id: auth.userId },
    select: { first_name: true, last_name: true, email: true },
  });
  const agentName = agent
    ? `${agent.first_name} ${agent.last_name}`
    : "Your Agent";

  // Buyer count
  const buyerCount = await prisma.lead.count({
    where: { roles: { has: "buyer" } },
  });

  // Price points — use market_value or last_purchase_price
  const mv = prospect.market_value ? Number(prospect.market_value) : 0;
  const lpp = prospect.last_purchase_price
    ? Number(prospect.last_purchase_price)
    : 0;
  const basePrice = mv || lpp;

  const conservative = basePrice ? Math.round(basePrice * 0.95) : 0;
  const recommended = basePrice ? Math.round(basePrice) : 0;
  const aspirational = basePrice ? Math.round(basePrice * 1.1) : 0;

  // Financial picture
  const commissionRate = 0.06;
  const commission = Math.round(recommended * commissionRate);
  const transferTaxRate = recommended < 500_000 ? 0.01 : 0.01425;
  const transferTax = Math.round(recommended * transferTaxRate);
  const attorneyFees = 3000;
  const mortgagePayoff = prospect.mortgage_amount
    ? Number(prospect.mortgage_amount)
    : 0;
  const netProceeds =
    recommended - commission - transferTax - attorneyFees - mortgagePayoff;

  const usd = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);

  // REBNY attribution
  const now = new Date();
  const yearAgo = new Date();
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  const attribution = `Based on information from the REBNY Listing Service for the period ${fmt(yearAgo)} through ${fmt(now)}. This information is provided for consumers' personal, non-commercial use.`;

  // ── Build and send email ────────────────────────────────────────────────
  const subject = `Your Home's Market Value — ${agentName}, Mallan Real Estate`;

  const html = buildPitchEmail({
    ownerName: prospect.owner_name || "Homeowner",
    address: prospect.address + (prospect.unit ? `, ${prospect.unit}` : ""),
    agentName,
    recommendedPrice: recommended ? usd(recommended) : "Contact for estimate",
    conservativePrice: conservative ? usd(conservative) : "N/A",
    aspirationalPrice: aspirational ? usd(aspirational) : "N/A",
    buyerCount,
    activeCompetition: 0, // We don't run Trestle queries here; full data is in pitch-packet GET
    netProceeds: netProceeds > 0 ? usd(netProceeds) : "Contact for estimate",
    attribution,
  });

  const result = await sendEmail(
    prospect.owner_email,
    subject,
    html,
    { userId: auth.userId, userType: auth.userType, role: auth.role, sessionId: auth.sessionId },
    {
      channel: "agent",
      from: agent?.email
        ? { email: agent.email, name: agentName }
        : undefined,
      replyTo: agent?.email || undefined,
    },
  );

  if (!result.success) {
    return NextResponse.json(
      { error: `Failed to send email: ${result.error}` },
      { status: 500 },
    );
  }

  // Update pitch_sent_at
  const updatedProspect = await prisma.sellerLead.update({
    where: { id: prospectId },
    data: {
      pitch_sent_at: now,
      last_contacted_at: now,
    },
  });

  // Create OutreachEvent record
  await prisma.outreachEvent.create({
    data: {
      seller_lead_id: prospectId,
      channel: "email",
      direction: "outbound",
      template_id: "pitch_packet",
      subject,
      body_preview: `Pitch packet sent to ${prospect.owner_email}. Recommended price: ${usd(recommended)}.`.slice(
        0,
        500,
      ),
      outcome: "sent",
      consent_verified: true,
      agent_id: auth.userId,
    },
  });

  await logAuditEvent(
    "seller_prospect_pitch_sent",
    "seller_lead",
    String(prospectId),
    auth,
    {
      email: prospect.owner_email,
      message_id: result.messageId,
      recommended_price: recommended,
    },
  );

  return NextResponse.json({
    success: true,
    message_id: result.messageId,
    sent_to: prospect.owner_email,
    prospect: serializeBigInts(updatedProspect),
  });
}
