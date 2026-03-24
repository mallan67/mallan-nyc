/**
 * POST /api/crm/lease-tracker/[id]/outreach
 *
 * Send a contextual email to the landlord or tenant on an active lease,
 * based on lease lifecycle type (sell inquiry, buy inquiry, renewal,
 * market update, or 90d/60d/30d check-in).
 *
 * TCPA compliance: checks last_unsubscribe_at before sending.
 * All emails include REBNY attribution, Fair Housing, and commission
 * negotiability disclosures.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import { sendEmail } from "@/lib/email/sendgrid";
import { escapeHtml } from "@/lib/sanitize";

// ── Types ─────────────────────────────────────────────────────────────────────

type OutreachTarget = "landlord" | "tenant";

type OutreachType =
  | "sell_inquiry"
  | "buy_inquiry"
  | "renewal"
  | "market_update"
  | "90d_checkin"
  | "60d_checkin"
  | "30d_checkin";

interface OutreachBody {
  target: OutreachTarget;
  type: OutreachType;
}

type RouteParams = { params: Promise<{ id: string }> };

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatUSD(value: unknown): string {
  const n = Number(value);
  if (isNaN(n)) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function daysLabel(type: OutreachType): string {
  if (type === "90d_checkin") return "90";
  if (type === "60d_checkin") return "60";
  return "30";
}

// ── Email HTML builder ────────────────────────────────────────────────────────

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://mallan.nyc";
const GOLD = "#B8860B";

/**
 * Wrap body content in a personal, Georgia serif email shell.
 * Max 600px, centered, gold accents — no big marketing headers.
 */
function buildEmail(bodyHtml: string, agentName: string, agentEmail: string, agentPhone: string): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
</head>
<body style="margin:0;padding:0;background-color:#f5f5f0;font-family:Georgia,'Times New Roman',Times,serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f0;">
  <tr><td align="center" style="padding:32px 16px;">
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border:1px solid #e0ddd5;">
      <!-- Minimal header -->
      <tr>
        <td style="padding:24px 40px 16px;border-bottom:1px solid #e0ddd5;">
          <span style="font-size:13px;font-weight:400;color:#888;letter-spacing:2px;font-family:Arial,Helvetica,sans-serif;text-transform:uppercase;">Mallan Real Estate</span>
        </td>
      </tr>
      <!-- Body -->
      <tr>
        <td style="padding:32px 40px 24px;font-family:Georgia,'Times New Roman',Times,serif;font-size:15px;color:#2d2d2d;line-height:1.75;">
          ${bodyHtml}
        </td>
      </tr>
      <!-- Signature divider -->
      <tr>
        <td style="padding:0 40px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="border-top:1px solid #e0ddd5;padding:20px 0 0;">
              <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#2d2d2d;font-family:Georgia,'Times New Roman',Times,serif;">
                ${escapeHtml(agentName)}
              </p>
              <p style="margin:0 0 2px;font-size:13px;color:#666;font-family:Arial,Helvetica,sans-serif;">
                Licensed Real Estate Broker
              </p>
              <p style="margin:0 0 2px;font-size:13px;color:#666;font-family:Arial,Helvetica,sans-serif;">
                Mallan Real Estate Inc. &middot; NY DOS #10991205323
              </p>
              <p style="margin:0 0 2px;font-size:13px;font-family:Arial,Helvetica,sans-serif;">
                <a href="tel:${escapeHtml(agentPhone)}" style="color:${GOLD};text-decoration:none;">${escapeHtml(agentPhone)}</a>
                &middot;
                <a href="mailto:${escapeHtml(agentEmail)}" style="color:${GOLD};text-decoration:none;">${escapeHtml(agentEmail)}</a>
              </p>
              <p style="margin:4px 0 0;font-size:12px;color:#999;font-family:Arial,Helvetica,sans-serif;">
                400 East 90th Street, Suite 17C, New York, NY 10128
              </p>
            </td></tr>
          </table>
        </td>
      </tr>
      <!-- Footer: REBNY + Fair Housing + commission + unsubscribe -->
      <tr>
        <td style="padding:20px 40px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e0ddd5;">
            <tr><td style="padding:16px 0 0;font-size:11px;color:#999;line-height:1.6;font-family:Arial,Helvetica,sans-serif;">
              <p style="margin:0 0 6px;">
                Based on information from the REBNY Listing Service.
                Listing data is provided for informational purposes only.
                Data last updated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.
              </p>
              <p style="margin:0 0 6px;">
                <strong>Fair Housing:</strong> Mallan Real Estate Inc. is committed to compliance with the
                Fair Housing Act, the New York State Human Rights Law, and the NYC Human Rights Law (Title 8).
                We do not discriminate on the basis of race, color, religion, sex, national origin, familial status,
                disability, sexual orientation, gender identity, marital status, age, lawful source of income, or
                any other protected class.
              </p>
              <p style="margin:0 0 6px;">
                <strong>Commission Negotiability:</strong> Commission rates and compensation are negotiable
                and not fixed by law or any real estate organization.
              </p>
              <p style="margin:0;">
                <a href="${BASE_URL}/unsubscribe" style="color:#999;text-decoration:underline;">Unsubscribe</a>
                from these emails at any time by clicking the link above or replying with &ldquo;unsubscribe.&rdquo;
                &middot;
                <a href="${BASE_URL}/fair-housing" style="color:#999;text-decoration:underline;">Fair Housing Policy</a>
                &middot;
                <a href="${BASE_URL}/privacy" style="color:#999;text-decoration:underline;">Privacy Policy</a>
              </p>
            </td></tr>
          </table>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ── Email content builders ────────────────────────────────────────────────────

