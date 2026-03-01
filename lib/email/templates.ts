// lib/email/templates.ts
// HTML email templates for CRM communications.
// All templates use inline CSS for email client compatibility.
// COMPLIANCE: Fair Housing disclaimer + REBNY attribution included.

const BRAND_GOLD = "#C4A052";
const BRAND_DARK = "#1a1a1a";
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://mallan.nyc";

// Shared footer for all emails
const FOOTER = `
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;line-height:1.5;">
  <p style="margin:0 0 8px;">Mallan Real Estate Inc. | 400 East 90th Street, Suite 17C, New York, NY 10128</p>
  <p style="margin:0 0 8px;">Licensed Real Estate Broker | NY DOS #10991205323 | 646-258-4460</p>
  <p style="margin:0 0 8px;">
    Mallan Real Estate Inc. is committed to compliance with the Fair Housing Act,
    the New York State Human Rights Law, and the NYC Human Rights Law (Title 8).
    We do not discriminate on the basis of race, color, religion, sex, national origin,
    familial status, disability, sexual orientation, gender identity, marital status,
    age, lawful source of income, or any other protected class.
  </p>
  <p style="margin:0;">
    <a href="${BASE_URL}/fair-housing" style="color:${BRAND_GOLD};text-decoration:underline;">Fair Housing Policy</a> |
    <a href="${BASE_URL}/privacy" style="color:${BRAND_GOLD};text-decoration:underline;">Privacy Policy</a>
  </p>
</div>`;

/**
 * Wrap email content in a styled container.
 */
function wrapEmail(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:24px;">
  <div style="background:#ffffff;border-radius:8px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="text-align:center;margin-bottom:24px;">
      <span style="font-size:20px;font-weight:700;color:${BRAND_DARK};letter-spacing:1px;">MALLAN</span>
      <span style="font-size:20px;font-weight:300;color:${BRAND_GOLD};letter-spacing:1px;margin-left:4px;">NYC</span>
    </div>
    ${content}
    ${FOOTER}
  </div>
</div>
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
      Hi ${clientName},
    </p>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
      ${agentName} at Mallan Real Estate has invited you to access your
      <strong>${roleLabel} Portal</strong>. From your portal you can view properties,
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
        <a href="${l.url}" style="color:${BRAND_DARK};text-decoration:none;font-size:14px;font-weight:600;">
          ${l.address}
        </a>
        <div style="font-size:13px;color:#6b7280;margin-top:4px;">
          ${l.price} &middot; ${l.beds} bed &middot; ${l.baths} bath
        </div>
      </td>
    </tr>
  `).join("");

  return wrapEmail(`
    <h1 style="font-size:22px;color:${BRAND_DARK};margin:0 0 16px;">New Listings for You</h1>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
      Hi ${clientName}, we found ${listings.length} new listing${listings.length !== 1 ? "s" : ""}
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
      Hi ${showing.clientName},
    </p>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 20px;">
      Your ${typeLabel.toLowerCase()} has been confirmed:
    </p>
    <div style="background:#f9fafb;border-radius:8px;padding:20px;margin:0 0 20px;">
      <table style="width:100%;font-size:14px;color:#374151;">
        <tr><td style="padding:6px 0;font-weight:600;width:100px;">Property</td><td>${showing.address}</td></tr>
        <tr><td style="padding:6px 0;font-weight:600;">Date</td><td>${showing.date}</td></tr>
        <tr><td style="padding:6px 0;font-weight:600;">Time</td><td>${showing.time}</td></tr>
        <tr><td style="padding:6px 0;font-weight:600;">Type</td><td>${typeLabel}</td></tr>
        <tr><td style="padding:6px 0;font-weight:600;">Agent</td><td>${showing.agentName}</td></tr>
        ${showing.notes ? `<tr><td style="padding:6px 0;font-weight:600;">Notes</td><td>${showing.notes}</td></tr>` : ""}
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
      Hi ${deal.agentName},
    </p>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 20px;">
      Your commission request for <strong>${deal.address}</strong> has been updated:
    </p>
    <div style="text-align:center;margin:20px 0;">
      <span style="display:inline-block;padding:8px 20px;background:${statusColor};color:#ffffff;
                   font-size:14px;font-weight:600;border-radius:20px;text-transform:uppercase;">
        ${deal.newStatus}
      </span>
    </div>
    ${deal.notes ? `<p style="font-size:14px;color:#374151;background:#f9fafb;padding:12px;border-radius:6px;">${deal.notes}</p>` : ""}
    <p style="font-size:13px;color:#9ca3af;margin:16px 0 0;">
      Deal ID: ${deal.dealId}. Log in to the CRM to view full details.
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
      ${userName ? `Hi ${userName},` : "Hello,"}
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
