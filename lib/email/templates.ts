// lib/email/templates.ts
// HTML email templates for CRM communications.
// All templates use inline CSS for email client compatibility.
// COMPLIANCE: Fair Housing disclaimer + REBNY attribution included.

import { escapeHtml } from "@/lib/sanitize";
import type { InvestmentMetrics } from "./investment-metrics";

const BRAND_GOLD = "#C4A052";
const BRAND_DARK = "#1a1a1a";
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://mallan.nyc";

// Shared footer — table-based for Outlook compatibility
const FOOTER = `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e5e7eb;margin-top:32px;">
  <tr><td style="padding:16px 0 8px;font-size:11px;color:#9ca3af;line-height:1.5;font-family:Arial,Helvetica,sans-serif;">
    Mallan Real Estate Inc. | 400 East 90th Street, Suite 17C, New York, NY 10128
  </td></tr>
  <tr><td style="padding:0 0 8px;font-size:11px;color:#9ca3af;line-height:1.5;font-family:Arial,Helvetica,sans-serif;">
    Licensed Real Estate Broker | NY DOS #10991205323 | 646-258-4460
  </td></tr>
  <tr><td style="padding:0 0 8px;font-size:11px;color:#9ca3af;line-height:1.5;font-family:Arial,Helvetica,sans-serif;">
    Mallan Real Estate Inc. is committed to compliance with the Fair Housing Act,
    the New York State Human Rights Law, and the NYC Human Rights Law (Title 8).
    We do not discriminate on the basis of race, color, religion, sex, national origin,
    familial status, disability, sexual orientation, gender identity, marital status,
    age, lawful source of income, or any other protected class.
  </td></tr>
  <tr><td style="padding:0;font-size:11px;font-family:Arial,Helvetica,sans-serif;">
    <a href="${BASE_URL}/fair-housing" style="color:${BRAND_GOLD};text-decoration:underline;">Fair Housing Policy</a> |
    <a href="${BASE_URL}/privacy" style="color:${BRAND_GOLD};text-decoration:underline;">Privacy Policy</a> |
    <a href="${BASE_URL}/unsubscribe" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a>
  </td></tr>
</table>`;

/**
 * Wrap email content in a styled container.
 * Uses tables for Outlook (Word rendering engine) compatibility.
 */
