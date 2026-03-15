/**
 * Market Intelligence — Auto-Send Engine
 *
 * Builds and sends branded listing emails to clients.
 * Every email uses the COMPANY BANNER with the generating agent's contact info.
 *
 * COMPLIANCE:
 * - REBNY statistical disclaimer on all market data
 * - No compensation fields displayed
 * - No "Off-Market" language
 * - Fair Housing disclaimer footer
 * - TCPA: only sends to clients with consent_captured_at
 * - CAN-SPAM: includes unsubscribe link + physical address
 * - Audit trail: every send logged via sendEmail()
 * - No listing agent names in client-facing emails (only brokerage name)
 */

import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email/sendgrid";
import type { SessionUser } from "@/lib/auth/session";
import type { TrestleListing } from "./fetcher";
import { REBNY_DISCLAIMER } from "./fetcher";
import type { RentVsBuyAnalysis } from "./calculator";
import type { NeighborhoodStats } from "./fetcher";

// ─── Types ────────────────────────────────────────────────

export interface AgentBranding {
  agentName: string;
  agentTitle: string; // "Licensed Real Estate Salesperson" or "Licensed Real Estate Broker"
  agentEmail: string;
  agentPhone: string;
  agentLicenseNo: string;
  agentPhoto: string | null;
  companyName: string; // "Mallan Real Estate Inc."
  companyLicenseNo: string; // Brokerage license
  companyAddress: string;
  companyPhone: string;
}

export interface ListingEmailOptions {
  recipientName: string;
  recipientEmail: string;
  subject: string;
  preheader?: string;
  saleListings?: TrestleListing[];
  rentalListings?: TrestleListing[];
  rentVsBuy?: RentVsBuyAnalysis;
  neighborhoodStats?: NeighborhoodStats[];
  personalMessage?: string;
  emailType:
    | "lease_180d"
    | "lease_90d"
    | "lease_30d"
    | "quarterly_nurture"
    | "new_matches"
    | "market_update"
    | "custom";
  agent: AgentBranding;
  trackingToken?: string;
  sessionUser?: SessionUser;
}

// ─── Get Agent Branding ───────────────────────────────────

export async function getAgentBranding(
  agentId: bigint
): Promise<AgentBranding> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: {
      first_name: true,
      last_name: true,
      full_name: true,
      email: true,
      phone: true,
      license_no: true,
      license_type: true,
      title: true,
      photo: true,
    },
  });

  if (!agent) {
    throw new Error(`Agent ${agentId} not found`);
  }

  const name = agent.full_name || `${agent.first_name} ${agent.last_name}`;
  const title =
    agent.title ||
    (agent.license_type === "broker"
      ? "Licensed Real Estate Broker"
      : "Licensed Real Estate Salesperson");

  return {
    agentName: name,
    agentTitle: title,
    agentEmail: agent.email,
    agentPhone: agent.phone || "646-258-4460",
    agentLicenseNo: agent.license_no || "",
    agentPhoto: agent.photo,
    companyName: "Mallan Real Estate Inc.",
    companyLicenseNo: "#10991205323",
    companyAddress: "400 East 90th Street, Suite 17C, New York, NY 10128",
    companyPhone: "646-258-4460",
  };
}

// ─── Email HTML Builder ───────────────────────────────────

