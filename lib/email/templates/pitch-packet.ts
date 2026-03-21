/**
 * Pitch Packet Email Template
 *
 * Professional cover letter sent to potential sellers with
 * key highlights from the pitch packet analysis.
 */

interface PitchPacketEmailParams {
  recipientName: string;
  agentName: string;
  agentPhone: string;
  agentEmail: string;
  propertyAddress: string;
  estimatedValue: string;
  buyerCount: number;
  exposureReach: string;
  netProceeds?: string;
}

export function pitchPacketEmail(params: PitchPacketEmailParams): { subject: string; html: string } {
  const {
    recipientName,
    agentName,
    agentPhone,
    agentEmail,
    propertyAddress,
    estimatedValue,
    buyerCount,
    exposureReach,
    netProceeds,
  } = params;

  const subject = `Your Home's Market Value — ${agentName}, Mallan Real Estate`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;overflow:hidden;max-width:600px;">

<!-- Header -->
<tr><td style="background:#111827;padding:24px 32px;text-align:center;">
  <div style="font-size:20px;font-weight:800;color:#B8860B;letter-spacing:2px;">MALLAN REAL ESTATE INC.</div>
  <div style="font-size:11px;color:#9CA3AF;margin-top:4px;">400 East 90th Street, Suite 17C, New York, NY 10128</div>
</td></tr>

<!-- Gold accent line -->
<tr><td style="height:3px;background:#B8860B;"></td></tr>

<!-- Body -->
<tr><td style="padding:32px;">
  <p style="font-size:15px;color:#111827;margin:0 0 16px;">Dear ${escapeHtml(recipientName)},</p>

  <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 16px;">
    I've prepared a comprehensive market analysis for your property at
    <strong>${escapeHtml(propertyAddress)}</strong>. Based on recent comparable sales
    and current market conditions, I wanted to share some key highlights with you.
  </p>

  <!-- Highlights Box -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FEFCE8;border:1px solid #B8860B33;border-radius:8px;margin:24px 0;">
  <tr><td style="padding:20px;">
    <div style="font-size:12px;font-weight:700;color:#B8860B;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">Market Analysis Highlights</div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #B8860B22;">
        <div style="font-size:11px;color:#6B7280;text-transform:uppercase;">Estimated Market Value</div>
        <div style="font-size:22px;font-weight:800;color:#111827;">${escapeHtml(estimatedValue)}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #B8860B22;">
        <div style="font-size:11px;color:#6B7280;text-transform:uppercase;">Qualified Buyers in Our Database</div>
        <div style="font-size:18px;font-weight:700;color:#111827;">${buyerCount.toLocaleString()}+</div>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 0;${netProceeds ? 'border-bottom:1px solid #B8860B22;' : ''}">
        <div style="font-size:11px;color:#6B7280;text-transform:uppercase;">Agent Network Reach</div>
        <div style="font-size:18px;font-weight:700;color:#111827;">${escapeHtml(exposureReach)}</div>
      </td>
    </tr>
    ${netProceeds ? `<tr>
      <td style="padding:8px 0;">
        <div style="font-size:11px;color:#6B7280;text-transform:uppercase;">Estimated Net Proceeds</div>
        <div style="font-size:18px;font-weight:700;color:#059669;">${escapeHtml(netProceeds)}</div>
      </td>
    </tr>` : ''}
    </table>
  </td></tr>
  </table>

  <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 16px;">
    I'd welcome the opportunity to discuss this analysis with you in detail and
    answer any questions about the current market conditions in your area.
  </p>

  <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 24px;">
    Please feel free to call me at <strong>${escapeHtml(agentPhone)}</strong>
    or reply to this email at your convenience.
  </p>

  <!-- Agent Signature -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #E5E7EB;padding-top:16px;">
  <tr><td>
    <div style="font-size:14px;font-weight:700;color:#111827;">${escapeHtml(agentName)}</div>
    <div style="font-size:12px;color:#6B7280;">Licensed Real Estate Salesperson</div>
    <div style="font-size:12px;color:#6B7280;">Mallan Real Estate Inc.</div>
    <div style="font-size:12px;color:#B8860B;margin-top:4px;">${escapeHtml(agentPhone)} | ${escapeHtml(agentEmail)}</div>
    <div style="font-size:12px;color:#6B7280;">mallan.nyc</div>
  </td></tr>
  </table>
</td></tr>

<!-- Footer -->
<tr><td style="background:#F9FAFB;padding:20px 32px;border-top:1px solid #E5E7EB;">
  <p style="font-size:10px;color:#9CA3AF;line-height:1.5;margin:0 0 8px;">
    Based on information from the REBNY Listing Service. This information is provided
    for consumers' personal, non-commercial use and may not be used for any purpose
    other than to identify prospective properties consumers may be interested in.
  </p>
  <p style="font-size:10px;color:#9CA3AF;line-height:1.5;margin:0;">
    Mallan Real Estate Inc. is committed to compliance with the Fair Housing Act,
    the New York State Human Rights Law, and the NYC Human Rights Law Title 8.
    We do not discriminate on the basis of race, color, religion, sex, national origin,
    disability, familial status, sexual orientation, gender identity, marital status,
    age, lawful source of income, or any other protected class.
  </p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject, html };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
