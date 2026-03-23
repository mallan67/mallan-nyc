/**
 * Pitch Packet HTML Template — Luxury presentation for seller prospects
 *
 * Generates a self-contained HTML document styled as a multi-page presentation.
 * Designed for: browser viewing, Print-to-PDF, and email attachment.
 *
 * Aesthetic: Dark theme, gold accents (#C4A052), luxury real estate imagery,
 * clean typography, generous white space.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const GOLD = "#C4A052";
const DARK = "#0f0f0f";
const DARK2 = "#1a1a1a";
const GRAY = "#94a3b8";
const WHITE = "#f8fafc";

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function usd(n: number | null | undefined): string {
  if (!n) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(d: string | Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export interface PitchPacketData {
  // Property
  address: string;
  unit?: string | null;
  borough?: string | null;
  neighborhood?: string | null;
  propertyType?: string | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  yearBuilt?: number | null;
  floors?: number | null;
  unitsTotal?: number | null;
  ownerName?: string | null;
  ownershipYears?: number | null;
  lastPurchasePrice?: number | null;
  lastPurchaseDate?: string | null;
  mortgageAmount?: number | null;
  marketValue?: number | null;
  annualTax?: number | null;

  // Pricing
  conservative?: number | null;
  recommended?: number | null;
  aspirational?: number | null;
  compsUsed?: number;

  // Financials
  commission?: number | null;
  commissionRate?: number;
  transferTax?: number | null;
  attorneyFees?: number;
  mortgagePayoff?: number | null;
  netProceeds?: number | null;

  // Comps
  recentSales: Array<{
    address: string;
    unit?: string | null;
    closePrice?: number | null;
    closeDate?: string | Date | null;
    beds?: number | null;
    baths?: number | null;
    sqft?: number | null;
  }>;
  activeCompetition: Array<{
    address: string;
    unit?: string | null;
    listPrice?: number | null;
    beds?: number | null;
    baths?: number | null;
    sqft?: number | null;
  }>;

  // Exposure
  buyerCount: number;
  agentNetwork: number;
  firms: number;

  // Agent
  agentName: string;
  generatedAt: string;
}

export function renderPitchPacketHTML(d: PitchPacketData): string {
  const fullAddress = d.address + (d.unit ? `, #${d.unit}` : "");
  const boroughLabel: Record<string, string> = {
    "1": "Manhattan",
    "2": "Bronx",
    "3": "Brooklyn",
    "4": "Queens",
    "5": "Staten Island",
  };
  const borough = boroughLabel[d.borough || ""] || d.borough || "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Home Selling Proposal — ${esc(fullAddress)} | Mallan Real Estate</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --gold: ${GOLD};
    --dark: ${DARK};
    --dark2: ${DARK2};
    --gray: ${GRAY};
    --white: ${WHITE};
  }

  body {
    font-family: 'Inter', -apple-system, sans-serif;
    background: #000;
    color: var(--white);
    -webkit-font-smoothing: antialiased;
  }

  .page {
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 80px 60px;
    position: relative;
    page-break-after: always;
  }

  .page::after {
    content: '';
    position: absolute;
    bottom: 30px;
    left: 60px;
    right: 60px;
    height: 1px;
    background: linear-gradient(to right, var(--gold), transparent 50%);
  }

  .page:last-child::after { display: none; }

  h1 {
    font-family: 'Playfair Display', Georgia, serif;
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }

  h2 {
    font-family: 'Playfair Display', Georgia, serif;
    font-weight: 700;
    font-size: 36px;
    letter-spacing: -0.01em;
    margin-bottom: 12px;
  }

  h3 {
    font-family: 'Inter', sans-serif;
    font-weight: 600;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: var(--gold);
    margin-bottom: 24px;
  }

  .gold { color: var(--gold); }
  .muted { color: var(--gray); }
  .small { font-size: 13px; line-height: 1.6; }

  .gold-line {
    width: 60px;
    height: 2px;
    background: var(--gold);
    margin-bottom: 32px;
  }

  .gold-line-wide {
    width: 100%;
    height: 1px;
    background: linear-gradient(to right, var(--gold), transparent);
    margin: 40px 0;
  }

  /* Cover */
  .cover { text-align: left; justify-content: flex-end; padding-bottom: 120px; }
  .cover h1 { font-size: 64px; margin-bottom: 16px; }
  .cover .subtitle { font-size: 18px; color: var(--gray); font-weight: 300; letter-spacing: 1px; margin-bottom: 48px; }
  .cover .agent-info { font-size: 14px; color: var(--gray); line-height: 2; }
  .cover .agent-info strong { color: var(--white); font-weight: 600; }
  .cover .brand { font-size: 11px; text-transform: uppercase; letter-spacing: 4px; color: var(--gold); font-weight: 600; margin-bottom: 48px; }

  /* 4 Pillars */
  .pillars-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    margin-top: 40px;
  }
  .pillar {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 16px;
    padding: 36px 32px;
    transition: border-color 0.3s;
  }
  .pillar:hover { border-color: var(--gold); }
  .pillar-num {
    font-size: 48px;
    font-family: 'Playfair Display', serif;
    font-weight: 800;
    color: var(--gold);
    opacity: 0.3;
    line-height: 1;
    margin-bottom: 16px;
  }
  .pillar h4 {
    font-family: 'Playfair Display', serif;
    font-size: 22px;
    font-weight: 700;
    margin-bottom: 12px;
  }
  .pillar p { font-size: 14px; color: var(--gray); line-height: 1.7; }

  /* Property Details */
  .prop-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
    margin: 32px 0;
  }
  .prop-item {
    padding: 24px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 12px;
  }
  .prop-item .label { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--gray); margin-bottom: 8px; }
  .prop-item .value { font-size: 22px; font-weight: 700; color: var(--white); }

  /* Pricing */
  .price-cards {
    display: grid;
    grid-template-columns: 1fr 1.4fr 1fr;
    gap: 20px;
    margin: 32px 0;
  }
  .price-card {
    padding: 32px 24px;
    border-radius: 16px;
    text-align: center;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.02);
  }
  .price-card.featured {
    background: var(--gold);
    border-color: var(--gold);
    color: #000;
    transform: scale(1.05);
  }
  .price-card .tier { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; opacity: 0.7; margin-bottom: 12px; font-weight: 600; }
  .price-card .amount { font-family: 'Playfair Display', serif; font-size: 32px; font-weight: 800; }
  .price-card.featured .tier { color: #000; opacity: 0.8; }

  /* Comps Table */
  .comp-table { width: 100%; border-collapse: collapse; margin: 24px 0; }
  .comp-table th {
    text-align: left;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: var(--gold);
    padding: 12px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.1);
    font-weight: 600;
  }
  .comp-table th:last-child, .comp-table td:last-child { text-align: right; }
  .comp-table td {
    font-size: 13px;
    padding: 14px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    color: var(--gray);
  }
  .comp-table td:first-child { color: var(--white); font-weight: 500; }
  .comp-table tr:last-child td { border-bottom: none; }

  /* Net Proceeds */
  .proceeds-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 14px 0;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    font-size: 15px;
  }
  .proceeds-row .label { color: var(--gray); }
  .proceeds-row .amount { font-weight: 600; }
  .proceeds-row.deduction .amount { color: #ef4444; }
  .proceeds-row.total {
    border-top: 2px solid var(--gold);
    border-bottom: none;
    padding-top: 20px;
    margin-top: 8px;
  }
  .proceeds-row.total .label { color: var(--white); font-weight: 700; font-size: 17px; }
  .proceeds-row.total .amount { color: var(--gold); font-family: 'Playfair Display', serif; font-size: 32px; font-weight: 800; }

  /* Marketing */
  .marketing-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin: 32px 0;
  }
  .marketing-item {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    padding: 20px;
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 12px;
  }
  .marketing-item .num {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--gold);
    color: #000;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .marketing-item .text { font-size: 14px; color: var(--gray); line-height: 1.5; }
  .marketing-item .text strong { color: var(--white); }

  /* Stats */
  .stats-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
    margin: 32px 0;
  }
  .stat {
    text-align: center;
    padding: 28px 16px;
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 12px;
  }
  .stat .num { font-family: 'Playfair Display', serif; font-size: 36px; font-weight: 800; color: var(--gold); }
  .stat .label { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--gray); margin-top: 8px; }

  /* Agent */
  .agent-card {
    display: flex;
    align-items: center;
    gap: 40px;
    padding: 48px;
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 20px;
    margin-top: 40px;
  }
  .agent-card .info h4 { font-family: 'Playfair Display', serif; font-size: 28px; font-weight: 700; margin-bottom: 4px; }
  .agent-card .info .title { font-size: 14px; color: var(--gold); font-weight: 500; margin-bottom: 16px; }
  .agent-card .info p { font-size: 14px; color: var(--gray); line-height: 1.8; }

  /* Footer */
  .page-footer {
    position: absolute;
    bottom: 40px;
    left: 60px;
    right: 60px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 10px;
    color: rgba(255,255,255,0.25);
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  /* Portal list */
  .portal-list {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin: 24px 0;
  }
  .portal-tag {
    padding: 8px 16px;
    background: rgba(196,160,82,0.1);
    border: 1px solid rgba(196,160,82,0.2);
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--gold);
  }

  /* Print */
  @media print {
    body { background: #000 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { padding: 40px 40px; min-height: 100vh; }
  }
</style>
</head>
<body>

<!-- ═══════════ PAGE 1: COVER ═══════════ -->
<div class="page cover">
  <div class="brand">Mallan Real Estate</div>
  <h1>Home Selling &<br><span class="gold">Marketing Proposal</span></h1>
  <div class="subtitle">${esc(fullAddress)}${borough ? ` — ${esc(borough)}` : ""}</div>
  <div class="gold-line"></div>
  <div class="agent-info">
    Prepared exclusively for <strong>${esc(d.ownerName || "the homeowner")}</strong><br>
    By <strong>${esc(d.agentName)}</strong> — Licensed Real Estate Broker<br>
    Mallan Real Estate Inc. | 646-258-4460 | maya@mallan.nyc<br>
    ${esc(fmtDate(d.generatedAt))}
  </div>
  <div class="page-footer">
    <span>Mallan Real Estate Inc.</span>
    <span>mallan.nyc</span>
  </div>
</div>

<!-- ═══════════ PAGE 2: THE 4 PILLARS ═══════════ -->
<div class="page">
  <h3>Our Commitment</h3>
  <h2>Every property we represent receives the full weight<br>of our expertise.</h2>
  <div class="pillars-grid">
    <div class="pillar">
      <div class="pillar-num">01</div>
      <h4>Professional Imagery</h4>
      <p>High-resolution photography, virtual tours, and floor plans that make buyers stop scrolling and start calling. Your property will be presented at its absolute best.</p>
    </div>
    <div class="pillar">
      <div class="pillar-num">02</div>
      <h4>Strategic Pricing</h4>
      <p>Data-driven pricing backed by comparable sales, real-time market conditions, and deep neighborhood expertise. We position your property to attract the right buyers at the right price.</p>
    </div>
    <div class="pillar">
      <div class="pillar-num">03</div>
      <h4>Expert Negotiation</h4>
      <p>Every offer evaluated, every term negotiated, every dollar fought for. We protect your interests from the first showing to the final closing table.</p>
    </div>
    <div class="pillar">
      <div class="pillar-num">04</div>
      <h4>Personal Attention</h4>
      <p>You work directly with your broker from day one through closing. No hand-offs, no assistants, no runaround. Your sale is our priority.</p>
    </div>
  </div>
  <div class="page-footer">
    <span>Mallan Real Estate Inc.</span>
    <span>mallan.nyc</span>
  </div>
</div>

<!-- ═══════════ PAGE 3: YOUR PROPERTY ═══════════ -->
<div class="page">
  <h3>Your Property</h3>
  <h2>${esc(fullAddress)}</h2>
  <p class="muted small" style="margin-bottom:8px;">${borough ? esc(borough) + " — " : ""}${d.propertyType ? esc(d.propertyType) : "Residential"}</p>
  <div class="gold-line-wide"></div>
  <div class="prop-grid">
    ${d.beds != null ? `<div class="prop-item"><div class="label">Bedrooms</div><div class="value">${d.beds}</div></div>` : ""}
    ${d.baths != null ? `<div class="prop-item"><div class="label">Bathrooms</div><div class="value">${d.baths}</div></div>` : ""}
    ${d.sqft ? `<div class="prop-item"><div class="label">Square Feet</div><div class="value">${d.sqft.toLocaleString()}</div></div>` : ""}
    ${d.yearBuilt ? `<div class="prop-item"><div class="label">Year Built</div><div class="value">${d.yearBuilt}</div></div>` : ""}
    ${d.floors ? `<div class="prop-item"><div class="label">Building Floors</div><div class="value">${d.floors}</div></div>` : ""}
    ${d.unitsTotal ? `<div class="prop-item"><div class="label">Total Units</div><div class="value">${d.unitsTotal}</div></div>` : ""}
    ${d.lastPurchasePrice ? `<div class="prop-item"><div class="label">Purchase Price</div><div class="value">${usd(d.lastPurchasePrice)}</div></div>` : ""}
    ${d.lastPurchaseDate ? `<div class="prop-item"><div class="label">Purchased</div><div class="value">${fmtDate(d.lastPurchaseDate)}${d.ownershipYears ? ` (${Math.round(d.ownershipYears)}yr)` : ""}</div></div>` : ""}
    ${d.annualTax ? `<div class="prop-item"><div class="label">Annual Tax</div><div class="value">${usd(d.annualTax)}</div></div>` : ""}
  </div>
  <div class="page-footer">
    <span>Mallan Real Estate Inc.</span>
    <span>mallan.nyc</span>
  </div>
</div>

<!-- ═══════════ PAGE 4: PRICING STRATEGY ═══════════ -->
<div class="page">
  <h3>Pricing Strategy</h3>
  <h2>Positioning Your Property<br><span class="gold">for Maximum Value</span></h2>
  <p class="muted small" style="max-width:600px;">Our pricing recommendation is built on ${d.compsUsed || 0} comparable sales, current market conditions, and our deep knowledge of ${borough || "the New York City"} real estate.</p>

  ${d.recommended ? `
  <div class="price-cards">
    <div class="price-card">
      <div class="tier">Conservative</div>
      <div class="amount">${usd(d.conservative)}</div>
    </div>
    <div class="price-card featured">
      <div class="tier">Recommended</div>
      <div class="amount">${usd(d.recommended)}</div>
    </div>
    <div class="price-card">
      <div class="tier">Aspirational</div>
      <div class="amount">${usd(d.aspirational)}</div>
    </div>
  </div>
  ` : `
  <div style="padding:48px;text-align:center;background:rgba(255,255,255,0.02);border-radius:16px;margin:32px 0;">
    <p style="font-size:16px;color:var(--gray);">Pricing analysis will be prepared after property evaluation and comparable sales review.</p>
  </div>
  `}

  <p class="muted small" style="margin-top:24px;">An asking price beyond market range reduces buyer interest, extends time on market, and may result in the property selling below its true value. Our pricing is designed to generate maximum activity in the critical first two weeks.</p>
  <div class="page-footer">
    <span>Mallan Real Estate Inc.</span>
    <span>mallan.nyc</span>
  </div>
</div>

<!-- ═══════════ PAGE 5: COMPARABLE SALES ═══════════ -->
${d.recentSales.length > 0 ? `
<div class="page">
  <h3>Market Analysis</h3>
  <h2>Recent Comparable Sales</h2>
  <p class="muted small" style="margin-bottom:24px;">Closed transactions in your building and immediate area over the past 12 months.</p>

  <table class="comp-table">
    <thead>
      <tr>
        <th>Address</th>
        <th>Beds</th>
        <th>Baths</th>
        <th>Sq Ft</th>
        <th>Close Date</th>
        <th>Sale Price</th>
      </tr>
    </thead>
    <tbody>
      ${d.recentSales.map(s => `
      <tr>
        <td>${esc(s.address)}${s.unit ? ` #${esc(s.unit)}` : ""}</td>
        <td>${s.beds ?? "—"}</td>
        <td>${s.baths ?? "—"}</td>
        <td>${s.sqft ? s.sqft.toLocaleString() : "—"}</td>
        <td>${fmtDate(s.closeDate ?? null)}</td>
        <td style="color:var(--gold);font-weight:600;">${usd(s.closePrice)}</td>
      </tr>
      `).join("")}
    </tbody>
  </table>

  ${d.activeCompetition.length > 0 ? `
  <div class="gold-line-wide"></div>
  <h3 style="margin-top:16px;">Active Competition</h3>
  <table class="comp-table">
    <thead>
      <tr>
        <th>Address</th>
        <th>Beds</th>
        <th>Baths</th>
        <th>Sq Ft</th>
        <th>List Price</th>
      </tr>
    </thead>
    <tbody>
      ${d.activeCompetition.map(c => `
      <tr>
        <td>${esc(c.address)}${c.unit ? ` #${esc(c.unit)}` : ""}</td>
        <td>${c.beds ?? "—"}</td>
        <td>${c.baths ?? "—"}</td>
        <td>${c.sqft ? c.sqft.toLocaleString() : "—"}</td>
        <td style="font-weight:600;">${usd(c.listPrice)}</td>
      </tr>
      `).join("")}
    </tbody>
  </table>
  ` : ""}

  <div class="page-footer">
    <span>Mallan Real Estate Inc.</span>
    <span>mallan.nyc</span>
  </div>
</div>
` : ""}

<!-- ═══════════ PAGE 6: NET PROCEEDS ═══════════ -->
${d.recommended ? `
<div class="page">
  <h3>Financial Summary</h3>
  <h2>Estimated Net Proceeds</h2>
  <p class="muted small" style="max-width:600px;margin-bottom:32px;">Based on the recommended list price. Actual results depend on final sale price, negotiated terms, and attorney review.</p>

  <div style="max-width:560px;">
    <div class="proceeds-row">
      <span class="label">Estimated Sale Price</span>
      <span class="amount">${usd(d.recommended)}</span>
    </div>
    <div class="proceeds-row deduction">
      <span class="label">Commission (${Math.round((d.commissionRate || 0.06) * 100)}%)</span>
      <span class="amount">- ${usd(d.commission)}</span>
    </div>
    <div class="proceeds-row deduction">
      <span class="label">NYC/NYS Transfer Tax</span>
      <span class="amount">- ${usd(d.transferTax)}</span>
    </div>
    <div class="proceeds-row deduction">
      <span class="label">Attorney Fees (est.)</span>
      <span class="amount">- ${usd(d.attorneyFees || 3000)}</span>
    </div>
    ${d.mortgagePayoff ? `
    <div class="proceeds-row deduction">
      <span class="label">Mortgage Payoff</span>
      <span class="amount">- ${usd(d.mortgagePayoff)}</span>
    </div>
    ` : ""}
    <div class="proceeds-row total">
      <span class="label">Your Estimated Net Proceeds</span>
      <span class="amount">${usd(d.netProceeds)}</span>
    </div>
  </div>

  <div class="page-footer">
    <span>Mallan Real Estate Inc.</span>
    <span>mallan.nyc</span>
  </div>
</div>
` : ""}

<!-- ═══════════ PAGE 7: MARKETING PLAN ═══════════ -->
<div class="page">
  <h3>Marketing Plan</h3>
  <h2>How We'll <span class="gold">Launch</span> Your Property</h2>
  <p class="muted small" style="max-width:600px;margin-bottom:8px;">After the exclusive is signed, we execute a comprehensive marketing strategy designed to generate maximum buyer interest.</p>

  <div class="marketing-grid">
    <div class="marketing-item">
      <div class="num">1</div>
      <div class="text"><strong>Professional Photography</strong> — High-resolution photos, virtual tour, and floor plans</div>
    </div>
    <div class="marketing-item">
      <div class="num">2</div>
      <div class="text"><strong>REBNY RLS Listing</strong> — Shared with 17,000+ agents across 570 firms</div>
    </div>
    <div class="marketing-item">
      <div class="num">3</div>
      <div class="text"><strong>Portal Syndication</strong> — StreetEasy, Zillow, Realtor.com, Redfin, Homes.com</div>
    </div>
    <div class="marketing-item">
      <div class="num">4</div>
      <div class="text"><strong>mallan.nyc Featured Listing</strong> — Premium placement on our website</div>
    </div>
    <div class="marketing-item">
      <div class="num">5</div>
      <div class="text"><strong>Building Announcement</strong> — Postcards to your building and neighbors</div>
    </div>
    <div class="marketing-item">
      <div class="num">6</div>
      <div class="text"><strong>Open Houses</strong> — Weekly public open houses + broker previews</div>
    </div>
    <div class="marketing-item">
      <div class="num">7</div>
      <div class="text"><strong>Private Showings</strong> — Coordinated access for qualified buyers</div>
    </div>
    <div class="marketing-item">
      <div class="num">8</div>
      <div class="text"><strong>Email Campaigns</strong> — Targeted blasts to our buyer database and agent network</div>
    </div>
    <div class="marketing-item">
      <div class="num">9</div>
      <div class="text"><strong>Social Media</strong> — LinkedIn (30K+ followers), Instagram, targeted ads</div>
    </div>
    <div class="marketing-item">
      <div class="num">10</div>
      <div class="text"><strong>Weekly Reports</strong> — Showings, feedback, traffic, and pricing review</div>
    </div>
  </div>

  <div class="page-footer">
    <span>Mallan Real Estate Inc.</span>
    <span>mallan.nyc</span>
  </div>
</div>

<!-- ═══════════ PAGE 8: REACH ═══════════ -->
<div class="page">
  <h3>Our Reach</h3>
  <h2>Maximum Exposure,<br><span class="gold">Maximum Results</span></h2>

  <div class="stats-row">
    <div class="stat">
      <div class="num">${d.buyerCount.toLocaleString()}</div>
      <div class="label">Active Buyers</div>
    </div>
    <div class="stat">
      <div class="num">${d.agentNetwork.toLocaleString()}+</div>
      <div class="label">REBNY Agents</div>
    </div>
    <div class="stat">
      <div class="num">${d.firms}</div>
      <div class="label">Brokerage Firms</div>
    </div>
    <div class="stat">
      <div class="num">30</div>
      <div class="label">IDX Providers</div>
    </div>
  </div>

  <h3>Syndication Portals</h3>
  <div class="portal-list">
    ${["StreetEasy", "Zillow", "Trulia", "Realtor.com", "Redfin", "Homes.com", "RentHop", "mallan.nyc", "openigloo", "Samaki.com", "TBI Listings", "LinkedIn", "Google"].map(p => `<div class="portal-tag">${p}</div>`).join("")}
  </div>

  <div class="page-footer">
    <span>Mallan Real Estate Inc.</span>
    <span>mallan.nyc</span>
  </div>
</div>

<!-- ═══════════ PAGE 9: THE PROCESS ═══════════ -->
<div class="page">
  <h3>The Process</h3>
  <h2>From Listing to <span class="gold">Closing</span></h2>
  <p class="muted small" style="max-width:600px;margin-bottom:32px;">I will be your resource and guide at every step.</p>

  <div style="display:flex;flex-direction:column;gap:20px;">
    ${[
      { step: "Initial Consultation", desc: "Understand your goals, timeline, and property. Prepare the listing." },
      { step: "Property Preparation", desc: "Photography, staging guidance, repairs. Making the best first impression." },
      { step: "Launch & Marketing", desc: "Go live on all portals. Open houses, broker tours, targeted outreach." },
      { step: "Showings & Feedback", desc: "Coordinate access, collect buyer feedback, adjust strategy as needed." },
      { step: "Offers & Negotiation", desc: "Qualify buyers, evaluate offers, negotiate the best terms for you." },
      { step: "Contract to Close", desc: "Board package, appraisal, mortgage follow-up, managing agent coordination." },
      { step: "Closing Day", desc: "Final walk-through, closing coordination, key handover. Celebrate." },
    ].map((s, i) => `
    <div style="display:flex;align-items:flex-start;gap:20px;">
      <div style="width:36px;height:36px;border-radius:50%;border:2px solid var(--gold);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:var(--gold);flex-shrink:0;">${i + 1}</div>
      <div>
        <div style="font-size:16px;font-weight:600;color:var(--white);margin-bottom:4px;">${s.step}</div>
        <div style="font-size:13px;color:var(--gray);line-height:1.5;">${s.desc}</div>
      </div>
    </div>
    `).join("")}
  </div>

  <div class="page-footer">
    <span>Mallan Real Estate Inc.</span>
    <span>mallan.nyc</span>
  </div>
</div>

<!-- ═══════════ PAGE 10: ABOUT / CONTACT ═══════════ -->
<div class="page">
  <h3>About Your Broker</h3>
  <h2>Maya Allan</h2>
  <div class="gold-line"></div>

  <div class="agent-card">
    <div class="info">
      <h4>Maya Allan</h4>
      <div class="title">Licensed Real Estate Broker — Principal</div>
      <p>
        An experienced real estate professional with deep expertise in New York City residential,
        investment, and commercial properties. Active member of the Real Estate Board of New York (REBNY)
        with access to the full REBNY RLS network of 17,000+ agents.<br><br>
        Skilled negotiator and marketer with a commitment to personal service —
        you work directly with your broker from day one through closing.
      </p>
    </div>
  </div>

  <div style="margin-top:48px;text-align:center;">
    <div style="font-family:'Playfair Display',serif;font-size:28px;font-weight:700;color:var(--gold);margin-bottom:16px;">Let's get started.</div>
    <div style="font-size:15px;color:var(--gray);line-height:2;">
      <strong style="color:var(--white);">${esc(d.agentName)}</strong><br>
      Licensed Real Estate Broker — NY DOS #10311201806<br>
      Mallan Real Estate Inc. — NY DOS #10991205323<br>
      646-258-4460 — maya@mallan.nyc — mallan.nyc<br>
      400 East 90th Street, Suite 17C, New York, NY 10128
    </div>
  </div>

  <div class="page-footer">
    <span>Mallan Real Estate Inc.</span>
    <span>mallan.nyc</span>
  </div>
</div>

<!-- ═══════════ LEGAL FOOTER ═══════════ -->
<div style="max-width:1200px;margin:0 auto;padding:40px 60px 80px;font-size:10px;color:rgba(255,255,255,0.2);line-height:1.8;">
  <p>This proposal is intended for the exclusive use of the property owner named herein. The market data and pricing estimates provided are based on currently available information and are subject to change. This is not an appraisal or guarantee of value.</p>
  <p style="margin-top:8px;">Mallan Real Estate Inc. is committed to compliance with the Fair Housing Act, the New York State Human Rights Law, and the New York City Human Rights Law (Title 8). We do not discriminate on the basis of race, color, religion, sex, national origin, familial status, disability, sexual orientation, gender identity, marital status, age, lawful source of income, or any other protected class.</p>
  <p style="margin-top:8px;">&copy; ${new Date().getFullYear()} Mallan Real Estate Inc. All rights reserved.</p>
</div>

</body>
</html>`;
}