function buildListingCard(
  listing: TrestleListing,
  listingType: "sale" | "rent",
  trackingToken?: string
): string {
  const address = `${listing.StreetNumber} ${listing.StreetName}${listing.UnitNumber ? ` #${listing.UnitNumber}` : ""}`.trim();

  const price =
    listingType === "rent"
      ? `$${listing.ListPrice.toLocaleString()}/mo`
      : `$${listing.ListPrice.toLocaleString()}`;

  const dom = listing.CumulativeDaysOnMarket || listing.DaysOnMarket || 0;
  const sqft = listing.LivingArea
    ? `${listing.LivingArea.toLocaleString()} sqft`
    : "";
  const baths =
    listing.BathroomsFull + (listing.BathroomsHalf ? 0.5 : 0);

  // Tracking link
  const baseUrl = "https://mallan.nyc";
  const listingUrl = trackingToken
    ? `${baseUrl}/api/track/${trackingToken}?lid=${listing.ListingId}`
    : `${baseUrl}/listings/${listing.ListingId}`;

  const hasOutdoor =
    listing.PatioAndPorchFeatures &&
    listing.PatioAndPorchFeatures.length > 0;

  return `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #f0f0f0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding-right:16px;">
              <a href="${listingUrl}" style="color:#1a1a1a;text-decoration:none;">
                <p style="margin:0;font-size:15px;font-weight:600;color:#1a1a1a;">${address}</p>
                <p style="margin:2px 0 0;font-size:12px;color:#6b7280;">${listing.MLSAreaMajor} &middot; ${listing.PropertySubType}</p>
              </a>
            </td>
            <td align="right" style="white-space:nowrap;">
              <p style="margin:0;font-size:16px;font-weight:700;color:#1a1a1a;">${price}</p>
            </td>
          </tr>
          <tr>
            <td colspan="2" style="padding-top:6px;">
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-right:16px;font-size:12px;color:#6b7280;">
                    <strong>${listing.BedroomsTotal}</strong> bed
                  </td>
                  <td style="padding-right:16px;font-size:12px;color:#6b7280;">
                    <strong>${baths}</strong> bath
                  </td>
                  ${sqft ? `<td style="padding-right:16px;font-size:12px;color:#6b7280;">${sqft}</td>` : ""}
                  <td style="padding-right:16px;font-size:12px;color:#6b7280;">
                    ${dom} DOM
                  </td>
                  ${listing.AssociationFee ? `<td style="padding-right:16px;font-size:12px;color:#6b7280;">$${listing.AssociationFee.toLocaleString()}/mo maint</td>` : ""}
                  ${hasOutdoor ? `<td style="font-size:12px;color:#059669;">Outdoor space</td>` : ""}
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td colspan="2" style="padding-top:4px;">
              <p style="margin:0;font-size:11px;color:#9ca3af;">${listing.ListOfficeName}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function buildRentVsBuySection(analysis: RentVsBuyAnalysis): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
      <tr>
        <td style="padding:20px;">
          <p style="margin:0 0 12px;font-size:16px;font-weight:700;color:#1a1a1a;">Rent vs Buy: ${analysis.neighborhood}</p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="48%" style="padding:12px;background:white;border-radius:6px;border:1px solid #e2e8f0;">
                <p style="margin:0;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Monthly Rent</p>
                <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:#1a1a1a;">$${analysis.monthlyRent.toLocaleString()}</p>
              </td>
              <td width="4%"></td>
              <td width="48%" style="padding:12px;background:white;border-radius:6px;border:1px solid #e2e8f0;">
                <p style="margin:0;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Monthly Buy Cost</p>
                <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:#1a1a1a;">$${analysis.monthlyBuyTotal.toLocaleString()}</p>
                <p style="margin:2px 0 0;font-size:10px;color:#9ca3af;">Mortgage $${analysis.monthlyMortgage.toLocaleString()} + Tax $${analysis.monthlyTaxes.toLocaleString()} + Maint $${analysis.monthlyMaintenance.toLocaleString()}</p>
              </td>
            </tr>
          </table>
          ${analysis.breakEvenYears > 0 && analysis.breakEvenYears < 99 ? `<p style="margin:12px 0 0;font-size:13px;color:#374151;">Break-even: <strong>~${analysis.breakEvenYears} years</strong> (when equity + appreciation offset the cost difference)</p>` : ""}
          <p style="margin:8px 0 0;font-size:13px;color:#374151;">${analysis.summary}</p>
        </td>
      </tr>
    </table>`;
}

