// Test script — sends both email templates to maya@mallan.nyc
// Run: node scripts/test-email-templates.js
const nodemailer = require("nodemailer");

const t = nodemailer.createTransport({
  host: "smtp.office365.com",
  port: 587,
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  tls: { ciphers: "SSLv3", rejectUnauthorized: true },
});

const G = "#C4A052";
const D = "#1a1a1a";
const B = "https://mallan.nyc";
const PHOTO = "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600&h=300&fit=crop";
const FLOORPLAN = "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=500&h=350&fit=crop";
const PHOTO2 = "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=300&h=200&fit=crop";
const PHOTO3 = "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=300&h=200&fit=crop";
const PHOTO4 = "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=300&h=200&fit=crop";

const WRAP_TOP = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge">
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>body,table,td{font-family:Arial,Helvetica,sans-serif;}img{border:0;display:block;}a{color:${G};}</style>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;width:100%;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;">
<tr><td align="center" style="padding:24px 16px;">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border:1px solid #e5e7eb;">
  <tr><td align="center" style="padding:28px 32px 20px;">
    <span style="font-size:22px;font-weight:700;color:${D};letter-spacing:2px;">MALLAN</span>
    <span style="font-size:22px;font-weight:300;color:${G};letter-spacing:2px;">&nbsp;NYC</span>
  </td></tr>
  <tr><td style="padding:0 32px 32px;">`;

const FOOTER = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e5e7eb;margin-top:32px;">
      <tr><td style="padding:16px 0 8px;font-size:11px;color:#9ca3af;line-height:1.5;">Mallan Real Estate Inc. | 400 East 90th Street, Suite 17C, New York, NY 10128</td></tr>
      <tr><td style="padding:0 0 8px;font-size:11px;color:#9ca3af;line-height:1.5;">Licensed Real Estate Broker | NY DOS #10991205323 | 646-258-4460</td></tr>
      <tr><td style="padding:0 0 8px;font-size:11px;color:#9ca3af;line-height:1.5;">Mallan Real Estate Inc. is committed to compliance with the Fair Housing Act, the New York State Human Rights Law, and the NYC Human Rights Law (Title 8). We do not discriminate on the basis of race, color, religion, sex, national origin, familial status, disability, sexual orientation, gender identity, marital status, age, lawful source of income, or any other protected class.</td></tr>
      <tr><td style="padding:0;font-size:11px;"><a href="${B}/fair-housing" style="color:${G};text-decoration:underline;">Fair Housing Policy</a> | <a href="${B}/privacy" style="color:${G};text-decoration:underline;">Privacy Policy</a></td></tr>
    </table>`;

const WRAP_BOTTOM = `${FOOTER}</td></tr></table></td></tr></table></body></html>`;

// ═══════════════════════════════════════════════════════════════════
// TEST 1: EXCLUSIVE eBLAST — Agent/Broker audience
// ═══════════════════════════════════════════════════════════════════
const eblast = WRAP_TOP + `
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 8px;">Dear Colleague,</p>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 20px;">Please be advised of the following exclusive listing available for co-broke:</p>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;">
      <tr><td style="padding:0;"><img src="${PHOTO}" alt="400 East 90th Street" width="536" style="width:100%;max-width:536px;height:auto;display:block;"></td></tr>
      <tr><td style="padding:20px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="padding:0 0 10px;">
            <table cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="background-color:${G};padding:4px 12px;font-size:11px;font-weight:700;color:#ffffff;text-transform:uppercase;">Exclusive</td>
              <td width="8"></td>
              <td style="background-color:#374151;padding:4px 12px;font-size:11px;font-weight:700;color:#ffffff;text-transform:uppercase;">Sale</td>
            </tr></table>
          </td></tr>
          <tr><td style="font-size:20px;font-weight:700;color:${D};padding:0 0 6px;">400 East 90th Street, Apt 17C</td></tr>
          <tr><td style="font-size:24px;font-weight:800;color:${G};padding:0 0 8px;">$2,495,000</td></tr>
          <tr><td style="font-size:14px;color:#6b7280;padding:0 0 4px;">2 Bed &nbsp;&middot;&nbsp; 2 Bath &nbsp;&middot;&nbsp; 1,250 Sqft &nbsp;&middot;&nbsp; Co-op</td></tr>
          <tr><td>
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;margin-top:12px;">
              <tr><td style="padding:6px 12px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;width:140px;font-weight:600;">Maintenance</td><td style="padding:6px 12px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">$1,850/mo</td></tr>
              <tr><td style="padding:6px 12px;font-size:13px;color:#374151;width:140px;font-weight:600;">RE Tax</td><td style="padding:6px 12px;font-size:13px;color:#374151;">$14,400/yr</td></tr>
            </table>
          </td></tr>
          <tr><td><p style="font-size:14px;color:#374151;line-height:1.6;margin:16px 0 0;">Stunning pre-war 2BR/2BA in prime Upper East Side doorman co-op. Sun-drenched corner unit with original hardwood floors, high ceilings, and breathtaking Central Park views. Updated chef's kitchen with marble countertops. Washer/dryer permitted. Pet friendly.</p></td></tr>
        </table>
      </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;">
      <tr><td style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;padding:0 0 8px;">Floor Plan</td></tr>
      <tr><td style="padding:0;border:1px solid #e5e7eb;"><img src="${FLOORPLAN}" alt="Floor Plan" width="536" style="width:100%;max-width:536px;height:auto;display:block;"></td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
      <tr><td align="center">
        <a href="${B}/listing/test-123" style="display:inline-block;padding:14px 40px;background-color:${G};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">View Full Listing</a>
      </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;margin-top:24px;">
      <tr><td style="padding:16px;">
        <table cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;padding:0 0 8px;">Exclusive Listing Agent</td></tr>
          <tr><td style="font-size:16px;font-weight:700;color:${D};padding:0 0 2px;">Maya Allan</td></tr>
          <tr><td style="font-size:13px;color:#6b7280;padding:0 0 2px;">Mallan Real Estate Inc. | Lic# 10311201806</td></tr>
          <tr><td style="padding:10px 0 0;">
            <a href="mailto:maya@mallan.nyc" style="display:inline-block;padding:8px 20px;background-color:${G};color:#ffffff;font-size:13px;font-weight:700;text-decoration:none;">Email Agent</a>
            &nbsp;&nbsp;
            <a href="tel:6462584460" style="display:inline-block;padding:8px 20px;border:1px solid ${G};color:${G};font-size:13px;font-weight:700;text-decoration:none;">646-258-4460</a>
          </td></tr>
        </table>
      </td></tr>
    </table>

    <p style="font-size:11px;color:#9ca3af;margin:20px 0 0;">Listing data provided by the Real Estate Board of New York (REBNY) Residential Listing Service.</p>
` + WRAP_BOTTOM;