function buildSellInquiry(params: {
  recipientName: string;
  address: string;
  monthlyRent: unknown;
  agentName: string;
}): { subject: string; bodyHtml: string } {
  const subject = `Market Update for ${params.address} — Have You Considered Selling?`;
  const rent = formatUSD(params.monthlyRent);

  const bodyHtml = `
    <p>Dear ${escapeHtml(params.recipientName)},</p>
    <p>
      I've been tracking the market at <span style="color:${GOLD};font-weight:600;">${escapeHtml(params.address)}</span>
      and recent sales in your area suggest strong buyer demand.
    </p>
    <p>
      Properties similar to yours have been attracting serious buyers — in some cases selling above
      asking price. With your current rental income of ${escapeHtml(rent)}/month, the numbers
      may work strongly in your favor.
    </p>
    <p>
      If you've ever considered selling, I'd be happy to prepare a <strong>complimentary market analysis</strong>
      for your property. It includes recent comparable sales, current market trends, and a realistic
      price range — no obligation, no pressure.
    </p>
    <p>
      Simply reply to this email to get started. I'll have the analysis ready within 24 hours.
    </p>
    <p style="margin-top:28px;">Warmly,</p>
  `;

  return { subject, bodyHtml };
}

function buildBuyInquiry(params: {
  recipientName: string;
  address: string;
  leaseEndDate: Date;
  agentName: string;
}): { subject: string; bodyHtml: string } {
  const subject = `Have You Considered Buying? — Market Opportunities for You`;
  const leaseEnd = formatDate(params.leaseEndDate);

  const bodyHtml = `
    <p>Dear ${escapeHtml(params.recipientName)},</p>
    <p>
      As your lease at <span style="color:${GOLD};font-weight:600;">${escapeHtml(params.address)}</span>
      approaches renewal in ${escapeHtml(leaseEnd)}, I wanted to share something worth considering.
    </p>
    <p>
      With your rental history and background, you may be well-positioned to purchase a home in
      the area. In many cases, a monthly mortgage payment on a comparable property can be
      surprisingly close to rent — and of course, you'd be building equity rather than paying
      toward someone else's.
    </p>
    <p>
      I can help you explore options — from connecting you with a mortgage pre-approval specialist
      to finding properties that fit your needs and timeline. There's absolutely no commitment
      required.
    </p>
    <p>
      If you'd like to have a casual conversation about what's possible, simply reply to this email
      or call me. I'm happy to be a resource.
    </p>
    <p style="margin-top:28px;">Warmly,</p>
  `;

  return { subject, bodyHtml };
}

