// lib/email/templates.ts
// HTML email templates for CRM communications.
// All templates use inline CSS for email client compatibility.
// COMPLIANCE: Fair Housing disclaimer + REBNY attribution included.

import { escapeHtml } from "@/lib/sanitize";

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
  listings: { address: string; price: string; beds: number; baths: number; url: string }[],
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
  address: string;
  neighborhood?: string | null;
  price: string;
  beds?: number | null;
  baths?: number | null;
  propertyType?: string | null;
  maintenance?: string | null;
  currentRent?: string | null;
  leaseExpiration?: string | null;
  detailUrl: string;
  primaryPhotoUrl?: string | null;
  additionalPhotoUrls?: string[];
  headline?: string;
  intro?: string;
  benefitBullets?: string[];
  locationBlurb?: string;
  ctaViewListing?: string;
  ctaFinancials?: string;
  ctaShowing?: string;
  agentName: string;
  agentTitle?: string | null;
  agentPhone?: string | null;
  agentEmail?: string | null;
  unsubscribeUrl?: string | null;
}

export function investorListingEmail(d: InvestorListingEmailData): string {
  const gold = BRAND_GOLD;
  const dark = BRAND_DARK;
  const p = (s: string) => escapeHtml(s);

  // Bulletproof VML + HTML CTA button (Outlook-safe).
  const ctaButton = (label: string, url: string) => `
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:0 0 12px;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:46px;v-text-anchor:middle;width:300px;" arcsize="13%" fillcolor="${gold}" stroke="f">
        <w:anchorlock/><center style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;">${p(label)}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <a href="${url}" style="display:inline-block;padding:14px 36px;background-color:${gold};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:6px;font-family:Arial,Helvetica,sans-serif;">${p(label)}</a>
      <!--<![endif]-->
    </td></tr></table>`;

  const row = (label: string, value: string) => value
    ? `<tr>
        <td style="padding:6px 0;font-size:13px;color:#6b7280;font-family:Arial,Helvetica,sans-serif;width:46%;">${p(label)}</td>
        <td style="padding:6px 0;font-size:14px;color:${dark};font-weight:700;font-family:Arial,Helvetica,sans-serif;">${p(value)}</td>
      </tr>` : "";

  const headline = d.headline || "Tenant-Occupied Manhattan Investment Opportunity";
  const intro = d.intro ||
    "A rare chance to acquire an income-producing Midtown residence with an established tenant already in place — a candidate replacement property for a 1031 exchange.";
  const bullets = (d.benefitBullets && d.benefitBullets.length
    ? d.benefitBullets
    : [
        "Existing rental income from the date of closing — no lease-up period",
        "Tenant already established; lease secured through the expiration date below",
        "Manhattan residential asset with long-term appreciation potential",
        "May qualify as a like-kind replacement property for a 1031 exchange",
      ]);
  const beds = d.beds != null ? `${d.beds} BR` : null;
  const baths = d.baths != null ? `${d.baths} BA` : null;
  const bedBath = [beds, baths, d.propertyType].filter(Boolean).join(" · ");
  const unsub = d.unsubscribeUrl || `${BASE_URL}/unsubscribe`;

  const heroHtml = d.primaryPhotoUrl
    ? `<tr><td style="padding:0;"><img src="${p(d.primaryPhotoUrl)}" alt="${p(d.address)}" width="600" style="width:100%;max-width:600px;height:auto;display:block;"></td></tr>`
    : "";

  const extraPhotos = (d.additionalPhotoUrls || []).slice(0, 4);
  const extraHtml = extraPhotos.length
    ? `<tr><td style="padding:12px 0 0;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${
        extraPhotos.map((u) => `<td style="padding:0 4px;"><img src="${p(u)}" alt="${p(d.address)}" width="140" style="width:100%;max-width:140px;height:auto;display:block;border:1px solid #e5e7eb;"></td>`).join("")
      }</tr></table></td></tr>`
    : "";

  return wrapEmail(`
    <!-- Header -->
    <p style="font-size:12px;font-weight:700;letter-spacing:1px;color:${gold};text-transform:uppercase;margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;">${p(headline)}</p>
    <p style="font-size:22px;font-weight:800;color:${dark};margin:0 0 2px;font-family:Arial,Helvetica,sans-serif;">${p(d.address)}</p>
    ${d.neighborhood ? `<p style="font-size:14px;color:#6b7280;margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;">${p(d.neighborhood)}</p>` : ""}

    <!-- Hero + thumbnails -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;border:1px solid #e5e7eb;">
      ${heroHtml}${extraHtml}
    </table>

    <!-- Intro -->
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;">${p(intro)}</p>

    <!-- Investment summary -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;margin:0 0 22px;">
      <tr><td style="padding:16px 20px;">
        <p style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:${gold};margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;">Investment Summary</p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          ${row("Asking price", d.price)}
          ${bedBath ? row("Residence", bedBath) : ""}
          ${row("Current monthly rent", d.currentRent || "")}
          ${row("Lease expiration", d.leaseExpiration || "")}
          ${row("Monthly maintenance", d.maintenance || "")}
          ${row("Tenancy", "Existing tenant in place")}
        </table>
      </td></tr>
    </table>

    <!-- Why a 1031 buyer -->
    <p style="font-size:16px;font-weight:700;color:${dark};margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;">Why this may appeal to a 1031 buyer</p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
      ${bullets.map((b) => `<tr>
        <td valign="top" style="padding:2px 8px 2px 0;font-size:15px;color:${gold};font-family:Arial,Helvetica,sans-serif;">&bull;</td>
        <td style="padding:2px 0;font-size:14px;color:#374151;line-height:1.5;font-family:Arial,Helvetica,sans-serif;">${p(b)}</td>
      </tr>`).join("")}
    </table>

    ${d.locationBlurb ? `
    <p style="font-size:16px;font-weight:700;color:${dark};margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;">Building &amp; location</p>
    <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 22px;font-family:Arial,Helvetica,sans-serif;">${p(d.locationBlurb)}</p>` : ""}

    <!-- CTAs -->
    ${ctaButton(d.ctaViewListing || "View Full Listing", d.detailUrl)}
    ${ctaButton(d.ctaFinancials || "Request Financial Details", `mailto:${p(d.agentEmail || "")}?subject=${encodeURIComponent("Financial details — " + d.address)}`)}
    ${ctaButton(d.ctaShowing || "Schedule a Private Showing", `mailto:${p(d.agentEmail || "")}?subject=${encodeURIComponent("Private showing — " + d.address)}`)}

    <!-- 1031 disclaimer -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 8px;"><tr>
      <td width="3" style="background-color:${gold};"></td>
      <td style="padding:10px 14px;background-color:#f9fafb;">
        <p style="font-size:11px;color:#6b7280;line-height:1.5;margin:0;font-family:Arial,Helvetica,sans-serif;">
          This message is for informational purposes only and is not tax, legal, or investment advice.
          Whether this property qualifies as a like-kind replacement property, and all applicable
          identification and closing deadlines, must be confirmed by the buyer's own attorney, tax
          adviser, and qualified intermediary. Nothing herein guarantees eligibility, income, or return.
        </p>
      </td>
    </tr></table>

    <!-- Signature -->
    <p style="font-size:14px;color:#374151;margin:20px 0 0;font-family:Arial,Helvetica,sans-serif;">
      ${p(d.agentName)}${d.agentTitle ? `<br><span style="color:#6b7280;font-size:13px;">${p(d.agentTitle)}</span>` : ""}
      ${d.agentPhone ? `<br><span style="color:#6b7280;font-size:13px;">${p(d.agentPhone)}</span>` : ""}
      ${d.agentEmail ? `<br><a href="mailto:${p(d.agentEmail)}" style="color:${gold};font-size:13px;">${p(d.agentEmail)}</a>` : ""}
    </p>
    <p style="font-size:11px;color:#9ca3af;margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;">
      Prefer not to receive investment opportunities? <a href="${p(unsub)}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a>.
    </p>
  `);
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