function wrapEmail(content: string): string {
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
<!-- Outer wrapper table -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;">
  <tr><td align="center" style="padding:24px 16px;">
    <!-- Inner content table -->
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border:1px solid #e5e7eb;">
      <!-- Header -->
      <tr><td align="center" style="padding:28px 32px 20px;">
        <span style="font-size:22px;font-weight:700;color:${BRAND_DARK};letter-spacing:2px;font-family:Arial,Helvetica,sans-serif;">MALLAN</span>
        <span style="font-size:22px;font-weight:300;color:${BRAND_GOLD};letter-spacing:2px;font-family:Arial,Helvetica,sans-serif;">&nbsp;NYC</span>
      </td></tr>
      <!-- Content -->
      <tr><td style="padding:0 32px 32px;font-family:Arial,Helvetica,sans-serif;">
        ${content}
        ${FOOTER}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/**
 * Portal invite email — sent when agent invites a client to their portal.
 */
export function portalInviteEmail(
  clientName: string,
  inviteToken: string,
  agentName: string,
  portalRole: string
): string {
  const inviteUrl = `${BASE_URL}/portal/accept?token=${encodeURIComponent(inviteToken)}`;
  const roleLabel =
    portalRole === "buyer" ? "Buyer" :
    portalRole === "tenant" ? "Tenant" :
    portalRole === "seller" ? "Seller" :
    portalRole === "landlord" ? "Landlord" : "Client";

  return wrapEmail(`
    <h1 style="font-size:22px;color:${BRAND_DARK};margin:0 0 16px;">You're Invited</h1>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
      Hi ${escapeHtml(clientName)},
    </p>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
      ${escapeHtml(agentName)} at Mallan Real Estate has invited you to access your
      <strong>${escapeHtml(roleLabel)} Portal</strong>. From your portal you can view properties,
      track showings, and communicate directly with your agent.
    </p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${inviteUrl}"
         style="display:inline-block;padding:14px 32px;background:${BRAND_GOLD};color:#ffffff;
                font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
        Accept Invitation
      </a>
    </div>
    <p style="font-size:13px;color:#9ca3af;margin:0;">
      This invitation expires in 72 hours. If you did not expect this email, you can safely ignore it.
    </p>
  `);
}

/**
 * Listing alert email — sent when new listings match a client's saved search criteria.
 */
export function listingAlertEmail(
  listings: { address: string; price: string; beds: number | string; baths: number | string; url: string }[],
  clientName: string
): string {
  const listingCards = listings.slice(0, 10).map((l) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;">
        <a href="${escapeHtml(l.url)}" style="color:${BRAND_DARK};text-decoration:none;font-size:14px;font-weight:600;">
          ${escapeHtml(l.address)}
        </a>
        <div style="font-size:13px;color:#6b7280;margin-top:4px;">
          ${escapeHtml(l.price)} &middot; ${l.beds} bed &middot; ${l.baths} bath
        </div>
      </td>
    </tr>
  `).join("");

  return wrapEmail(`
    <h1 style="font-size:22px;color:${BRAND_DARK};margin:0 0 16px;">New Listings for You</h1>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
      Hi ${escapeHtml(clientName)}, we found ${listings.length} new listing${listings.length !== 1 ? "s" : ""}
      matching your search criteria.
    </p>
    <table style="width:100%;border-collapse:collapse;">
      ${listingCards}
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="${BASE_URL}/portal"
         style="display:inline-block;padding:12px 28px;background:${BRAND_GOLD};color:#ffffff;
                font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">
        View All in Portal
      </a>
    </div>
    <p style="font-size:11px;color:#9ca3af;margin:16px 0 0;">
      Listing data provided by the Real Estate Board of New York (REBNY) Residential Listing Service.
      Data last updated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.
    </p>
  `);
}

/**
 * Showing confirmation email — sent when a showing is confirmed.
 */
export function showingConfirmEmail(
  showing: {
    clientName: string;
    address: string;
    date: string;
    time: string;
    type: string;
    agentName: string;
    notes?: string;
  }
): string {
  const typeLabel =
    showing.type === "openhouse" ? "Open House" :
    showing.type === "virtual" ? "Virtual Tour" :
    showing.type === "brokersopen" ? "Broker's Open" : "Private Showing";

  return wrapEmail(`
    <h1 style="font-size:22px;color:${BRAND_DARK};margin:0 0 16px;">Showing Confirmed</h1>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
      Hi ${escapeHtml(showing.clientName)},
    </p>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 20px;">
      Your ${typeLabel.toLowerCase()} has been confirmed:
    </p>
    <div style="background:#f9fafb;border-radius:8px;padding:20px;margin:0 0 20px;">
      <table style="width:100%;font-size:14px;color:#374151;">
        <tr><td style="padding:6px 0;font-weight:600;width:100px;">Property</td><td>${escapeHtml(showing.address)}</td></tr>
        <tr><td style="padding:6px 0;font-weight:600;">Date</td><td>${escapeHtml(showing.date)}</td></tr>
        <tr><td style="padding:6px 0;font-weight:600;">Time</td><td>${escapeHtml(showing.time)}</td></tr>
        <tr><td style="padding:6px 0;font-weight:600;">Type</td><td>${escapeHtml(typeLabel)}</td></tr>
        <tr><td style="padding:6px 0;font-weight:600;">Agent</td><td>${escapeHtml(showing.agentName)}</td></tr>
        ${showing.notes ? `<tr><td style="padding:6px 0;font-weight:600;">Notes</td><td>${escapeHtml(showing.notes)}</td></tr>` : ""}
      </table>
    </div>
    <p style="font-size:13px;color:#9ca3af;margin:0;">
      Need to reschedule? Contact your agent directly or reply to this email.
    </p>
  `);
}

/**
 * Deal status update email — sent when a commission deal changes status.
 */
export function dealStatusEmail(
  deal: {
    agentName: string;
    address: string;
    newStatus: string;
    dealId: string;
    notes?: string;
  }
): string {
  const statusColors: Record<string, string> = {
    approved: "#059669",
    rejected: "#dc2626",
    submitted: "#2563eb",
    closed: "#7c3aed",
  };
  const statusColor = statusColors[deal.newStatus] || "#6b7280";

  return wrapEmail(`
    <h1 style="font-size:22px;color:${BRAND_DARK};margin:0 0 16px;">Deal Status Update</h1>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
      Hi ${escapeHtml(deal.agentName)},
    </p>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 20px;">
      Your commission request for <strong>${escapeHtml(deal.address)}</strong> has been updated:
    </p>
    <div style="text-align:center;margin:20px 0;">
      <span style="display:inline-block;padding:8px 20px;background:${statusColor};color:#ffffff;
                   font-size:14px;font-weight:600;border-radius:20px;text-transform:uppercase;">
        ${escapeHtml(deal.newStatus)}
      </span>
    </div>
    ${deal.notes ? `<p style="font-size:14px;color:#374151;background:#f9fafb;padding:12px;border-radius:6px;">${escapeHtml(deal.notes)}</p>` : ""}
    <p style="font-size:13px;color:#9ca3af;margin:16px 0 0;">
      Deal ID: ${escapeHtml(deal.dealId)}. Log in to the CRM to view full details.
    </p>
  `);
}

/**
 * Auto-response email — sent immediately when someone submits an inquiry.
 * TCPA safe: no marketing content, just acknowledgment of their request.
 */
export function inquiryAutoResponseEmail(
  clientName: string,
  listingAddress?: string
): string {
  return wrapEmail(`
    <h1 style="font-size:22px;color:${BRAND_DARK};margin:0 0 16px;">Thank You for Your Inquiry</h1>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
      Hi ${escapeHtml(clientName || "there")},
    </p>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
      We have received your inquiry${listingAddress ? ` about <strong>${escapeHtml(listingAddress)}</strong>` : ""} and
      a licensed agent will be in touch within the next business day.
    </p>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
      In the meantime, feel free to explore more properties on our website or
      reach out directly at <strong>646-258-4460</strong>.
    </p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${BASE_URL}/buy"
         style="display:inline-block;padding:12px 28px;background:${BRAND_GOLD};color:#ffffff;
                font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;margin:0 6px;">
        Browse Sales
      </a>
      <a href="${BASE_URL}/rent"
         style="display:inline-block;padding:12px 28px;border:1px solid ${BRAND_GOLD};color:${BRAND_GOLD};
                font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;margin:0 6px;">
        Browse Rentals
      </a>
    </div>
    <p style="font-size:13px;color:#9ca3af;margin:16px 0 0;">
      This is an automated confirmation. Please do not reply to this email.
    </p>
  `);
}

/**
 * Open House RSVP confirmation email — sent when someone registers for an open house.
 * TCPA safe: no marketing content, just confirmation of their registration.
 */
export function openHouseRsvpEmail(
  clientName: string,
  address: string,
  date: string,
  time: string,
  partySize: number
): string {
  return wrapEmail(`
    <h1 style="font-size:22px;color:${BRAND_DARK};margin:0 0 16px;">You're Registered for the Open House</h1>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
      Hi ${escapeHtml(clientName || "there")},
    </p>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 20px;">
      We look forward to seeing you! Here are your open house details:
    </p>
    <div style="background:#f9fafb;border-radius:8px;padding:20px;margin:0 0 20px;">
      <table style="width:100%;font-size:14px;color:#374151;">
        <tr><td style="padding:6px 0;font-weight:600;width:100px;">Property</td><td>${escapeHtml(address)}</td></tr>
        <tr><td style="padding:6px 0;font-weight:600;">Date</td><td>${escapeHtml(date)}</td></tr>
        <tr><td style="padding:6px 0;font-weight:600;">Time</td><td>${escapeHtml(time)}</td></tr>
        <tr><td style="padding:6px 0;font-weight:600;">Party Size</td><td>${partySize} ${partySize === 1 ? "guest" : "guests"}</td></tr>
      </table>
    </div>
    <div style="background:#fffbeb;border:1px solid #fbbf24;border-radius:8px;padding:16px;margin:0 0 20px;">
      <p style="font-size:14px;color:#92400e;font-weight:600;margin:0 0 8px;">What to Bring</p>
      <p style="font-size:13px;color:#78350f;margin:0;line-height:1.5;">
        Please bring a valid photo ID. This is standard practice for all NYC open houses.
      </p>
    </div>
    <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 16px;">
      No appointment is needed&mdash;simply arrive during the scheduled time.
      If you have any questions, call us at <strong>646-258-4460</strong>.
    </p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${BASE_URL}/open-houses"
         style="display:inline-block;padding:12px 28px;background:${BRAND_GOLD};color:#ffffff;
                font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">
        View All Open Houses
      </a>
    </div>
    <p style="font-size:11px;color:#9ca3af;margin:16px 0 0;">
      Listing data provided by the Real Estate Board of New York (REBNY) Residential Listing Service.
    </p>
    <p style="font-size:13px;color:#9ca3af;margin:8px 0 0;">
      This is an automated confirmation. Please do not reply to this email.
    </p>
  `);
}

/**
 * CMA auto-response email — sent when someone requests a Comparative Market Analysis.
 * TCPA safe: no marketing content, just acknowledgment of their request.
 */
export function cmaAutoResponseEmail(
  clientName: string,
  propertyAddress: string
): string {
  return wrapEmail(`
    <h1 style="font-size:22px;color:${BRAND_DARK};margin:0 0 16px;">Your Property Valuation Request</h1>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
      Hi ${escapeHtml(clientName || "there")},
    </p>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
      Thank you for requesting a Comparative Market Analysis for
      <strong>${escapeHtml(propertyAddress)}</strong>. A licensed broker will prepare your
      personalized property valuation and send it within 24 hours.
    </p>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
      Your CMA will include recent comparable sales, current market conditions,
      and a recommended price range for your property.
    </p>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
      If you have any questions in the meantime, feel free to call us at
      <strong>646-258-4460</strong>.
    </p>
    <p style="font-size:13px;color:#9ca3af;margin:16px 0 0;">
      This is an automated confirmation. Please do not reply to this email.
    </p>
  `);
}

/**
 * Listing send email — sent when agent sends a listing to a client via CRM.
 * Shows a visual card with photo, price, address, beds/baths, and CTA.
 */
export function listingSendEmail(
  listing: {
    address: string;
    price: string;
    beds?: number;
    baths?: number;
    sqft?: number;
    status?: string;
    photoUrl?: string;
    listingId: string;
    listingType?: string;
  },
  clientName: string,
  agentName: string,
  personalNote?: string
): string {
  const detailUrl = `${BASE_URL}/listing/${encodeURIComponent(listing.listingId)}`;
  const typeLabel = listing.listingType === "rent" || listing.listingType === "ResidentialLease" ? "Rental" : "Sale";
  const details = [
    listing.beds != null ? `${listing.beds} bed` : null,
    listing.baths != null ? `${listing.baths} bath` : null,
    listing.sqft ? `${listing.sqft.toLocaleString()} sqft` : null,
  ].filter(Boolean).join(" &middot; ");

  const photoHtml = listing.photoUrl
    ? `<tr><td style="padding:0;"><img src="${escapeHtml(listing.photoUrl)}" alt="${escapeHtml(listing.address)}" width="536" style="width:100%;max-width:536px;height:auto;display:block;"></td></tr>`
    : "";

  const noteHtml = personalNote
    ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
        <tr>
          <td width="3" style="background-color:${BRAND_GOLD};"></td>
          <td style="padding:12px 16px;background-color:#f9fafb;">
            <p style="font-size:14px;color:#374151;margin:0;font-style:italic;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(personalNote)}</p>
            <p style="font-size:12px;color:#9ca3af;margin:6px 0 0;font-family:Arial,Helvetica,sans-serif;">&mdash; ${escapeHtml(agentName)}</p>
          </td>
        </tr>
      </table>`
    : "";

  return wrapEmail(`
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;">
      Hi ${escapeHtml(clientName)},
    </p>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;">
      ${escapeHtml(agentName)} has sent you a listing to review:
    </p>
    ${noteHtml}
    <!-- Listing Card -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;margin-bottom:24px;">
      ${photoHtml}
      <tr><td style="padding:20px;">
        <table cellpadding="0" cellspacing="0" border="0">
          <tr><td style="padding:0 0 10px;">
            <table cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="background-color:${BRAND_GOLD};padding:4px 12px;font-size:11px;font-weight:700;color:#ffffff;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;">
                ${escapeHtml(typeLabel)}
              </td>
            </tr></table>
          </td></tr>
          <tr><td style="font-size:18px;font-weight:700;color:${BRAND_DARK};padding:0 0 4px;font-family:Arial,Helvetica,sans-serif;">
            ${escapeHtml(listing.address)}
          </td></tr>
          <tr><td style="font-size:22px;font-weight:800;color:${BRAND_GOLD};padding:0 0 4px;font-family:Arial,Helvetica,sans-serif;">
            ${escapeHtml(listing.price)}
          </td></tr>
          ${details ? `<tr><td style="font-size:13px;color:#6b7280;padding:0;font-family:Arial,Helvetica,sans-serif;">${details}</td></tr>` : ""}
        </table>
      </td></tr>
    </table>
    <!-- CTA Button -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td align="center" style="padding:0 0 24px;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${detailUrl}" style="height:48px;v-text-anchor:middle;width:240px;" arcsize="13%" fillcolor="${BRAND_GOLD}" stroke="f">
          <w:anchorlock/><center style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;">View Full Listing</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-->
        <a href="${detailUrl}" style="display:inline-block;padding:14px 40px;background-color:${BRAND_GOLD};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:6px;font-family:Arial,Helvetica,sans-serif;">View Full Listing</a>
        <!--<![endif]-->
      </td></tr>
    </table>
    <p style="font-size:13px;color:#9ca3af;margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;">
      Interested? Reply to this email or call ${escapeHtml(agentName)} to schedule a showing.
    </p>
    <p style="font-size:11px;color:#9ca3af;margin:0;font-family:Arial,Helvetica,sans-serif;">
      Listing data provided by the Real Estate Board of New York (REBNY) Residential Listing Service.
    </p>
  `);
}

/**
 * Investor / 1031-exchange listing campaign email.
 *
 * Rendered PER RECIPIENT from a hydrated listing (dbListingToPublicDTO) so the
 * primary photo comes from the floor-plan-safe resolver and the CTA uses the
 * canonical listing URL. The editable fields (headline/intro/bullets/CTA
 * wording/rent/lease) come from the CRM preview screen; the structured facts
 * (price/maintenance/beds/baths/address) come from the listing record.
 *
 * Compliance: wrapEmail() supplies the physical-address + Fair Housing FOOTER.
 * The signed one-click unsubscribe is carried by sendEmail()'s List-Unsubscribe
 * header; `unsubscribeUrl` here is the visible body link (self-service form when
 * tokenless). The 1031 disclaimer directs recipients to their own advisers.
 */
export interface InvestorListingEmailData {
  // ── Listing identity ──
  address: string;
  neighborhood?: string | null;
  price: string;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  propertyType?: string | null;
  maintenance?: string | null;
  currentRent?: string | null;
  leaseExpiration?: string | null;
  detailUrl: string;
  primaryPhotoUrl?: string | null;
  floorPlanUrl?: string | null;
  // ── Computed investment metrics (headline band + snapshot table) ──
  metrics?: InvestmentMetrics | null;
  methodologyNote?: string | null;
  // ── Editable copy ──
  headline?: string;
  intro?: string;
  /** Building-specific purchase-structure note (e.g. condop / ROFR). Not a
   *  universal default — supplied per listing so it never leaks to another. */
  purchaseStructure?: string | null;
  benefitBullets?: string[];
  locationBlurb?: string;
  ctaViewListing?: string;
  ctaFinancials?: string;
  ctaShowing?: string;
  // ── Brand + full agent credentials ──
  logoUrl?: string | null;
  equalHousingLogoUrl?: string | null;
  agentPhotoUrl?: string | null;
  agentName: string;
  agentTitle?: string | null;
  agentLicense?: string | null;
  agentPhone?: string | null;
  agentEmail?: string | null;
  brokerName?: string | null;
  brokerLicense?: string | null;
  officeAddress?: string | null;
  officePhone?: string | null;
  unsubscribeUrl?: string | null;
}

export function investorListingEmail(d: InvestorListingEmailData): string {
  // Palette + fonts match mallan.nyc: slate accent (no gold — too low-contrast),
  // dark-slate text (no pure black), Urbanist display + Inter body. `gold`/`serif`
  // keep their legacy names to avoid churn but now hold the site's slate + Urbanist.
  const gold = "#3d4556";        // brand slate — accent, rules, CTA
  const ink = "#2a2f3a";         // dark-slate text (not black)
  const soft = "#f4f5f7";        // light neutral card
  const line = "#e3e5e9";        // hairline
  const muted = "#7c8290";       // muted slate
  const serif = "'Urbanist','Helvetica Neue',Arial,sans-serif";  // site display font
  const sans = "'Inter','Helvetica Neue',Arial,sans-serif";      // site body font
  const p = (s: string) => escapeHtml(s);

  const logo = d.logoUrl || `${BASE_URL}/images/mallan-logo.png`;
  const eqLogo = d.equalHousingLogoUrl || `${BASE_URL}/images/equal-housing-logo.svg`;
  const brokerName = d.brokerName || "Mallan Real Estate Inc.";
  const brokerLicense = d.brokerLicense || "10991205323";
  const officeAddress = d.officeAddress || "400 East 90th Street, Suite 17C, New York, NY 10128";
  const officePhone = d.officePhone || "646-258-4460";
  const unsub = d.unsubscribeUrl || `${BASE_URL}/unsubscribe`;

  // NO hard-coded defaults — the campaign UI is exposed on every listing row, so
  // listing-specific copy must come from the compose step (or listing data) and
  // NEVER a baked-in default, or a blank compose would advertise false facts for
  // a different property. Empty content simply omits its section.
  const hook = d.intro || "";
  // Each bullet is "Lead — detail"; the template bolds the lead.
  const bullets = (d.benefitBullets && d.benefitBullets.length) ? d.benefitBullets : [];
  const locationBullets = (d.locationBlurb && d.locationBlurb.trim())
    ? d.locationBlurb.split("\n").map((s) => s.trim()).filter(Boolean)
    : [];
  const beds = d.beds != null ? `${d.beds} Bed` : null;
  const baths = d.baths != null ? `${d.baths} Bath` : null;
  const sqftStr = d.sqft != null ? `${Math.round(d.sqft).toLocaleString("en-US")} SF` : null;
  const specLine = [beds, baths, sqftStr, d.propertyType].filter(Boolean).join("  ·  ");

  // Primary CTA — bulletproof VML + HTML, full width, Outlook-safe.
  const primaryCta = (label: string, url: string) => `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr><td align="center">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:50px;v-text-anchor:middle;width:520px;" arcsize="6%" fillcolor="${gold}" stroke="f">
        <w:anchorlock/><center style="color:#ffffff;font-family:${sans};font-size:15px;font-weight:bold;letter-spacing:.5px;">${p(label)}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <a href="${url}" style="display:block;padding:16px 24px;background-color:${gold};color:#ffffff;font-size:15px;font-weight:700;letter-spacing:.5px;text-decoration:none;border-radius:3px;font-family:${sans};text-align:center;">${p(label)}</a>
      <!--<![endif]-->
    </td></tr></table>`;
  const ghost = (label: string, url: string) => `
    <a href="${url}" style="display:block;padding:13px 8px;border:1px solid ${ink};color:${ink};font-size:12px;font-weight:700;letter-spacing:.4px;text-decoration:none;border-radius:3px;font-family:${sans};text-align:center;">${p(label)}</a>`;

  // Key figures — a clean LIGHT row (no dark block): Price · Interior · Maintenance · Cap Rate.
  const capStr = d.metrics && d.metrics.capRatePct != null ? `${d.metrics.capRatePct.toFixed(1)}%` : null;
  const stats = [
    { label: "Price", value: d.price },
    { label: "Interior", value: d.sqft != null ? `${Math.round(d.sqft).toLocaleString("en-US")} SF` : null },
    { label: "Maintenance", value: d.maintenance || null },
    { label: "Est. Cap Rate", value: capStr },
  ].filter((s) => !!s.value);
  const statW = Math.floor(100 / (stats.length || 1));
  const bandHtml = `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-top:2px solid ${gold};border-bottom:1px solid ${line};"><tr>${
    stats.map((s, i) => `<td width="${statW}%" style="padding:16px 6px;text-align:center;${i > 0 ? `border-left:1px solid ${line};` : ""}vertical-align:top;">
        <p style="margin:0 0 5px;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${muted};font-family:${sans};">${p(s.label)}</p>
        <p style="margin:0;font-size:19px;line-height:1.15;color:${ink};font-family:${serif};font-weight:700;">${p(String(s.value))}</p>
      </td>`).join("")
  }</tr></table>`;

  const heroHtml = d.primaryPhotoUrl
    ? `<img src="${p(d.primaryPhotoUrl)}" alt="${p(d.address)}" width="600" style="width:100%;max-width:600px;height:auto;display:block;">`
    : "";
  const floorSection = d.floorPlanUrl
    ? `<tr><td style="padding:26px 32px 0;">
         ${sectionTitle("Floor Plan", gold, sans)}
         <img src="${p(d.floorPlanUrl)}" alt="Floor plan — ${p(d.address)}" width="536" style="width:100%;max-width:536px;height:auto;display:block;border:1px solid ${line};">
       </td></tr>`
    : "";

  const body = `
    <!-- Header: company name + instant "what is this" label -->
    <tr><td align="center" style="padding:26px 32px 18px;border-bottom:2px solid ${gold};">
      <img src="${logo}" alt="Mallan Real Estate" height="34" style="height:34px;width:auto;display:block;margin:0 auto 9px;">
      <p style="margin:0;font-size:17px;letter-spacing:4px;font-weight:700;color:${ink};font-family:${serif};">MALLAN REAL ESTATE</p>
      <p style="margin:10px 0 0;font-size:15px;letter-spacing:2px;text-transform:uppercase;color:${gold};font-weight:700;font-family:${sans};">1031 Replacement Property</p>
    </td></tr>

    <!-- Hero -->
    <tr><td style="padding:0;">${heroHtml}</td></tr>

    <!-- Address block -->
    <tr><td style="padding:24px 32px 6px;">
      <p style="font-size:26px;line-height:1.15;font-weight:700;color:${ink};margin:0 0 5px;font-family:${serif};">${p(d.address)}</p>
      ${d.neighborhood ? `<p style="font-size:14px;color:${muted};margin:0 0 3px;font-family:${sans};letter-spacing:.3px;">${p(d.neighborhood)}</p>` : ""}
      ${specLine ? `<p style="font-size:12px;color:#8a857c;margin:0;font-family:${sans};letter-spacing:.5px;text-transform:uppercase;">${p(specLine)}</p>` : ""}
    </td></tr>

    <!-- Figures -->
    <tr><td style="padding:18px 32px 0;">${bandHtml}</td></tr>
    <!-- Interactive calculators on the listing page -->
    <tr><td align="center" style="padding:14px 32px 0;">
      <a href="${d.detailUrl}#investor-calculator" style="font-size:14px;color:${gold};font-weight:700;text-decoration:none;font-family:${sans};letter-spacing:.2px;">&#128200; Cash-on-Cash &nbsp;&middot;&nbsp; &#128202; ROI calculator &rarr;</a>
    </td></tr>

    ${hook ? `<!-- Hook: the one-second value proposition -->
    <tr><td style="padding:24px 32px 4px;">
      <p style="font-size:19px;line-height:1.4;color:${ink};margin:0;font-family:${serif};font-weight:700;">${p(hook)}</p>
    </td></tr>` : ""}

    ${bullets.length ? `<!-- Investment highlights — bold-lead points -->
    <tr><td style="padding:16px 32px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
        ${bullets.map((b) => {
          const idx = String(b).indexOf(" — ");
          const lead = idx > -1 ? String(b).slice(0, idx) : String(b);
          const tail = idx > -1 ? String(b).slice(idx + 3) : "";
          return `<tr>
            <td valign="top" style="padding:6px 12px 6px 0;font-size:13px;color:${gold};font-family:${sans};line-height:1.7;">&#9670;</td>
            <td style="padding:6px 0;font-size:14px;color:#3a3833;line-height:1.6;font-family:${sans};">${tail ? `<strong style="color:${ink};">${p(lead)}</strong> &mdash; ${p(tail)}` : p(lead)}</td>
          </tr>`;
        }).join("")}
      </table>
    </td></tr>` : ""}

    ${d.purchaseStructure ? `<!-- Purchase structure (building-specific) -->
    <tr><td style="padding:22px 32px 0;">
      ${sectionTitle("Purchase Structure", gold, sans)}
      <p style="font-size:14px;color:#3a3833;line-height:1.6;margin:0;font-family:${sans};">${p(d.purchaseStructure)}</p>
    </td></tr>` : ""}

    ${floorSection}

    ${locationBullets.length ? `<!-- Building & location -->
    <tr><td style="padding:24px 32px 0;">
      ${sectionTitle("Building & Location", gold, sans)}
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
        ${locationBullets.map((b) => {
          const idx = String(b).indexOf(" — ");
          const lead = idx > -1 ? String(b).slice(0, idx) : String(b);
          const tail = idx > -1 ? String(b).slice(idx + 3) : "";
          return `<tr>
            <td valign="top" style="padding:6px 12px 6px 0;font-size:13px;color:${gold};font-family:${sans};line-height:1.7;">&#9670;</td>
            <td style="padding:6px 0;font-size:14px;color:#3a3833;line-height:1.6;font-family:${sans};">${tail ? `<strong style="color:${ink};">${p(lead)}</strong> &mdash; ${p(tail)}` : p(lead)}</td>
          </tr>`;
        }).join("")}
      </table>
    </td></tr>` : ""}

    <!-- CTAs: Schedule a Showing is the primary action -->
    <tr><td style="padding:26px 32px 0;">
      ${primaryCta(d.ctaShowing || "Schedule a Showing", `mailto:${p(d.agentEmail || "")}?subject=${encodeURIComponent("Private showing — " + d.address)}`)}
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin-top:10px;"><tr>
        <td width="50%" style="padding-right:6px;">${ghost(d.ctaFinancials || "Request Financials", `mailto:${p(d.agentEmail || "")}?subject=${encodeURIComponent("Financials — " + d.address)}`)}</td>
        <td width="50%" style="padding-left:6px;">${ghost(d.ctaViewListing || "View the Listing", d.detailUrl)}</td>
      </tr></table>
    </td></tr>

    <!-- Disclaimer -->
    <tr><td style="padding:24px 32px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
        <td width="3" style="background-color:${gold};"></td>
        <td style="padding:12px 16px;background-color:${soft};">
          <p style="font-size:11px;color:${muted};line-height:1.6;margin:0;font-family:${sans};">
            Full financials available on request. Informational purposes only — not tax, legal, or investment advice.
            Financial figures are illustrative estimates based on figures provided and must be independently verified,
            unlevered. Whether this property qualifies as a
            like-kind replacement property, and all 1031 identification and closing deadlines, must be confirmed by the
            buyer's own attorney, tax adviser, and qualified intermediary. Nothing herein guarantees eligibility, income, or return.
          </p>
        </td>
      </tr></table>
    </td></tr>

    <!-- Agent contact card -->
    <tr><td style="padding:26px 32px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="border:1px solid ${line};background-color:${soft};"><tr>
        ${d.agentPhotoUrl ? `<td width="92" style="padding:18px 0 18px 20px;vertical-align:middle;">
          <img src="${p(d.agentPhotoUrl)}" alt="${p(d.agentName)}" width="72" height="72" style="width:72px;height:72px;border-radius:50%;display:block;">
        </td>` : ""}
        <td style="padding:18px 22px;vertical-align:middle;">
          <p style="font-size:10px;letter-spacing:1.6px;text-transform:uppercase;color:${gold};font-weight:700;margin:0 0 7px;font-family:${sans};">Presented By</p>
          <p style="font-size:17px;color:${ink};margin:0;font-family:${serif};font-weight:700;">${p(d.agentName)}</p>
          ${d.agentTitle ? `<p style="color:${muted};font-size:12px;margin:3px 0 0;font-family:${sans};">${p(d.agentTitle)}</p>` : ""}
          <p style="color:${muted};font-size:12px;margin:1px 0 0;font-family:${sans};">${p(brokerName)}</p>
          <p style="margin:9px 0 0;font-family:${sans};font-size:13px;color:${ink};">
            ${d.agentPhone ? `<span style="font-weight:700;">${p(d.agentPhone)}</span>` : ""}${d.agentPhone && d.agentEmail ? `&nbsp;&nbsp;·&nbsp;&nbsp;` : ""}${d.agentEmail ? `<a href="mailto:${p(d.agentEmail)}" style="color:${gold};text-decoration:none;font-weight:700;">${p(d.agentEmail)}</a>` : ""}
          </p>
          <p style="color:${muted};font-size:11px;margin:4px 0 0;font-family:${sans};">${p(officeAddress)}</p>
        </td>
      </tr></table>
    </td></tr>

    <!-- Compliance footer -->
    <tr><td style="padding:24px 32px 30px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-top:1px solid ${line};"><tr><td style="padding:16px 0 0;">
        <table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
          <td style="vertical-align:middle;padding-right:10px;"><img src="${eqLogo}" alt="Equal Housing Opportunity" width="26" height="26" style="width:26px;height:26px;display:block;"></td>
          <td style="vertical-align:middle;"><p style="font-size:11px;color:#9a948a;margin:0;font-family:${sans};line-height:1.5;">${p(brokerName)} &nbsp;|&nbsp; ${p(officeAddress)}<br>Licensed Real Estate Broker &nbsp;|&nbsp; NY DOS #${p(brokerLicense)} &nbsp;|&nbsp; ${p(officePhone)}</p></td>
        </tr></table>
        <p style="font-size:10px;color:#a8a29a;line-height:1.6;margin:12px 0 0;font-family:${sans};">
          Mallan Real Estate Inc. is committed to compliance with the Fair Housing Act, the New York State Human Rights Law, and the
          NYC Human Rights Law (Title 8). We do not discriminate on the basis of race, color, religion, sex, national origin, familial
          status, disability, sexual orientation, gender identity, marital status, age, lawful source of income, or any other protected class.
        </p>
        <p style="font-size:11px;margin:12px 0 0;font-family:${sans};">
          <a href="${BASE_URL}/fair-housing" style="color:${gold};text-decoration:underline;">Fair Housing</a> &nbsp;|&nbsp;
          <a href="${BASE_URL}/privacy" style="color:${gold};text-decoration:underline;">Privacy</a> &nbsp;|&nbsp;
          <a href="${p(unsub)}" style="color:#9a948a;text-decoration:underline;">Unsubscribe</a>
        </p>
      </td></tr></table>
    </td></tr>`;

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style type="text/css">body,table,td{font-family:${sans};} img{border:0;line-height:100%;outline:none;text-decoration:none;} a{color:${gold};}</style>
</head>
<body style="margin:0;padding:0;background-color:#ecebe7;width:100%;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background-color:#ecebe7;">
  <tr><td align="center" style="padding:24px 12px;">
    <table width="600" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background-color:#ffffff;border:1px solid ${line};max-width:600px;width:100%;">
      ${body}
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/** Small gold section eyebrow used across the investor email. */
function sectionTitle(t: string, gold: string, sans: string): string {
  return `<p style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.4px;color:${gold};margin:0 0 12px;font-family:${sans};">${escapeHtml(t)}</p>`;
}

/**
 * Generic CRM email — sent from the compose email modal in Communications.
 */
export function genericCrmEmail(
  body: string,
  agentName: string
): string {
  return wrapEmail(`
    <div style="font-size:15px;color:#374151;line-height:1.7;white-space:pre-wrap;">${escapeHtml(body)}</div>
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;">
      <p style="font-size:13px;color:#6b7280;margin:0;">${escapeHtml(agentName)}</p>
      <p style="font-size:12px;color:#9ca3af;margin:4px 0 0;">Mallan Real Estate Inc. | 646-258-4460</p>
    </div>
  `);
}

/**
 * Lifecycle trigger email — sent by lib/lifecycle/engine.ts when a
 * trigger with action_type='email' fires.
 *
 * Recipient: the LEAD (not the agent). Per-trigger consent enforcement
 * is the target-finder's responsibility (e.g.,
 * findQuarterlyNurtureTargets filters by consent_captured_at).
 * `last_unsubscribe_at` is honored at the sendEmail() boundary.
 *
 * Body content for Tier A is intentionally generic + safe — a brief
 * professional touch with a CTA to schedule a call. Trigger-specific
 * rich content (matched listings, market stats, rent-vs-buy widget)
 * is Tier B work that needs additional Trestle queries and a richer
 * action_config schema.
 */
export function lifecycleTriggerEmail(opts: {
  leadName: string;
  trigger: string;
  urgency: boolean;
  context: Record<string, unknown>;
}): string {
  const { leadName, trigger, urgency, context } = opts;

  // Per-trigger lead-facing copy. Triggers that originate as
  // agent-facing (inquiry_stale, momentum_drop) fall through to a
  // safe generic message — those triggers should normally use
  // action_type='notification' or 'agent_alert'; if a broker has
  // configured them as 'email' we still ship a non-embarrassing copy.
  let opening: string;
  let body: string;
  switch (trigger) {
    case 'lease_expiring_180d': {
      const days = Number(context.days_to_expiry) || 180;
      opening = `Your lease comes up for renewal in roughly ${days} days. That feels distant, but in the New York market it’s the right time to start exploring what comes next.`;
      body = `Whether you’re thinking about renewing, finding a new place to rent, or buying for the first time, we can help you compare. There’s no commitment — just a conversation.`;
      break;
    }
    case 'lease_expiring_90d': {
      const days = Number(context.days_to_expiry) || 90;
      opening = `Your lease ends in about ${days} days. That’s the window where most New Yorkers start lining up their next move.`;
      body = `If you’re leaning toward renting again, we can show you no-fee options. If buying is even a remote possibility, we can sketch what your monthly cost would look like — often closer to your current rent than you’d expect.`;
      break;
    }
    case 'lease_expiring_30d': {
      const days = Number(context.days_to_expiry) || 30;
      opening = `Your lease ends in about ${days} days. We don’t want this to sneak up on you.`;
      body = `Reply with what you’d like to do — renew, look at new rentals, or explore buying — and we can move quickly. NYC inventory shifts week to week and we have a short list of properties that match what you’ve looked at before.`;
      break;
    }
    case 'quarterly_nurture': {
      opening = `It’s been a few months since we last connected, so I wanted to share a brief update on the New York market.`;
      body = `Inventory and pricing in your preferred neighborhoods continue to shift, and we have some new listings worth looking at. If you’d like a tailored snapshot — or you’re ready to revisit your search — just reply and we’ll pull together a few options.`;
      break;
    }
    case 'conviction_threshold': {
      opening = `I noticed you’ve been spending time on listings that fit your search profile closely — that’s usually a sign you’re narrowing in.`;
      body = `When you’re ready to take the next step, we can put together a quick offer-readiness checklist (financing, comparable sales, building requirements) so you’re positioned to move fast on the right one.`;
      break;
    }
    case 'ghost_detected': {
      opening = `It’s been a little while since you’ve been by the listings, so I wanted to check in.`;
      body = `Has anything changed about your timeline or preferences? If you’d like to take a break, that’s fine too — just say the word. Otherwise we’d love to refresh your matches.`;
      break;
    }
    default: {
      opening = `Your Mallan Real Estate agent has an update for you.`;
      body = `If you have a few minutes, please reach out and we’ll share the details directly.`;
    }
  }

  const urgencyBanner = urgency
    ? `<div style="background:#fee2e2;border:1px solid #f87171;border-radius:8px;padding:12px 16px;margin:0 0 16px;">
         <p style="font-size:13px;font-weight:700;color:#991b1b;margin:0;text-transform:uppercase;letter-spacing:0.5px;">Time-sensitive</p>
       </div>`
    : '';

  return wrapEmail(`
    ${urgencyBanner}
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
      Hi ${escapeHtml(leadName)},
    </p>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
      ${escapeHtml(opening)}
    </p>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 20px;">
      ${escapeHtml(body)}
    </p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${BASE_URL}"
         style="display:inline-block;padding:14px 32px;background:${BRAND_GOLD};color:#ffffff;
                font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
        Schedule a Conversation
      </a>
    </div>
    <p style="font-size:13px;color:#9ca3af;margin:16px 0 0;line-height:1.5;">
      Or simply reply to this email — we read every reply.
    </p>
  `);
}

/**
 * Feed-reconcile abort alert — sent by app/api/cron/feed-reconcile when
 * the GHOST_ABORT_CAP fires (likely Trestle outage). Goes to brokers as
 * a transactional system notification. Body explicitly cites the count
 * and the cap so the operator can decide whether to investigate or wait.
 */
export function feedReconcileAbortEmail(opts: {
  recipientName: string;
  ghostCount: number;
  cap: number;
  trestleActiveCount: number;
  ourActiveCount: number;
  abortReason: string;
}): string {
  return wrapEmail(`
    <div style="background:#fee2e2;border:1px solid #f87171;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
      <p style="font-size:12px;font-weight:700;color:#991b1b;margin:0 0 4px;text-transform:uppercase;letter-spacing:1px;">Feed reconcile aborted</p>
      <p style="font-size:14px;color:#7f1d1d;margin:0;">Trestle anomaly detected. No transitions made.</p>
    </div>
    <h1 style="font-size:22px;color:${BRAND_DARK};margin:0 0 16px;">Feed Reconcile Aborted — Manual Review Required</h1>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
      Hi ${escapeHtml(opts.recipientName || 'Broker')},
    </p>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
      The daily feed-reconcile cron detected <strong>${opts.ghostCount}</strong> ghost listings
      (Active in our DB but missing from the Trestle Active feed) — exceeding the safety cap of
      <strong>${opts.cap}</strong>. The cron aborted before transitioning anything.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;margin:0 0 16px;">
      <tr>
        <td style="padding:10px 16px;font-size:13px;color:#6b7280;background:#f9fafb;border-bottom:1px solid #e5e7eb;">Trestle Active count</td>
        <td style="padding:10px 16px;font-size:13px;font-weight:600;color:${BRAND_DARK};text-align:right;background:#f9fafb;border-bottom:1px solid #e5e7eb;">${opts.trestleActiveCount.toLocaleString()}</td>
      </tr>
      <tr>
        <td style="padding:10px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Our DB Active count</td>
        <td style="padding:10px 16px;font-size:13px;font-weight:600;color:${BRAND_DARK};text-align:right;border-bottom:1px solid #e5e7eb;">${opts.ourActiveCount.toLocaleString()}</td>
      </tr>
      <tr>
        <td style="padding:10px 16px;font-size:13px;color:#6b7280;background:#fef2f2;">Ghosts detected</td>
        <td style="padding:10px 16px;font-size:14px;font-weight:700;color:#dc2626;text-align:right;background:#fef2f2;">${opts.ghostCount.toLocaleString()}</td>
      </tr>
    </table>
    <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 16px;">
      A delta this large typically indicates a Trestle fetch failure (partial result) rather than an
      actual mass-disappearance. The cron will retry on its next schedule. Investigate Trestle status,
      or run <code style="background:#f3f4f6;padding:1px 4px;border-radius:3px;">scripts/feed-reconcile-dry-run</code>
      to inspect the diff manually.
    </p>
    <p style="font-size:13px;color:#9ca3af;margin:16px 0 0;line-height:1.5;">
      This is an automated alert from the feed-reconcile cron. Reason code: <code>${escapeHtml(opts.abortReason)}</code>.
    </p>
  `);
}

/**
 * Listing expiration email — sent by the listing-expiration cron when an
 * exclusive agreement is approaching expiration (urgent_7d) or when the
 * agent has missed the 7-business-day protected-buyer-names deadline
 * (deadline_passed).
 *
 * UCBA Article I §6/§7/§8 background:
 *   - On expiration, the agent has 7 BUSINESS DAYS to submit up to 6
 *     protected-buyer names + the notice of expired listing.
 *   - Failure to submit within 7 business days → no compensation claim
 *     available on those buyers (financial loss to the agent).
 *   - Submitting names by deadline → 90 calendar days of protection
 *     starting from expiration.
 *
 * Today these notifications fire only as in-app `Notification` rows.
 * This template adds an email channel for the two highest-stakes
 * branches (urgent_7d → listing agent; deadline_passed → broker).
 *
 * Sent via the company channel as a transactional system notification
 * (an urgency-driven operational message tied to a specific UCBA
 * deadline, not a marketing send). Transactional flag in the calling
 * cron skips the Lead-level opt-out boundary check at sendEmail().
 */
export function listingExpirationEmail(opts: {
  variant: "urgent_7d" | "deadline_passed";
  recipientName: string;
  address: string;
  listingId: string;
  expirationDate?: Date;
  namesDeadline?: Date;
  protectionEnds?: Date;
}): string {
  const fmt = (d?: Date) =>
    d
      ? d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
      : "—";

  if (opts.variant === "urgent_7d") {
    return wrapEmail(`
      <div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
        <p style="font-size:12px;font-weight:700;color:#92400e;margin:0 0 4px;text-transform:uppercase;letter-spacing:1px;">UCBA Art. I §6 / §7 — 7-day urgent</p>
        <p style="font-size:14px;color:#78350f;margin:0;">Action required before expiration.</p>
      </div>
      <h1 style="font-size:22px;color:${BRAND_DARK};margin:0 0 16px;">Your Exclusive on ${escapeHtml(opts.address)} Expires in 7 Days</h1>
      <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
        Hi ${escapeHtml(opts.recipientName || "Agent")},
      </p>
      <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
        Your exclusive listing agreement for <strong>${escapeHtml(opts.address)}</strong>
        (RLS&nbsp;ID&nbsp;${escapeHtml(opts.listingId)}) expires on
        <strong>${fmt(opts.expirationDate)}</strong>.
      </p>
      <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
        Per UCBA Article&nbsp;I §6/§7, you have <strong>7 business days from the expiration
        date</strong> to submit up to <strong>6 protected-buyer names</strong> plus the notice of
        expired listing. Submitting on time preserves your right to compensation
        claims on those buyers for 90 calendar days after expiration.
        <strong>Missing the deadline forfeits the claim.</strong>
      </p>
      <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
        Prepare your protected-buyer list now in the CRM Protected Periods panel,
        and have the notice of expired listing ready to upload as soon as the
        agreement expires.
      </p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${BASE_URL}/crm"
           style="display:inline-block;padding:14px 32px;background:${BRAND_GOLD};color:#ffffff;
                  font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
          Open CRM Dashboard
        </a>
      </div>
      <p style="font-size:13px;color:#9ca3af;margin:16px 0 0;line-height:1.5;">
        This is an automated UCBA-compliance reminder from the listing-expiration cron.
        It is sent in addition to the in-app notification.
      </p>
    `);
  }

  // variant === "deadline_passed"
  return wrapEmail(`
    <div style="background:#fee2e2;border:1px solid #f87171;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
      <p style="font-size:12px;font-weight:700;color:#991b1b;margin:0 0 4px;text-transform:uppercase;letter-spacing:1px;">UCBA Art. I §6 / §7 — deadline missed</p>
      <p style="font-size:14px;color:#7f1d1d;margin:0;">No compensation claim available on this listing.</p>
    </div>
    <h1 style="font-size:22px;color:${BRAND_DARK};margin:0 0 16px;">Protected-Buyer Deadline Missed: ${escapeHtml(opts.address)}</h1>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
      Hi ${escapeHtml(opts.recipientName || "Broker")},
    </p>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
      The 7-business-day deadline to submit protected-buyer names for
      <strong>${escapeHtml(opts.address)}</strong>
      (RLS&nbsp;ID&nbsp;${escapeHtml(opts.listingId)}) has passed${
        opts.namesDeadline ? ` (deadline was ${fmt(opts.namesDeadline)})` : ""
      }. The protected period status has been updated to
      <strong>missed_deadline</strong>.
    </p>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
      Per UCBA Article&nbsp;I §6/§7, no compensation claim is available on protected
      buyers for this listing. Future commission protection requires re-engagement
      under a new agreement.
    </p>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
      The CRM Protected Periods panel reflects the updated status. Review with the
      assigned agent to identify process gaps for future expirations.
    </p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${BASE_URL}/crm"
         style="display:inline-block;padding:14px 32px;background:${BRAND_GOLD};color:#ffffff;
                font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
        Open CRM Dashboard
      </a>
    </div>
    <p style="font-size:13px;color:#9ca3af;margin:16px 0 0;line-height:1.5;">
      This is an automated UCBA-compliance notification from the listing-expiration cron.
      It is sent in addition to the in-app notification.
    </p>
  `);
}

/**
 * Password reset email — sent when a user requests a password reset.
 */
export function passwordResetEmail(
  token: string,
  userName?: string
): string {
  const resetUrl = `${BASE_URL}/reset-password?token=${encodeURIComponent(token)}`;

  return wrapEmail(`
    <h1 style="font-size:22px;color:${BRAND_DARK};margin:0 0 16px;">Reset Your Password</h1>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
      ${userName ? `Hi ${escapeHtml(userName)},` : "Hello,"}
    </p>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 20px;">
      We received a request to reset your password. Click the button below to choose a new password:
    </p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${resetUrl}"
         style="display:inline-block;padding:14px 32px;background:${BRAND_GOLD};color:#ffffff;
                font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
        Reset Password
      </a>
    </div>
    <p style="font-size:13px;color:#9ca3af;margin:0 0 8px;">
      This link expires in 1 hour. If you did not request a password reset, you can safely ignore this email.
    </p>
    <p style="font-size:12px;color:#d1d5db;margin:0;word-break:break-all;">
      ${resetUrl}
    </p>
  `);
}