function buildRenewal(params: {
  recipientName: string;
  address: string;
  leaseEndDate: Date;
  agentName: string;
}): { subject: string; bodyHtml: string } {
  const subject = `Your Lease at ${params.address} — Renewal Discussion`;
  const leaseEnd = formatDate(params.leaseEndDate);

  const bodyHtml = `
    <p>Dear ${escapeHtml(params.recipientName)},</p>
    <p>
      I wanted to reach out because your lease at
      <span style="color:${GOLD};font-weight:600;">${escapeHtml(params.address)}</span>
      expires on <strong>${escapeHtml(leaseEnd)}</strong>.
    </p>
    <p>
      I'd love to hear about your plans so we can make sure everything goes smoothly, whatever
      you decide. A few options to consider:
    </p>
    <ul style="padding-left:20px;margin:12px 0;">
      <li style="margin-bottom:8px;"><strong>Renew:</strong> I can coordinate with the landlord on renewal terms and timeline.</li>
      <li style="margin-bottom:8px;"><strong>Move to something new:</strong> I can help you find your next apartment or home — I know the area well.</li>
      <li><strong>Buy:</strong> If ownership has ever crossed your mind, now might be the right time to explore it.</li>
    </ul>
    <p>
      No pressure and no rush — I just want to make sure you have plenty of time and options.
      Reply here or give me a call whenever it's convenient.
    </p>
    <p style="margin-top:28px;">Warmly,</p>
  `;

  return { subject, bodyHtml };
}

function buildMarketUpdate(params: {
  recipientName: string;
  address: string;
  neighborhood: string | null;
  monthlyRent: unknown;
  agentName: string;
}): { subject: string; bodyHtml: string } {
  const subject = `Market Report for ${params.address} Area`;
  const areaLabel = params.neighborhood ?? "your area";
  const rent = formatUSD(params.monthlyRent);

  const bodyHtml = `
    <p>Dear ${escapeHtml(params.recipientName)},</p>
    <p>
      I wanted to share a quick market update for
      <span style="color:${GOLD};font-weight:600;">${escapeHtml(areaLabel)}</span>,
      which I believe is relevant to your property at ${escapeHtml(params.address)}.
    </p>
    <p>
      The rental market in this area remains active. Your current rent of ${escapeHtml(rent)}/month
      is in line with recent comparable rentals I've been tracking. That said, market conditions
      do shift seasonally, and I'd be happy to share more detailed comparables on request.
    </p>
    <p>
      On the sales side, buyer demand in this neighborhood has been solid. If you've been
      curious about what your property could fetch in the current market, I'm happy to put
      together a quick analysis — at no cost and no obligation.
    </p>
    <p>
      Let me know if you'd like to connect to discuss strategy for your property, whether
      that's maximizing rental income, timing a sale, or simply staying informed.
    </p>
    <p style="margin-top:28px;">Warmly,</p>
  `;

  return { subject, bodyHtml };
}

