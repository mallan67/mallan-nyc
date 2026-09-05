/**
 * POST /api/crm/sales/prospects/[id]/send-packet
 *
 * Email the full pitch packet to the prospect — inline comps, pricing, and financials.
 * - Requires: prospect has owner_email
 * - TCPA guard: consent_opt_out_at blocks send
 * - Reads pitch_data directly from SellerLead (no self-request to pitch-packet GET)
 * - Replicates same pricing logic as pitch-packet GET (median $/sqft from curated comps)
 * - Sends HTML email via M365 SMTP (lib/email/sendgrid.ts)
 * - Updates SellerLead.pitch_sent_at
 * - Creates OutreachEvent record
 * - Logs audit: "seller_prospect_pitch_sent"
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
const BRAND_GOLD = "#B8860B";
const BRAND_DARK = "#1a1a1a";

// ── Types mirrored from pitch-packet GET ────────────────────────────────────

type PitchComp = {
  mls_id?: string;
  address: string;
  unit?: string | null;
  close_price: number | null;
  close_date?: string | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  building_name?: string | null;
  property_type?: string | null;
};

type PitchOverrides = {
  estimated_value?: number;
  commission_rate?: number;
  attorney_fees?: number;
};

type PitchData = {
  comps?: PitchComp[];
  overrides?: PitchOverrides;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatUSD(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function medianOf(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function nycTransferTaxRate(price: number): number {
  return price < 500_000 ? 0.01 : 0.01425;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

// ── Email template ────────────────────────────────────────────────────────────

interface PitchEmailData {
  ownerName: string;
  address: string;
  propertyType: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  agentName: string;
  agentEmail: string | null;
  agentPhone: string;
  // Comps
  comps: PitchComp[];
  // Pricing
  conservative: number;
  recommended: number;
  aspirational: number;
  // Equity (only shown if last_purchase_price exists)
  lastPurchasePrice: number | null;
  lastPurchaseDate: Date | null;
  // Financials
  commissionRate: number;
  commission: number;
  transferTax: number;
  transferTaxRate: number;
  attorneyFees: number;
  mortgagePayoff: number;
  netProceeds: number;
  // Exposure
  buyerCount: number;
  activeCompetitionCount: number;
  // Attribution
  attribution: string;
}

function buildPitchEmail(d: PitchEmailData): string {
  const fullAddress = d.address;
  const propertyLine = [
    d.propertyType,
    d.beds != null ? `${d.beds} bed` : null,
    d.baths != null ? `${d.baths} bath` : null,
    d.sqft ? `${d.sqft.toLocaleString()} sqft` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // ── Section 2: Comps table rows ──────────────────────────────────────────
  const compsRows = d.comps
    .map((c) => {
      const dispAddress = c.unit
        ? `${escapeHtml(c.address)}, #${escapeHtml(c.unit)}`
        : escapeHtml(c.address);
      const bedBath =
        c.beds != null && c.baths != null
          ? `${c.beds}/${c.baths}`
          : c.beds != null
            ? `${c.beds} bd`
            : "—";
      const sqftStr = c.sqft ? c.sqft.toLocaleString() : "—";
      const priceStr = c.close_price ? formatUSD(c.close_price) : "—";
      const ppsf =
        c.close_price && c.sqft && c.sqft > 0
          ? `${formatUSD(Math.round(c.close_price / c.sqft))}/sf`
          : "";
      return `
      <tr style="border-bottom:1px solid #f3f4f6;">
        <td style="padding:8px 6px;font-size:12px;color:#374151;">${dispAddress}</td>
        <td style="padding:8px 6px;font-size:13px;font-weight:600;color:${BRAND_DARK};white-space:nowrap;">${priceStr}</td>
        <td style="padding:8px 6px;font-size:12px;color:#374151;text-align:center;">${bedBath}</td>
        <td style="padding:8px 6px;font-size:12px;color:#374151;text-align:right;">${sqftStr}</td>
        <td style="padding:8px 6px;font-size:11px;color:#9ca3af;text-align:right;">${ppsf}</td>
        <td style="padding:8px 6px;font-size:11px;color:#9ca3af;text-align:right;white-space:nowrap;">${formatDate(c.close_date)}</td>
      </tr>`;
    })
    .join("");

  const compsSection =
    d.comps.length > 0
      ? `
      <!-- Section 2: Comparable Sales -->
      <tr><td style="padding:0 32px 28px;">
        <h2 style="font-size:14px;font-weight:700;color:${BRAND_DARK};margin:0 0 12px;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid ${BRAND_GOLD};padding-bottom:6px;">Comparable Sales</h2>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;border-collapse:collapse;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:8px 6px;font-size:11px;font-weight:600;color:#6b7280;text-align:left;">Address</th>
              <th style="padding:8px 6px;font-size:11px;font-weight:600;color:#6b7280;text-align:left;">Sale Price</th>
              <th style="padding:8px 6px;font-size:11px;font-weight:600;color:#6b7280;text-align:center;">Bed/Bath</th>
              <th style="padding:8px 6px;font-size:11px;font-weight:600;color:#6b7280;text-align:right;">Sqft</th>
              <th style="padding:8px 6px;font-size:11px;font-weight:600;color:#6b7280;text-align:right;">$/Sqft</th>
              <th style="padding:8px 6px;font-size:11px;font-weight:600;color:#6b7280;text-align:right;">Closed</th>
            </tr>
          </thead>
          <tbody>${compsRows}</tbody>
        </table>
        <p style="font-size:11px;color:#9ca3af;margin:6px 0 0;line-height:1.4;">
          ${d.comps.length} comparable sale${d.comps.length !== 1 ? "s" : ""} · ${d.attribution}
        </p>
      </td></tr>`
      : "";

  // ── Section 4: Equity position ───────────────────────────────────────────
  const equityGain = d.recommended
    ? d.recommended - (d.lastPurchasePrice || 0)
    : 0;
  const purchaseYear = d.lastPurchaseDate
    ? d.lastPurchaseDate.getFullYear()
    : null;

  const equitySection =
    d.lastPurchasePrice && d.recommended
      ? `
      <!-- Section 4: Equity Position -->
      <tr><td style="padding:0 32px 28px;">
        <h2 style="font-size:14px;font-weight:700;color:${BRAND_DARK};margin:0 0 12px;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid ${BRAND_GOLD};padding-bottom:6px;">Your Equity Position</h2>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;">
          <tr>
            <td style="padding:12px 16px;font-size:13px;color:#6b7280;background:#f9fafb;border-bottom:1px solid #e5e7eb;">
              You purchased${purchaseYear ? ` in ${purchaseYear}` : ""} for
            </td>
            <td style="padding:12px 16px;font-size:14px;font-weight:600;color:${BRAND_DARK};text-align:right;background:#f9fafb;border-bottom:1px solid #e5e7eb;">
              ${formatUSD(d.lastPurchasePrice)}
            </td>
          </tr>
          <tr>
            <td style="padding:12px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Estimated current value</td>
            <td style="padding:12px 16px;font-size:14px;font-weight:600;color:${BRAND_DARK};text-align:right;border-bottom:1px solid #e5e7eb;">
              ${formatUSD(d.recommended)}
            </td>
          </tr>
          <tr>
            <td style="padding:12px 16px;font-size:13px;font-weight:700;color:#16a34a;">Equity growth</td>
            <td style="padding:12px 16px;font-size:16px;font-weight:800;color:#16a34a;text-align:right;">
              +${formatUSD(equityGain)}
            </td>
          </tr>
        </table>
      </td></tr>`
      : "";

  // ── Section 5: Net proceeds ──────────────────────────────────────────────
  const mortgageRow =
    d.mortgagePayoff > 0
      ? `
          <tr style="border-bottom:1px solid #e5e7eb;">
            <td style="padding:10px 16px;font-size:13px;color:#6b7280;">Mortgage Payoff</td>
            <td style="padding:10px 16px;font-size:13px;color:#dc2626;text-align:right;">− ${formatUSD(d.mortgagePayoff)}</td>
          </tr>`
      : "";

  // ── Signature ────────────────────────────────────────────────────────────
  const agentContactLine = [
    d.agentEmail
      ? `<a href="mailto:${escapeHtml(d.agentEmail)}" style="color:${BRAND_GOLD};text-decoration:none;">${escapeHtml(d.agentEmail)}</a>`
      : null,
    d.agentPhone,
  ]
    .filter(Boolean)
    .join(" · ");

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;width:100%;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;">
  <tr><td align="center" style="padding:24px 16px;">
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border:1px solid #e5e7eb;">

      <!-- Header -->
      <tr><td align="center" style="padding:28px 32px 20px;border-bottom:3px solid ${BRAND_GOLD};">
        <span style="font-size:24px;font-weight:700;color:${BRAND_DARK};letter-spacing:3px;">MALLAN</span>
        <span style="font-size:24px;font-weight:300;color:${BRAND_GOLD};letter-spacing:3px;">&nbsp;NYC</span>
        <div style="font-size:11px;color:#9ca3af;margin-top:4px;letter-spacing:1px;text-transform:uppercase;">Mallan Real Estate Inc.</div>
      </td></tr>

      <!-- Subject line / title -->
      <tr><td style="padding:28px 32px 8px;">
        <h1 style="font-size:20px;color:${BRAND_DARK};margin:0 0 8px;font-weight:700;">Your Home's Market Analysis</h1>
        <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 4px;">
          Dear ${escapeHtml(d.ownerName || "Homeowner")},
        </p>
        <p style="font-size:15px;color:#374151;line-height:1.6;margin:0;">
          I've prepared a comprehensive market analysis for your property at
          <strong>${escapeHtml(fullAddress)}</strong>.
        </p>
      </td></tr>

      <!-- Section 1: Your Property -->
      <tr><td style="padding:24px 32px 28px;">
        <h2 style="font-size:14px;font-weight:700;color:${BRAND_DARK};margin:0 0 12px;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid ${BRAND_GOLD};padding-bottom:6px;">Your Property</h2>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;">
          <tr>
            <td style="padding:12px 16px;font-size:13px;color:#6b7280;background:#f9fafb;border-bottom:1px solid #e5e7eb;">Address</td>
            <td style="padding:12px 16px;font-size:13px;font-weight:600;color:${BRAND_DARK};text-align:right;background:#f9fafb;border-bottom:1px solid #e5e7eb;">${escapeHtml(fullAddress)}</td>
          </tr>
          ${
            propertyLine
              ? `<tr>
            <td style="padding:12px 16px;font-size:13px;color:#6b7280;">Details</td>
            <td style="padding:12px 16px;font-size:13px;color:${BRAND_DARK};text-align:right;">${escapeHtml(propertyLine)}</td>
          </tr>`
              : ""
          }
        </table>
      </td></tr>

      ${compsSection}

      <!-- Section 3: Pricing Strategy -->
      <tr><td style="padding:0 32px 28px;">
        <h2 style="font-size:14px;font-weight:700;color:${BRAND_DARK};margin:0 0 12px;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid ${BRAND_GOLD};padding-bottom:6px;">Pricing Strategy</h2>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <!-- Conservative -->
            <td width="33%" style="padding:4px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;text-align:center;">
                <tr><td style="padding:16px 8px 6px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Conservative</td></tr>
                <tr><td style="padding:6px 8px 16px;font-size:20px;font-weight:700;color:${BRAND_DARK};">${d.conservative ? formatUSD(d.conservative) : "—"}</td></tr>
              </table>
            </td>
            <!-- Recommended (highlighted) -->
            <td width="33%" style="padding:4px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:2px solid ${BRAND_GOLD};text-align:center;background:#fefce8;">
                <tr><td style="padding:16px 8px 6px;font-size:11px;font-weight:700;color:${BRAND_GOLD};text-transform:uppercase;letter-spacing:0.5px;">Recommended</td></tr>
                <tr><td style="padding:6px 8px 4px;font-size:26px;font-weight:800;color:${BRAND_GOLD};">${d.recommended ? formatUSD(d.recommended) : "—"}</td></tr>
                <tr><td style="padding:0 8px 16px;font-size:10px;color:#92400e;">Best List Price</td></tr>
              </table>
            </td>
            <!-- Aspirational -->
            <td width="33%" style="padding:4px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;text-align:center;">
                <tr><td style="padding:16px 8px 6px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Aspirational</td></tr>
                <tr><td style="padding:6px 8px 16px;font-size:20px;font-weight:700;color:${BRAND_DARK};">${d.aspirational ? formatUSD(d.aspirational) : "—"}</td></tr>
              </table>
            </td>
          </tr>
        </table>
      </td></tr>

      ${equitySection}

      <!-- Section 5: Net Proceeds Estimate -->
      ${
        d.recommended > 0
          ? `<tr><td style="padding:0 32px 28px;">
        <h2 style="font-size:14px;font-weight:700;color:${BRAND_DARK};margin:0 0 12px;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid ${BRAND_GOLD};padding-bottom:6px;">Net Proceeds Estimate</h2>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;border-collapse:collapse;">
          <tr style="border-bottom:1px solid #e5e7eb;">
            <td style="padding:10px 16px;font-size:13px;font-weight:600;color:${BRAND_DARK};background:#f9fafb;">Sale Price (Recommended)</td>
            <td style="padding:10px 16px;font-size:13px;font-weight:600;color:${BRAND_DARK};text-align:right;background:#f9fafb;">${formatUSD(d.recommended)}</td>
          </tr>
          <tr style="border-bottom:1px solid #e5e7eb;">
            <td style="padding:10px 16px;font-size:13px;color:#6b7280;">Commission (${(d.commissionRate * 100).toFixed(0)}%)*</td>
            <td style="padding:10px 16px;font-size:13px;color:#dc2626;text-align:right;">− ${formatUSD(d.commission)}</td>
          </tr>
          <tr style="border-bottom:1px solid #e5e7eb;">
            <td style="padding:10px 16px;font-size:13px;color:#6b7280;">Transfer Tax (${(d.transferTaxRate * 100).toFixed(3)}%)</td>
            <td style="padding:10px 16px;font-size:13px;color:#dc2626;text-align:right;">− ${formatUSD(d.transferTax)}</td>
          </tr>
          <tr style="border-bottom:1px solid #e5e7eb;">
            <td style="padding:10px 16px;font-size:13px;color:#6b7280;">Attorney Fees (est.)</td>
            <td style="padding:10px 16px;font-size:13px;color:#dc2626;text-align:right;">− ${formatUSD(d.attorneyFees)}</td>
          </tr>
          ${mortgageRow}
          <tr>
            <td style="padding:14px 16px;font-size:15px;font-weight:700;color:${BRAND_DARK};background:#f0fdf4;">Estimated Net Proceeds</td>
            <td style="padding:14px 16px;font-size:18px;font-weight:800;color:#16a34a;text-align:right;background:#f0fdf4;">${formatUSD(d.netProceeds)}</td>
          </tr>
        </table>
        <p style="font-size:11px;color:#9ca3af;margin:6px 0 0;line-height:1.4;">
          *Commission rates are negotiable as required by law. Estimates only — actual costs may vary based on final sale price and negotiated terms.
        </p>
      </td></tr>`
          : ""
      }

      <!-- Section 6: Marketing Reach -->
      <tr><td style="padding:0 32px 28px;">
        <h2 style="font-size:14px;font-weight:700;color:${BRAND_DARK};margin:0 0 12px;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid ${BRAND_GOLD};padding-bottom:6px;">Our Marketing Reach</h2>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="33%" style="padding:4px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;text-align:center;">
                <tr><td style="padding:14px 8px 4px;font-size:22px;font-weight:700;color:${BRAND_GOLD};">${d.buyerCount.toLocaleString()}</td></tr>
                <tr><td style="padding:0 8px 14px;font-size:11px;color:#6b7280;">Active Buyers</td></tr>
              </table>
            </td>
            <td width="33%" style="padding:4px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;text-align:center;">
                <tr><td style="padding:14px 8px 4px;font-size:22px;font-weight:700;color:${BRAND_GOLD};">17,000+</td></tr>
                <tr><td style="padding:0 8px 14px;font-size:11px;color:#6b7280;">REBNY Agents</td></tr>
              </table>
            </td>
            <td width="33%" style="padding:4px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;text-align:center;">
                <tr><td style="padding:14px 8px 4px;font-size:22px;font-weight:700;color:${BRAND_GOLD};">9</td></tr>
                <tr><td style="padding:0 8px 14px;font-size:11px;color:#6b7280;">Syndication Portals</td></tr>
              </table>
            </td>
          </tr>
        </table>
        <p style="font-size:12px;color:#6b7280;margin:10px 0 0;line-height:1.5;">
          StreetEasy · Zillow · Realtor.com · Redfin · Homes.com · RentHop · openigloo · Samaki.com · TBI Listings
        </p>
        ${
          d.activeCompetitionCount > 0
            ? `<p style="font-size:12px;color:#6b7280;margin:6px 0 0;">
          Currently <strong>${d.activeCompetitionCount} competing listing${d.activeCompetitionCount !== 1 ? "s" : ""}</strong> in your area — timing your listing well is key.
        </p>`
            : ""
        }
      </td></tr>

      <!-- CTA -->
      <tr><td align="center" style="padding:0 32px 32px;">
        <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 20px;">
          I'd love to walk you through this analysis in detail and answer any questions. Would you be available for a brief call this week?
        </p>
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${BASE_URL}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="13%" fillcolor="${BRAND_GOLD}" stroke="f">
          <w:anchorlock/><center style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;">Schedule a Consultation</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-->
        <a href="${BASE_URL}" style="display:inline-block;padding:14px 40px;background-color:${BRAND_GOLD};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:6px;">Schedule a Consultation</a>
        <!--<![endif]-->
      </td></tr>

      <!-- Signature -->
      <tr><td style="padding:0 32px 24px;border-top:1px solid #e5e7eb;">
        <p style="font-size:14px;color:#374151;line-height:1.7;margin:16px 0 0;">
          Best regards,<br>
          <strong>${escapeHtml(d.agentName)}</strong><br>
          ${agentContactLine ? `<span style="font-size:13px;color:#6b7280;">${agentContactLine}</span><br>` : ""}
          <span style="font-size:13px;color:#6b7280;">Mallan Real Estate Inc. · 646-258-4460</span>
        </p>
      </td></tr>

      <!-- Footer -->
      <tr><td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
        <p style="font-size:11px;color:#9ca3af;line-height:1.5;margin:0 0 6px;">
          Mallan Real Estate Inc. | 400 East 90th Street, Suite 17C, New York, NY 10128<br>
          Licensed Real Estate Broker | NY DOS #10991205323 | 646-258-4460
        </p>
        <p style="font-size:11px;color:#9ca3af;line-height:1.5;margin:0 0 6px;">
          Mallan Real Estate Inc. is committed to compliance with the Fair Housing Act,
          the New York State Human Rights Law, and the NYC Human Rights Law (Title&nbsp;8).
          We do not discriminate on the basis of race, color, religion, sex, national origin,
          familial status, disability, sexual orientation, gender identity, marital status,
          age, lawful source of income, or any other protected class.
        </p>
        <p style="font-size:11px;color:#9ca3af;line-height:1.5;margin:0 0 6px;">
          ${escapeHtml(d.attribution)}
        </p>
        <p style="font-size:11px;color:#9ca3af;line-height:1.5;margin:0;">
          <a href="${BASE_URL}/fair-housing" style="color:${BRAND_GOLD};text-decoration:underline;">Fair Housing Policy</a> |
          <a href="${BASE_URL}/privacy" style="color:${BRAND_GOLD};text-decoration:underline;">Privacy Policy</a> |
          <a href="${BASE_URL}/unsubscribe" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a>
        </p>
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

  // CAN-SPAM / TCPA: check opt-out — if prospect unsubscribed, block send
  if (prospect.consent_opt_out_at) {
    return NextResponse.json(
      { error: "This prospect has unsubscribed from emails. Cannot send." },
      { status: 403 },
    );
  }

  // ── Fetch agent ─────────────────────────────────────────────────────────
  const agent = await prisma.agent.findUnique({
    where: { id: auth.userId },
    select: { first_name: true, last_name: true, email: true },
  });
  const agentName = agent
    ? `${agent.first_name} ${agent.last_name}`
    : "Your Agent";

  // ── Buyer count ──────────────────────────────────────────────────────────
  const buyerCount = await prisma.lead.count({
    where: { roles: { has: "buyer" } },
  });

  // ── Read pitch_data directly (avoids self-request) ───────────────────────
  const pitchData = (prospect.pitch_data ?? null) as PitchData | null;
  const curatedComps: PitchComp[] = pitchData?.comps?.length
    ? pitchData.comps
    : [];
  const overrides: PitchOverrides = pitchData?.overrides ?? {};

  // ── Pricing — same logic as pitch-packet GET ─────────────────────────────
  const prospectSqft = prospect.sqft || 0;

  const compPpsf = curatedComps
    .filter((c) => c.close_price && c.sqft && c.sqft > 0)
    .map((c) => (c.close_price as number) / (c.sqft as number));

  let conservative = 0;
  let recommended = 0;
  let aspirational = 0;

  if (overrides.estimated_value) {
    recommended = overrides.estimated_value;
    conservative = Math.round(recommended * 0.93);
    aspirational = Math.round(recommended * 1.07);
  } else if (compPpsf.length > 0 && prospectSqft > 0) {
    const sorted = [...compPpsf].sort((a, b) => a - b);
    conservative = Math.round(sorted[0] * prospectSqft);
    recommended = Math.round(medianOf(sorted) * prospectSqft);
    aspirational = Math.round(sorted[sorted.length - 1] * prospectSqft);
  } else if (prospect.market_value) {
    const mv = Number(prospect.market_value);
    conservative = Math.round(mv * 0.95);
    recommended = Math.round(mv);
    aspirational = Math.round(mv * 1.1);
  } else if (prospect.last_purchase_price) {
    // Last resort: purchase price
    const lpp = Number(prospect.last_purchase_price);
    conservative = Math.round(lpp * 0.95);
    recommended = Math.round(lpp);
    aspirational = Math.round(lpp * 1.1);
  }

  // ── Financials — same logic as pitch-packet GET ──────────────────────────
  const commissionRate = overrides.commission_rate ?? 0.06;
  const commission = Math.round(recommended * commissionRate);
  const transferTaxRate = nycTransferTaxRate(recommended);
  const transferTax = Math.round(recommended * transferTaxRate);
  const attorneyFees = overrides.attorney_fees ?? 3000;
  const mortgagePayoff = prospect.mortgage_amount
    ? Number(prospect.mortgage_amount)
    : 0;
  const netProceeds =
    recommended > 0
      ? recommended - commission - transferTax - attorneyFees - mortgagePayoff
      : 0;

  // ── REBNY attribution ────────────────────────────────────────────────────
  const now = new Date();
  const yearAgo = new Date();
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const fmtDate = (d: Date) =>
    d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  const attribution = `Based on information from the REBNY Listing Service for the period ${fmtDate(yearAgo)} through ${fmtDate(now)}. This information is provided for consumers' personal, non-commercial use.`;

  // ── Build and send email ─────────────────────────────────────────────────
  const subject = `Your Home's Market Analysis — ${agentName}, Mallan Real Estate`;

  const html = buildPitchEmail({
    ownerName: prospect.owner_name || "Homeowner",
    address: prospect.address + (prospect.unit ? `, ${prospect.unit}` : ""),
    propertyType: prospect.property_type ?? null,
    beds: prospect.beds ?? null,
    baths: prospect.baths ? Number(prospect.baths) : null,
    sqft: prospect.sqft ?? null,
    agentName,
    agentEmail: agent?.email ?? null,
    agentPhone: "646-258-4460",
    comps: curatedComps,
    conservative,
    recommended,
    aspirational,
    lastPurchasePrice: prospect.last_purchase_price
      ? Number(prospect.last_purchase_price)
      : null,
    lastPurchaseDate: prospect.last_purchase_date ?? null,
    commissionRate,
    commission,
    transferTax,
    transferTaxRate,
    attorneyFees,
    mortgagePayoff,
    netProceeds,
    buyerCount,
    activeCompetitionCount: 0, // Only set from live Trestle data — don't misrepresent closed comps as active competition
    attribution,
  });

  const result = await sendEmail(
    prospect.owner_email,
    subject,
    html,
    // Real session, not a rebuilt literal — see the hook-email route.
    auth,
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
      body_preview: `Full pitch packet sent to ${prospect.owner_email}. ${curatedComps.length} comps. Recommended: ${recommended ? formatUSD(recommended) : "N/A"}. Net: ${netProceeds > 0 ? formatUSD(netProceeds) : "N/A"}.`.slice(
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
      comps_count: curatedComps.length,
      recommended_price: recommended,
      net_proceeds: netProceeds,
    },
  );

  return NextResponse.json({
    success: true,
    message_id: result.messageId,
    sent_to: prospect.owner_email,
    prospect: serializeBigInts(updatedProspect),
  });
}