// ═══════════════════════════════════════════════════════════════════
// TEST 2: MULTI-LISTING SEND — Client audience
// ═══════════════════════════════════════════════════════════════════

function listingCard(photo, address, price, details, id) {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;margin-bottom:12px;">
    <tr>
      <td width="160" valign="top" style="padding:0;">
        <a href="${B}/listing/${id}"><img src="${photo}" alt="${address}" width="160" height="120" style="width:160px;height:120px;object-fit:cover;display:block;"></a>
      </td>
      <td valign="top" style="padding:14px 16px;">
        <table cellpadding="0" cellspacing="0" border="0">
          <tr><td style="padding:0 0 4px;">
            <table cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="background-color:${G};padding:2px 8px;font-size:10px;font-weight:700;color:#ffffff;text-transform:uppercase;">Sale</td>
            </tr></table>
          </td></tr>
          <tr><td style="font-size:15px;font-weight:700;color:${D};padding:0 0 2px;">
            <a href="${B}/listing/${id}" style="color:${D};text-decoration:none;">${address}</a>
          </td></tr>
          <tr><td style="font-size:18px;font-weight:800;color:${G};padding:0 0 4px;">${price}</td></tr>
          <tr><td style="font-size:12px;color:#6b7280;padding:0;">${details}</td></tr>
        </table>
      </td>
    </tr>
  </table>`;
}

const multiListing = WRAP_TOP + `
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 8px;">Hi Sarah,</p>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 20px;">Maya Allan has selected 4 listings for you to review:</p>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
      <tr>
        <td width="3" style="background-color:${G};"></td>
        <td style="padding:12px 16px;background-color:#f9fafb;">
          <p style="font-size:14px;color:#374151;margin:0;font-style:italic;">Based on our conversation, I think these four would be a great fit. The first one just came on the market today. Let me know which ones you'd like to see!</p>
          <p style="font-size:12px;color:#9ca3af;margin:6px 0 0;">&mdash; Maya Allan</p>
        </td>
      </tr>
    </table>

    ${listingCard(PHOTO, "400 East 90th Street, Apt 17C", "$2,495,000", "2 Bed &middot; 2 Bath &middot; 1,250 Sqft &middot; Co-op", "1")}
    ${listingCard(PHOTO2, "225 East 86th Street, Apt 3B", "$1,895,000", "2 Bed &middot; 1 Bath &middot; 980 Sqft &middot; Condo", "2")}
    ${listingCard(PHOTO3, "1160 Park Avenue, Apt 8A", "$3,200,000", "3 Bed &middot; 2.5 Bath &middot; 1,800 Sqft &middot; Co-op", "3")}
    ${listingCard(PHOTO4, "301 East 79th Street, Apt 12F", "$1,650,000", "1 Bed &middot; 1 Bath &middot; 850 Sqft &middot; Condo", "4")}

    <p style="font-size:13px;color:#9ca3af;margin:16px 0 0;">Interested in any of these? Reply to this email or call Maya Allan to schedule a showing.</p>
    <p style="font-size:11px;color:#9ca3af;margin:8px 0 0;">Listing data provided by the Real Estate Board of New York (REBNY) Residential Listing Service.</p>
` + WRAP_BOTTOM;

// Send both
async function run() {
  try {
    const r1 = await t.sendMail({
      from: '"Mallan Listings" <listings@mallan.nyc>',
      to: "maya@mallan.nyc",
      subject: "EXCLUSIVE: 400 East 90th Street, Apt 17C — $2,495,000 (2BR/2BA Co-op)",
      html: eblast,
    });
    console.log("1. EXCLUSIVE eBLAST — SUCCESS:", r1.messageId);

    const r2 = await t.sendMail({
      from: '"Maya Allan" <maya@mallan.nyc>',
      to: "maya@mallan.nyc",
      subject: "4 listings selected for you — Sarah",
      html: multiListing,
    });
    console.log("2. MULTI-LISTING — SUCCESS:", r2.messageId);
  } catch (err) {
    console.log("FAILED:", err.message);
  }
}

run();