function buildCheckin(params: {
  recipientName: string;
  address: string;
  leaseEndDate: Date;
  type: "90d_checkin" | "60d_checkin" | "30d_checkin";
  target: OutreachTarget;
  agentName: string;
}): { subject: string; bodyHtml: string } {
  const days = daysLabel(params.type);
  const leaseEnd = formatDate(params.leaseEndDate);
  const subject = `${params.address} — ${days} Days Until Lease Expiry`;

  const landlordNextSteps = `
    <p>
      As the lease approaches its end date of <strong>${escapeHtml(leaseEnd)}</strong>, now is a good
      time to make a decision on your next steps:
    </p>
    <ul style="padding-left:20px;margin:12px 0;">
      <li style="margin-bottom:8px;"><strong>Renew:</strong> Have you decided on renewal terms? I can help you negotiate and prepare the paperwork.</li>
      <li style="margin-bottom:8px;"><strong>Re-list:</strong> If the tenant isn't renewing, I recommend giving me at least 45 days to market the unit. I can start quietly now.</li>
      <li><strong>Sell:</strong> If this is a good time to exit, I'd be glad to prepare a market analysis.</li>
    </ul>
    <p>
      Reply here or call me — I'm ready to move quickly on whichever direction you choose.
    </p>
  `;

  const tenantNextSteps = `
    <p>
      Your lease at <span style="color:${GOLD};font-weight:600;">${escapeHtml(params.address)}</span>
      expires on <strong>${escapeHtml(leaseEnd)}</strong> — just ${days} days away.
    </p>
    <p>
      I wanted to check in: what are your plans? A few options I can help with:
    </p>
    <ul style="padding-left:20px;margin:12px 0;">
      <li style="margin-bottom:8px;"><strong>Renew:</strong> I can coordinate with the landlord on terms and get the paperwork moving.</li>
      <li style="margin-bottom:8px;"><strong>Move:</strong> If you're looking for something new, I'd love to help you find it — I know this area well.</li>
      <li><strong>Buy:</strong> If ownership is something you've thought about, this transition could be the right moment to explore it.</li>
    </ul>
    <p>
      No pressure — just want to make sure you have time to make the decision that's right for you.
      Reply here or call me whenever it's convenient.
    </p>
  `;

  const bodyHtml = `
    <p>Dear ${escapeHtml(params.recipientName)},</p>
    ${params.target === "landlord" ? landlordNextSteps : tenantNextSteps}
    <p style="margin-top:28px;">Warmly,</p>
  `;

  return { subject, bodyHtml };
}

// ── Outreach tracking field map ────────────────────────────────────────────────

