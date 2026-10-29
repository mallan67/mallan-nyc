/**
 * POST /api/crm/lease-tracker/[id]/outreach
 *
 * Email the landlord or tenant on a tenancy, by lease lifecycle type (sell inquiry, buy inquiry,
 * renewal, market update, or 90d/60d/30d check-in).
 *
 * 2026-10-27 — nothing leaves without an explicit preview and confirmation:
 *   mode "preview"            → the exact recipient, subject and HTML, the gate results and a
 *                               preview_token. No email. Audit lease_tracker_outreach_previewed.
 *   mode "send" + confirm:true
 *     + preview_token         → sends exactly what was previewed (the token binds lease, target,
 *                               type, recipient, subject, body, agent and day). Audit
 *                               lease_tracker_outreach_sent. dry_run:true goes through
 *                               sendEmail({dryRun}) — no SMTP, audit send_dryrun — and stamps nothing.
 *   anything else             → 400 confirmation_required.
 * Gates (both modes, in this order): unsupported type 400 · lease historical 409 · term ended but
 * outcome not recorded 409 · no recipient address 400 · recipient unsubscribed 403 · recipient
 * declined buying/selling outreach (Lead.nurture_paused) 403 for sell_inquiry / buy_inquiry /
 * market_update. Each refusal carries a `gate` code the Lease Tracker shows verbatim.
 *
 * All emails include REBNY attribution, Fair Housing and commission negotiability disclosures.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import { sendEmail } from "@/lib/email/sendgrid";
import { escapeHtml } from "@/lib/sanitize";
import {
  DECLINABLE_OUTREACH_TYPES,
  LEASE_OUTREACH_TYPES,
  type LeaseOutreachType,
  daysToExpiry,
  isEndedButOpen,
  outreachPreviewToken,
} from "@/lib/crm/leases";

// ── Types ─────────────────────────────────────────────────────────────────────

type OutreachTarget = "landlord" | "tenant";

type OutreachType = LeaseOutreachType;

interface OutreachBody {
  target: OutreachTarget;
  type: OutreachType;
  mode: "preview" | "send";
  confirm: boolean;
  dry_run: boolean;
  preview_token: string | null;
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
  // Lease dates are calendar days stored at UTC midnight; format the stored day, not the server's local day.
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
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
    if (typeof raw !== "object" || !raw || !["landlord", "tenant"].includes(raw.target)) {
      return NextResponse.json(
        { error: "Invalid body. Required: target ('landlord'|'tenant'), type, mode ('preview'|'send')", gate: "invalid_body" },
        { status: 400 }
      );
    }
    if (!(LEASE_OUTREACH_TYPES as readonly string[]).includes(raw.type)) {
      return NextResponse.json(
        { error: `Unsupported outreach type '${String(raw.type)}'. Supported: ${LEASE_OUTREACH_TYPES.join(", ")}`, gate: "unsupported_type", supported: LEASE_OUTREACH_TYPES },
        { status: 400 }
      );
    }
    const mode = raw.mode === "send" ? "send" : raw.mode === "preview" ? "preview" : null;
    if (!mode) {
      return NextResponse.json(
        { error: "mode is required: 'preview' returns the email without sending; 'send' with confirm: true and the preview_token sends it.", gate: "confirmation_required" },
        { status: 400 }
      );
    }
    body = {
      target: raw.target,
      type: raw.type,
      mode,
      confirm: raw.confirm === true,
      dry_run: raw.dry_run === true,
      preview_token: typeof raw.preview_token === "string" ? raw.preview_token : null,
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.mode === "send" && (!body.confirm || !body.preview_token)) {
    return NextResponse.json(
      { error: "Sending requires an explicit confirmation of the previewed email (confirm: true with the preview_token).", gate: "confirmation_required" },
      { status: 400 }
    );
  }

  // 3. Fetch ActiveLease with landlord and tenant Lead relations
  const { id } = await params;
  const leaseId = safeBigInt(id);
  if (!leaseId) {
    return NextResponse.json({ error: "Invalid lease ID" }, { status: 400 });
  }

  const partySelect = {
    id: true,
    first_name: true,
    last_name: true,
    email: true,
    last_unsubscribe_at: true,
    nurture_paused: true,
  } as const;

  const lease = await prisma.activeLease.findUnique({
    where: { id: leaseId },
    include: { landlord: { select: partySelect }, tenant: { select: partySelect } },
  });

  if (!lease) {
    return NextResponse.json({ error: "Lease not found" }, { status: 404 });
  }

  // Agent scoping: agents can only act on their own leases
  if (auth.role !== "BROKER" && lease.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const { target, type } = body;
  const now = new Date();

  // 4. Tenancy gates — a closed or ended term is not a basis for lifecycle outreach
  if (lease.status === "historical") {
    return NextResponse.json(
      { error: "This tenancy is historical (a prior term). Open the current term to send outreach.", gate: "lease_historical" },
      { status: 409 }
    );
  }
  if (isEndedButOpen(lease, now)) {
    return NextResponse.json(
      {
        error: `The term on file ended on ${formatDate(lease.lease_end_date)} and the renewal is not recorded. Record the renewal (new term), correct the dates, or mark the tenancy ended before sending outreach.`,
        gate: "lease_ended",
        lease_end_date: lease.lease_end_date.toISOString(),
        days_to_expiry: daysToExpiry(lease.lease_end_date, now),
      },
      { status: 409 }
    );
  }

  // 5. Resolve recipient
  let recipientLead: {
    id: bigint;
    first_name: string;
    last_name: string;
    email: string | null;
    last_unsubscribe_at: Date | null;
    nurture_paused: boolean;
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

  // 6. Require recipient email
  const recipientEmail = (recipientLead?.email ?? rawTenantEmail ?? "").trim() || null;
  if (!recipientEmail) {
    return NextResponse.json(
      { error: `No email address on file for the ${target}. Add one to the client record before sending outreach.`, gate: "missing_recipient" },
      { status: 400 }
    );
  }

  // 7. Consent gates — the client's answer governs (Master §22.7)
  if (recipientLead?.last_unsubscribe_at) {
    return NextResponse.json(
      {
        error: "Recipient has unsubscribed. Email not sent.",
        gate: "unsubscribed",
        unsubscribed_at: recipientLead.last_unsubscribe_at.toISOString(),
      },
      { status: 403 }
    );
  }
  if (recipientLead?.nurture_paused && DECLINABLE_OUTREACH_TYPES.has(type)) {
    return NextResponse.json(
      {
        error: `${recipientLead.first_name} ${recipientLead.last_name} declined further buying / selling outreach. Renewal and lease check-ins remain available.`.trim(),
        gate: "declined_outreach",
      },
      { status: 403 }
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
  const trackingField = getTrackingField(type);
  const ip = req.headers.get("x-forwarded-for") ?? undefined;
  const gates = {
    lease: "ok",
    recipient: "ok",
    unsubscribed: "ok",
    declined: recipientLead?.nurture_paused ? "declined_but_not_applicable" : "ok",
  };
  const tokenParts = {
    lease_id: leaseId.toString(), target, type, recipient: recipientEmail, subject, html, agent_id: String(auth.userId ?? ""),
  };

  // 9. Preview — the exact email, nothing sent
  if (body.mode === "preview") {
    const preview_token = outreachPreviewToken(tokenParts);
    await logAuditEvent(
      "lease_tracker_outreach_previewed",
      "active_lease",
      leaseId.toString(),
      auth,
      { target, type, recipient_lead_id: recipientLead?.id?.toString() ?? null, recipient_email: recipientEmail, subject },
      ip
    );
    return NextResponse.json({
      mode: "preview",
      sent: false,
      recipient: { name: recipientName, email: recipientEmail, lead_id: recipientLead?.id?.toString() ?? null },
      from: { name: agentName, email: agentEmail },
      subject,
      html,
      gates,
      tracking_field: trackingField ?? null,
      days_to_expiry: daysToExpiry(lease.lease_end_date, now),
      preview_token,
    });
  }

  // 10. Send — only what was previewed (today, by this agent, to this recipient, with this body)
  if (body.preview_token !== outreachPreviewToken(tokenParts)) {
    return NextResponse.json(
      { error: "The preview is stale or does not match this email. Preview again, then confirm.", gate: "preview_mismatch" },
      { status: 409 }
    );
  }

  const result = await sendEmail(
    recipientEmail,
    subject,
    html,
    auth,
    {
      from: { email: agentEmail, name: agentName },
      channel: "agent",
      replyTo: agentEmail,
      dryRun: body.dry_run,
    }
  );

  if (!result.success) {
    await logAuditEvent(
      "lease_tracker_outreach_send_failed",
      "active_lease",
      leaseId.toString(),
      auth,
      { target, type, recipient_email: recipientEmail, subject, error: result.error ?? null, suppressed: result._suppressed === true },
      ip
    );
    return NextResponse.json(
      { error: "Failed to send email", detail: result.error, gate: result._suppressed ? "unsubscribed" : "send_failed" },
      { status: result._suppressed ? 403 : 500 }
    );
  }

  // 11. Update outreach tracking on ActiveLease (a dry run sent nothing — stamp nothing)
  if (trackingField && !body.dry_run) {
    await prisma.activeLease.update({
      where: { id: leaseId },
      data: { [trackingField]: new Date() },
    });
  }

  // 12. Log audit event
  // Note: OutreachEvent requires seller_lead_id (FK to SellerLead, not Lead).
  // Lease tracker clients are Lead records, not SellerLeads — skip OutreachEvent.
  // Full audit trail is captured via AuditEvent below.
  await logAuditEvent(
    body.dry_run ? "lease_tracker_outreach_dryrun" : "lease_tracker_outreach_sent",
    "active_lease",
    leaseId.toString(),
    auth,
    {
      target,
      type,
      confirmed: true,
      dry_run: body.dry_run,
      recipient_lead_id: recipientLead?.id?.toString() ?? null,
      recipient_email: recipientEmail,
      subject,
      message_id: result.messageId ?? null,
      tracking_field_updated: body.dry_run ? null : (trackingField ?? null),
    },
    ip
  );

  return NextResponse.json({
    success: true,
    mode: "send",
    sent: !body.dry_run,
    dry_run: body.dry_run,
    message_id: result.messageId ?? null,
    recipient: recipientEmail,
    subject,
    tracking_updated: body.dry_run ? null : (trackingField ?? null),
  });
}