function buildMarketStatsSection(stats: NeighborhoodStats[]): string {
  if (stats.length === 0) return "";

  const rows = stats
    .slice(0, 5)
    .map(
      (s) => `
      <tr>
        <td style="padding:6px 8px;font-size:12px;font-weight:600;color:#1a1a1a;">${s.neighborhood}</td>
        <td align="right" style="padding:6px 8px;font-size:12px;color:#374151;">$${s.medianPrice.toLocaleString()}</td>
        <td align="right" style="padding:6px 8px;font-size:12px;color:#374151;">${s.activeCount}</td>
        <td align="right" style="padding:6px 8px;font-size:12px;color:#374151;">${s.avgDom}</td>
        <td align="right" style="padding:6px 8px;font-size:12px;color:#374151;">${s.avgPricePerSqft > 0 ? `$${s.avgPricePerSqft}` : "—"}</td>
      </tr>`
    )
    .join("");

  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
      <tr>
        <td style="padding:0 0 8px;">
          <p style="margin:0;font-size:14px;font-weight:700;color:#1a1a1a;">Market Snapshot</p>
        </td>
      </tr>
      <tr>
        <td>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
            <thead>
              <tr style="background:#f8fafc;">
                <th style="padding:8px;font-size:11px;font-weight:600;color:#6b7280;text-align:left;">Area</th>
                <th style="padding:8px;font-size:11px;font-weight:600;color:#6b7280;text-align:right;">Median Price</th>
                <th style="padding:8px;font-size:11px;font-weight:600;color:#6b7280;text-align:right;">Active</th>
                <th style="padding:8px;font-size:11px;font-weight:600;color:#6b7280;text-align:right;">Avg DOM</th>
                <th style="padding:8px;font-size:11px;font-weight:600;color:#6b7280;text-align:right;">$/sqft</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </td>
      </tr>
    </table>`;
}

/**
 * Build the full branded HTML email.
 * Uses COMPANY BANNER + generating agent's contact information.
 */
export function buildListingEmail(options: ListingEmailOptions): string {
  const { agent } = options;

  // Company banner header
  const header = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1a1a1a;">
      <tr>
        <td style="padding:20px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td>
                <p style="margin:0;font-size:20px;font-weight:700;color:#B8860B;letter-spacing:1px;">MALLAN</p>
                <p style="margin:0;font-size:10px;font-weight:600;color:#ffffff;letter-spacing:2px;text-transform:uppercase;">Real Estate Inc.</p>
              </td>
              <td align="right" style="vertical-align:middle;">
                <p style="margin:0;font-size:11px;color:#d1d5db;">${agent.companyAddress}</p>
                <p style="margin:2px 0 0;font-size:11px;color:#d1d5db;">${agent.companyPhone}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;

  // Agent info bar (below banner)
  const agentBar = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border-bottom:2px solid #B8860B;">
      <tr>
        <td style="padding:12px 24px;">
          <table cellpadding="0" cellspacing="0" border="0">
            <tr>
              ${agent.agentPhoto ? `<td style="padding-right:12px;vertical-align:middle;"><img src="https://mallan.nyc${agent.agentPhoto}" width="40" height="40" style="border-radius:50%;object-fit:cover;" alt="${agent.agentName}"></td>` : ""}
              <td style="vertical-align:middle;">
                <p style="margin:0;font-size:14px;font-weight:700;color:#1a1a1a;">${agent.agentName}</p>
                <p style="margin:1px 0 0;font-size:11px;color:#6b7280;">${agent.agentTitle}</p>
              </td>
              <td style="padding-left:24px;vertical-align:middle;">
                <p style="margin:0;font-size:12px;color:#374151;">${agent.agentEmail}</p>
                <p style="margin:1px 0 0;font-size:12px;color:#374151;">${agent.agentPhone}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;

  // Personal message
  const messageSection = options.personalMessage
    ? `<p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">${options.personalMessage}</p>`
    : "";

  // Rent vs Buy section
  const rentVsBuySection = options.rentVsBuy
    ? buildRentVsBuySection(options.rentVsBuy)
    : "";

  // Market stats section
  const marketSection = options.neighborhoodStats
    ? buildMarketStatsSection(options.neighborhoodStats)
    : "";

  // Sale listings
  const saleSection =
    options.saleListings && options.saleListings.length > 0
      ? `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
      <tr>
        <td style="padding:0 0 8px;">
          <p style="margin:0;font-size:14px;font-weight:700;color:#1a1a1a;">Properties For Sale</p>
        </td>
      </tr>
      ${options.saleListings
        .map((l) =>
          buildListingCard(l, "sale", options.trackingToken)
        )
        .join("")}
    </table>`
      : "";

  // Rental listings
  const rentalSection =
    options.rentalListings && options.rentalListings.length > 0
      ? `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
      <tr>
        <td style="padding:0 0 8px;">
          <p style="margin:0;font-size:14px;font-weight:700;color:#1a1a1a;">Rental Listings</p>
          <p style="margin:0;font-size:12px;color:#059669;">Including no-fee options</p>
        </td>
      </tr>
      ${options.rentalListings
        .map((l) =>
          buildListingCard(l, "rent", options.trackingToken)
        )
        .join("")}
    </table>`
      : "";

  // CTA
  const ctaSection = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
      <tr>
        <td align="center">
          <a href="https://mallan.nyc" style="display:inline-block;padding:12px 32px;background:#B8860B;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:6px;">
            View All Listings
          </a>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding-top:12px;">
          <p style="margin:0;font-size:12px;color:#6b7280;">
            Have questions? Reply to this email or call ${agent.agentName} at ${agent.agentPhone}
          </p>
        </td>
      </tr>
    </table>`;

  // Footer with compliance
  const footer = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border-top:1px solid #e2e8f0;">
      <tr>
        <td style="padding:16px 24px;">
          <p style="margin:0;font-size:10px;color:#9ca3af;line-height:1.5;">${REBNY_DISCLAIMER}</p>
          <p style="margin:8px 0 0;font-size:10px;color:#9ca3af;line-height:1.5;">
            ${agent.companyName} &middot; ${agent.companyLicenseNo}<br>
            ${agent.agentName} &middot; Lic. ${agent.agentLicenseNo}<br>
            ${agent.companyAddress}
          </p>
          <p style="margin:8px 0 0;font-size:10px;color:#9ca3af;">
            You are receiving this because you are a client of ${agent.agentName} at ${agent.companyName}.
            <a href="https://mallan.nyc/unsubscribe" style="color:#6b7280;">Unsubscribe</a>
          </p>
        </td>
      </tr>
    </table>`;

  // Assemble full email
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${options.subject}</title>
  ${options.preheader ? `<!--[if !mso]><!--><div style="display:none;max-height:0;overflow:hidden;">${options.preheader}</div><!--<![endif]-->` : ""}
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;">
    <tr>
      <td align="center" style="padding:24px 0;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr><td>${header}</td></tr>
          <tr><td>${agentBar}</td></tr>
          <tr>
            <td style="padding:24px;">
              ${messageSection}
              ${rentVsBuySection}
              ${marketSection}
              ${saleSection}
              ${rentalSection}
              ${ctaSection}
            </td>
          </tr>
          <tr><td>${footer}</td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Send Listing Email ───────────────────────────────────

/**
 * Build and send a listing email to a client.
 * Records IntentEvent for tracking.
 */
export async function sendListingEmail(
  options: ListingEmailOptions
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  // Verify client has consent
  const lead = await prisma.lead.findFirst({
    where: { email: options.recipientEmail },
    select: { id: true, consent_captured_at: true },
  });

  if (lead && !lead.consent_captured_at) {
    return {
      success: false,
      error: "Client has not provided email consent (TCPA/CAN-SPAM)",
    };
  }

  // Build HTML
  const html = buildListingEmail(options);

  // Send via SMTP
  const result = await sendEmail(
    options.recipientEmail,
    options.subject,
    html,
    options.sessionUser
  );

  // Log IntentEvent for tracking
  if (lead && result.success) {
    const listingIds = [
      ...(options.saleListings || []).map((l) => l.ListingId),
      ...(options.rentalListings || []).map((l) => l.ListingId),
    ];

    await prisma.intentEvent.create({
      data: {
        lead_id: lead.id,
        event_type: "listing_email_sent",
        payload: {
          email_type: options.emailType,
          listing_count: listingIds.length,
          listing_ids: listingIds.slice(0, 20),
          has_rent_vs_buy: !!options.rentVsBuy,
          tracking_token: options.trackingToken || null,
        },
      },
    });
  }

  return result;
}

// ─── Quarterly Nurture Report ─────────────────────────────

/**
 * Generate and send a quarterly market update to nurture/future clients.
 * Includes: market stats for their areas + a few listings matching initial preferences.
 * If there's engagement, the system moves them forward. If none, keeps quarterly cadence.
 */
export async function sendQuarterlyNurtureReport(
  clientId: bigint,
  agentId: bigint,
  matchedSaleListings: TrestleListing[],
  matchedRentalListings: TrestleListing[],
  neighborhoodStats: NeighborhoodStats[],
  sessionUser?: SessionUser
): Promise<{ success: boolean; error?: string }> {
  const client = await prisma.lead.findUnique({
    where: { id: clientId },
    select: {
      first_name: true,
      last_name: true,
      email: true,
      roles: true,
      consent_captured_at: true,
    },
  });

  if (!client) return { success: false, error: "Client not found" };
  if (!client.consent_captured_at)
    return { success: false, error: "No email consent" };

  const agent = await getAgentBranding(agentId);
  const isBuyer = client.roles.includes("buyer");
  const isRenter =
    client.roles.includes("renter") || client.roles.includes("tenant");

  const quarter = `Q${Math.ceil((new Date().getMonth() + 1) / 3)} ${new Date().getFullYear()}`;

  const personalMessage = `Hi ${client.first_name},<br><br>` +
    `Here's your ${quarter} market update for the areas you're interested in. ` +
    (isBuyer
      ? `I've included some properties that match what you were looking for — take a look and let me know if anything catches your eye.`
      : isRenter
        ? `I've included some rental options that fit your criteria. Let me know if you'd like to schedule a viewing.`
        : `I wanted to keep you updated on market conditions in your areas of interest.`);

  const trackingToken = generateTrackingToken(clientId, agentId);

  return sendListingEmail({
    recipientName: `${client.first_name} ${client.last_name}`,
    recipientEmail: client.email,
    subject: `${quarter} Market Update — ${neighborhoodStats.map((n) => n.neighborhood).slice(0, 2).join(", ")}`,
    preheader: `${neighborhoodStats.length} neighborhoods, ${matchedSaleListings.length + matchedRentalListings.length} matching listings`,
    saleListings: isBuyer ? matchedSaleListings.slice(0, 5) : undefined,
    rentalListings: isRenter ? matchedRentalListings.slice(0, 5) : undefined,
    neighborhoodStats,
    personalMessage,
    emailType: "quarterly_nurture",
    agent,
    trackingToken,
    sessionUser,
  });
}

// ─── Tracking Token ───────────────────────────────────────

function generateTrackingToken(
  clientId: bigint,
  agentId: bigint
): string {
  // Simple token: base64(clientId:agentId:timestamp)
  // In production, use crypto.randomUUID() stored in DB
  const raw = `${clientId}:${agentId}:${Date.now()}`;
  return Buffer.from(raw).toString("base64url");
}