function getTrackingField(type: OutreachType): keyof {
  outreach_90d_sent_at: Date | null;
  outreach_60d_sent_at: Date | null;
  outreach_30d_sent_at: Date | null;
  seller_comps_6mo_sent_at: Date | null;
} | null {
  if (type === "90d_checkin") return "outreach_90d_sent_at";
  if (type === "60d_checkin") return "outreach_60d_sent_at";
  if (type === "30d_checkin") return "outreach_30d_sent_at";
  if (type === "sell_inquiry") return "seller_comps_6mo_sent_at";
  return null; // buy_inquiry, renewal, market_update — no tracking field
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: RouteParams) {
  // 1. Auth
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  // 2. Parse and validate body
  let body: OutreachBody;
  try {
    const raw = await req.json();
    if (
      typeof raw !== "object" ||
      !raw ||
      !["landlord", "tenant"].includes(raw.target) ||
      !["sell_inquiry", "buy_inquiry", "renewal", "market_update", "90d_checkin", "60d_checkin", "30d_checkin"].includes(raw.type)
    ) {
      return NextResponse.json(
        { error: "Invalid body. Required: target ('landlord'|'tenant'), type ('sell_inquiry'|'buy_inquiry'|'renewal'|'market_update'|'90d_checkin'|'60d_checkin'|'30d_checkin')" },
        { status: 400 }
      );
    }
    body = raw as OutreachBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // 3. Fetch ActiveLease with landlord and tenant Lead relations
  const { id } = await params;
  const leaseId = safeBigInt(id);
  if (!leaseId) {
    return NextResponse.json({ error: "Invalid lease ID" }, { status: 400 });
  }

  const lease = await prisma.activeLease.findUnique({
    where: { id: leaseId },
    include: {
      landlord: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          last_unsubscribe_at: true,
        },
      },
      tenant: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          last_unsubscribe_at: true,
        },
      },
    },
  });

  if (!lease) {
    return NextResponse.json({ error: "Lease not found" }, { status: 404 });
  }

  // Agent scoping: agents can only act on their own leases
  if (auth.role !== "BROKER" && lease.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // 4. Resolve recipient
  const { target, type } = body;

  let recipientLead: {
    id: bigint;
    first_name: string;
    last_name: string;
    email: string | null;
    last_unsubscribe_at: Date | null;
  } | null = null;

  // For tenant target: may fall back to raw tenant fields if no linked Lead
  let rawTenantEmail: string | null = null;
  let rawTenantName: string | null = null;

  if (target === "landlord") {
    recipientLead = lease.landlord;
  } else {
    // target === "tenant"
    if (lease.tenant) {
      recipientLead = lease.tenant;
    } else {
      // No linked Lead — use raw fields
      rawTenantEmail = lease.tenant_email ?? null;
      rawTenantName = lease.tenant_name ?? null;
    }
  }

  // 5. TCPA check
  if (recipientLead?.last_unsubscribe_at) {
    return NextResponse.json(
      {
        error: "Recipient has unsubscribed. Email not sent.",
        unsubscribed_at: recipientLead.last_unsubscribe_at.toISOString(),
      },
      { status: 403 }
    );
  }

  // 6. Require recipient email
  const recipientEmail = recipientLead?.email ?? rawTenantEmail;
  if (!recipientEmail) {
    return NextResponse.json(
      { error: `No email address found for ${target}. Cannot send outreach.` },
      { status: 400 }
    );
  }

  const recipientName = recipientLead
    ? `${recipientLead.first_name} ${recipientLead.last_name}`.trim()
    : (rawTenantName ?? "there");

  // 7. Fetch agent info
  const agent = auth.userId
    ? await prisma.agent.findUnique({
        where: { id: auth.userId },
        select: { full_name: true, email: true, phone: true },
      })
    : null;

  const agentName = agent?.full_name || "Maya Allan";
  const agentEmail = agent?.email || "maya@mallan.nyc";
  const agentPhone = agent?.phone || "(646) 258-4460";

  // 8. Build email based on type
  let subject: string;
  let bodyHtml: string;

  switch (type) {
    case "sell_inquiry": {
      ({ subject, bodyHtml } = buildSellInquiry({
        recipientName,
        address: lease.address,
        monthlyRent: lease.monthly_rent,
        agentName,
      }));
      break;
    }
    case "buy_inquiry": {
      ({ subject, bodyHtml } = buildBuyInquiry({
        recipientName,
        address: lease.address,
        leaseEndDate: lease.lease_end_date,
        agentName,
      }));
      break;
    }
    case "renewal": {
      ({ subject, bodyHtml } = buildRenewal({
        recipientName,
        address: lease.address,
        leaseEndDate: lease.lease_end_date,
        agentName,
      }));
      break;
    }
    case "market_update": {
      ({ subject, bodyHtml } = buildMarketUpdate({
        recipientName,
        address: lease.address,
        neighborhood: lease.neighborhood ?? null,
        monthlyRent: lease.monthly_rent,
        agentName,
      }));
      break;
    }
    case "90d_checkin":
    case "60d_checkin":
    case "30d_checkin": {
      ({ subject, bodyHtml } = buildCheckin({
        recipientName,
        address: lease.address,
        leaseEndDate: lease.lease_end_date,
        type,
        target,
        agentName,
      }));
      break;
    }
    default: {
      return NextResponse.json({ error: "Unknown outreach type" }, { status: 400 });
    }
  }

  const html = buildEmail(bodyHtml, agentName, agentEmail, agentPhone);

  // 9. Send email
  const result = await sendEmail(
    recipientEmail,
    subject,
    html,
    auth,
    {
      from: { email: agentEmail, name: agentName },
      channel: "agent",
      replyTo: agentEmail,
    }
  );

  if (!result.success) {
    return NextResponse.json(
      { error: "Failed to send email", detail: result.error },
      { status: 500 }
    );
  }

  // 10. Update outreach tracking on ActiveLease
  const trackingField = getTrackingField(type);
  if (trackingField) {
    await prisma.activeLease.update({
      where: { id: leaseId },
      data: { [trackingField]: new Date() },
    });
  }

  // 11. Log audit event
  // Note: OutreachEvent requires seller_lead_id (FK to SellerLead, not Lead).
  // Lease tracker clients are Lead records, not SellerLeads — skip OutreachEvent.
  // Full audit trail is captured via AuditEvent below.
  await logAuditEvent(
    "lease_tracker_outreach_sent",
    "active_lease",
    leaseId.toString(),
    auth,
    {
      target,
      type,
      recipient_lead_id: recipientLead?.id?.toString() ?? null,
      recipient_email: recipientEmail,
      subject,
      message_id: result.messageId,
      tracking_field_updated: trackingField ?? null,
    },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({
    success: true,
    message_id: result.messageId,
    recipient: recipientEmail,
    subject,
    tracking_updated: trackingField ?? null,
  });
}
