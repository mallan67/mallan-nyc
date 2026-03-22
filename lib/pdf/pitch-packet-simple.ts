/**
 * Simple pitch packet PDF generator using pdf-lib (no React, no JSX conflicts).
 * Pure JS — works reliably on Vercel serverless.
 */
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

interface PitchData {
  address: string;
  unit?: string;
  owner_name?: string;
  agent_name: string;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  year_built?: number | null;
  floors?: number | null;
  units_total?: number | null;
  readiness_score?: number;
  score_grade?: string;
  // Pricing
  conservative?: number;
  recommended?: number;
  aspirational?: number;
  competition_count?: number;
  absorption_rate?: string;
  // Exposure
  buyer_count?: number;
  // Financial
  gross_price?: number;
  commission?: number;
  transfer_tax?: number;
  attorney_fees?: number;
  mortgage_payoff?: number;
  net_proceeds?: number;
  // Attribution
  attribution?: string;
}

const GOLD = rgb(184 / 255, 134 / 255, 11 / 255);
const DARK = rgb(17 / 255, 24 / 255, 39 / 255);
const GRAY = rgb(107 / 255, 114 / 255, 128 / 255);
const WHITE = rgb(1, 1, 1);

function fmt(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  return "$" + Math.round(n).toLocaleString("en-US");
}

export async function renderSimplePitchPdf(data: PitchData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 612;
  const H = 792;

  // ─── PAGE 1: COVER + PROPERTY ───────────────────────────────────────
  const p1 = doc.addPage([W, H]);

  // Header bar
  p1.drawRectangle({ x: 0, y: H - 80, width: W, height: 80, color: DARK });
  p1.drawText("MALLAN REAL ESTATE INC.", { x: 40, y: H - 45, size: 18, font: fontBold, color: GOLD });
  p1.drawText("400 East 90th Street, Suite 17C, New York, NY 10128  |  646-258-4460", { x: 40, y: H - 65, size: 8, font, color: GRAY });

  // Gold accent line
  p1.drawRectangle({ x: 0, y: H - 83, width: W, height: 3, color: GOLD });

  // Property address
  let y = H - 130;
  p1.drawText("MARKET ANALYSIS", { x: 40, y, size: 10, font: fontBold, color: GOLD });
  y -= 28;
  const addrText = data.unit ? `${data.address}, Unit ${data.unit}` : data.address;
  p1.drawText(addrText, { x: 40, y, size: 22, font: fontBold, color: DARK });
  y -= 24;
  if (data.owner_name) {
    p1.drawText(`Prepared for: ${data.owner_name}`, { x: 40, y, size: 12, font, color: GRAY });
    y -= 20;
  }
  p1.drawText(`Prepared by: ${data.agent_name}`, { x: 40, y, size: 12, font, color: GRAY });
  y -= 14;
  p1.drawText(`Date: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, { x: 40, y, size: 10, font, color: GRAY });

  // Property details box
  y -= 40;
  p1.drawRectangle({ x: 40, y: y - 80, width: W - 80, height: 80, color: rgb(0.97, 0.97, 0.97) });
  p1.drawText("PROPERTY DETAILS", { x: 55, y: y - 18, size: 10, font: fontBold, color: GOLD });

  const details = [
    data.beds != null ? `${data.beds} Bed` : null,
    data.baths != null ? `${data.baths} Bath` : null,
    data.sqft ? `${data.sqft.toLocaleString()} sqft` : null,
    data.year_built ? `Built ${data.year_built}` : null,
    data.floors ? `${data.floors} Floors` : null,
    data.units_total ? `${data.units_total} Units` : null,
  ].filter(Boolean);

  if (details.length > 0) {
    p1.drawText(details.join("  |  "), { x: 55, y: y - 40, size: 11, font, color: DARK });
  }

  if (data.readiness_score != null) {
    p1.drawText(`Readiness Score: ${data.score_grade || "?"} (${data.readiness_score}/100)`, { x: 55, y: y - 60, size: 10, font: fontBold, color: DARK });
  }

  // Footer
  if (data.attribution) {
    p1.drawText(data.attribution, { x: 40, y: 40, size: 7, font, color: GRAY, maxWidth: W - 80 });
  }
  p1.drawText("Mallan Real Estate Inc.  |  mallan.nyc", { x: 40, y: 25, size: 7, font, color: GRAY });

  // ─── PAGE 2: PRICING STRATEGY ──────────────────────────────────────
  const p2 = doc.addPage([W, H]);
  p2.drawRectangle({ x: 0, y: H - 50, width: W, height: 50, color: DARK });
  p2.drawText("PRICING STRATEGY", { x: 40, y: H - 35, size: 16, font: fontBold, color: GOLD });
  p2.drawRectangle({ x: 0, y: H - 53, width: W, height: 3, color: GOLD });

  y = H - 100;
  const prices = [
    { label: "Conservative", value: data.conservative },
    { label: "Recommended", value: data.recommended },
    { label: "Aspirational", value: data.aspirational },
  ];

  for (const p of prices) {
    const isRec = p.label === "Recommended";
    const boxH = 50;
    if (isRec) {
      p2.drawRectangle({ x: 40, y: y - boxH, width: W - 80, height: boxH, color: rgb(254 / 255, 249 / 255, 231 / 255) });
      p2.drawRectangle({ x: 40, y: y - boxH, width: 4, height: boxH, color: GOLD });
    }
    p2.drawText(p.label, { x: 55, y: y - 18, size: 10, font: fontBold, color: isRec ? GOLD : GRAY });
    p2.drawText(fmt(p.value), { x: 55, y: y - 38, size: 18, font: fontBold, color: DARK });
    y -= boxH + 12;
  }

  y -= 20;
  if (data.competition_count != null) {
    p2.drawText(`Active Competition: ${data.competition_count} listings`, { x: 55, y, size: 11, font, color: DARK });
    y -= 18;
  }
  if (data.absorption_rate) {
    p2.drawText(`Absorption Rate: ${data.absorption_rate}`, { x: 55, y, size: 11, font, color: DARK });
  }

  if (data.attribution) {
    p2.drawText(data.attribution, { x: 40, y: 40, size: 7, font, color: GRAY, maxWidth: W - 80 });
  }
  p2.drawText("Mallan Real Estate Inc.  |  mallan.nyc", { x: 40, y: 25, size: 7, font, color: GRAY });

  // ─── PAGE 3: EXPOSURE PLAN ─────────────────────────────────────────
  const p3 = doc.addPage([W, H]);
  p3.drawRectangle({ x: 0, y: H - 50, width: W, height: 50, color: DARK });
  p3.drawText("EXPOSURE PLAN", { x: 40, y: H - 35, size: 16, font: fontBold, color: GOLD });
  p3.drawRectangle({ x: 0, y: H - 53, width: W, height: 3, color: GOLD });

  y = H - 100;
  const layers = [
    { num: "1", title: "PRIVATE BUYER DATABASE", desc: `${(data.buyer_count || 0).toLocaleString()}+ qualified buyers in our CRM` },
    { num: "2", title: "LOCAL", desc: "StreetEasy + mallan.nyc + 570+ brokerage websites + 30,400 LinkedIn followers" },
    { num: "3", title: "AGENT NETWORK", desc: "REBNY RLS — 17,000+ agents across 570+ firms, 8 listing platforms" },
    { num: "4", title: "NATIONAL", desc: "Zillow, Realtor.com, Redfin, Homes.com, RentHop" },
    { num: "5", title: "INTERNATIONAL", desc: "ListHub - 100+ global portals, Trestle syndication partners" },
  ];

  for (const layer of layers) {
    p3.drawRectangle({ x: 40, y: y - 45, width: 4, height: 45, color: GOLD });
    p3.drawText(`Layer ${layer.num}: ${layer.title}`, { x: 55, y: y - 15, size: 11, font: fontBold, color: DARK });
    p3.drawText(layer.desc, { x: 55, y: y - 33, size: 9, font, color: GRAY, maxWidth: W - 120 });
    y -= 55;
  }

  y -= 15;
  p3.drawText("PLUS: Professional photography, floor plans, 3D tour, video/social media,", { x: 55, y, size: 9, font, color: DARK });
  y -= 14;
  p3.drawText("open houses, broker tours, direct mail, signage", { x: 55, y, size: 9, font, color: DARK });

  if (data.attribution) {
    p3.drawText(data.attribution, { x: 40, y: 40, size: 7, font, color: GRAY, maxWidth: W - 80 });
  }
  p3.drawText("Mallan Real Estate Inc.  |  mallan.nyc", { x: 40, y: 25, size: 7, font, color: GRAY });

  // ─── PAGE 4: FINANCIAL PICTURE ─────────────────────────────────────
  const p4 = doc.addPage([W, H]);
  p4.drawRectangle({ x: 0, y: H - 50, width: W, height: 50, color: DARK });
  p4.drawText("FINANCIAL PICTURE", { x: 40, y: H - 35, size: 16, font: fontBold, color: GOLD });
  p4.drawRectangle({ x: 0, y: H - 53, width: W, height: 3, color: GOLD });

  y = H - 110;
  const lines = [
    { label: "Estimated Sale Price", value: fmt(data.gross_price), bold: false },
    { label: "Less: Broker Commission (6%)", value: `(${fmt(data.commission)})`, bold: false },
    { label: "Less: Transfer Tax", value: `(${fmt(data.transfer_tax)})`, bold: false },
    { label: "Less: Attorney Fees", value: `(${fmt(data.attorney_fees)})`, bold: false },
    { label: "Less: Mortgage Payoff", value: `(${fmt(data.mortgage_payoff)})`, bold: false },
  ];

  for (const line of lines) {
    p4.drawText(line.label, { x: 55, y, size: 11, font, color: DARK });
    p4.drawText(line.value, { x: W - 200, y, size: 11, font, color: DARK });
    y -= 22;
    // Separator
    p4.drawRectangle({ x: 55, y: y + 8, width: W - 110, height: 0.5, color: rgb(0.9, 0.9, 0.9) });
  }

  // Net proceeds (highlighted)
  y -= 10;
  p4.drawRectangle({ x: 40, y: y - 30, width: W - 80, height: 40, color: rgb(236 / 255, 253 / 255, 245 / 255) });
  p4.drawText("ESTIMATED NET PROCEEDS", { x: 55, y: y - 10, size: 11, font: fontBold, color: DARK });
  p4.drawText(fmt(data.net_proceeds), { x: W - 200, y: y - 10, size: 16, font: fontBold, color: rgb(5 / 255, 150 / 255, 105 / 255) });

  if (data.attribution) {
    p4.drawText(data.attribution, { x: 40, y: 40, size: 7, font, color: GRAY, maxWidth: W - 80 });
  }
  p4.drawText("Mallan Real Estate Inc.  |  mallan.nyc", { x: 40, y: 25, size: 7, font, color: GRAY });

  return doc.save();
}
