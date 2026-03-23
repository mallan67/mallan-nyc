/**
 * Pitch Packet HTML Template — Comprehensive seller proposal
 *
 * Light theme (print-friendly), gold accents, Urbanist + Inter fonts.
 * Matches mallan.nyc site design system.
 *
 * Structure follows original "Home Selling and Marketing Proposal" PPT:
 * 1.  Cover
 * 2.  What to Expect (agenda)
 * 3.  The 4 Pillars (our commitment)
 * 4.  Understanding Your Needs (seller questionnaire)
 * 5.  Appreciating Your Property (property Q&A)
 * 6.  Your Property Details (data from ACRIS/PLUTO)
 * 7.  Market Analysis — Comparable Sales
 * 8.  Pricing Strategy
 * 9.  Net Proceeds Estimate
 * 10. Marketing Plan (12 steps)
 * 11. Digital Reach & Syndication
 * 12. How Buyers Find Homes
 * 13. Dangers of Overpricing
 * 14. Preparing Your Home for Sale
 * 15. Show Off Your Property
 * 16. You Are the Key Player
 * 17. Agency Relationships
 * 18. The Home Selling Process
 * 19. About Maya Allan / Contact
 * 20. Legal / Fair Housing
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function usd(n: number | null | undefined): string {
  if (!n) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export interface PitchPacketData {
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
  conservative?: number | null;
  recommended?: number | null;
  aspirational?: number | null;
  compsUsed?: number;
  commission?: number | null;
  commissionRate?: number;
  transferTax?: number | null;
  attorneyFees?: number;
  mortgagePayoff?: number | null;
  netProceeds?: number | null;
  recentSales: Array<{ address: string; unit?: string | null; closePrice?: number | null; closeDate?: string | Date | null; beds?: number | null; baths?: number | null; sqft?: number | null }>;
  activeCompetition: Array<{ address: string; unit?: string | null; listPrice?: number | null; beds?: number | null; baths?: number | null; sqft?: number | null }>;
  buyerCount: number;
  agentNetwork: number;
  firms: number;
  agentName: string;
  generatedAt: string;
}

export function renderPitchPacketHTML(d: PitchPacketData): string {
  const fullAddr = d.address + (d.unit ? `, #${d.unit}` : "");
  const boroughMap: Record<string, string> = { "1": "Manhattan", "2": "Bronx", "3": "Brooklyn", "4": "Queens", "5": "Staten Island" };
  const borough = boroughMap[d.borough || ""] || d.borough || "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Home Selling Proposal — ${esc(fullAddr)} | Mallan Real Estate</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Urbanist:wght@300;400;500;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --gold:#C4A052;--gold-deep:#B8860B;--ink:#0A0A0A;--muted:#64748b;
  --line:#e2e8f0;--bg:#FEFEFE;--bg-soft:#f8fafc;--bg-warm:#faf8f5;
}
body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased;font-size:15px;line-height:1.7}

/* Page */
.page{max-width:900px;margin:0 auto;padding:60px 56px;min-height:100vh;display:flex;flex-direction:column;justify-content:center;page-break-after:always;position:relative}
.page-num{position:absolute;bottom:32px;right:56px;font-size:11px;color:var(--muted);letter-spacing:1px}
.page-brand{position:absolute;bottom:32px;left:56px;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:var(--muted)}

/* Typography */
h1{font-family:'Urbanist',sans-serif;font-weight:800;font-size:48px;letter-spacing:-0.03em;line-height:1.1;color:var(--ink)}
h2{font-family:'Urbanist',sans-serif;font-weight:700;font-size:32px;letter-spacing:-0.02em;line-height:1.2;color:var(--ink);margin-bottom:8px}
h3{font-family:'Urbanist',sans-serif;font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:2.5px;color:var(--gold);margin-bottom:20px}
h4{font-family:'Urbanist',sans-serif;font-weight:700;font-size:20px;color:var(--ink);margin-bottom:8px}
.subtitle{font-size:17px;color:var(--muted);font-weight:400;margin-bottom:40px;max-width:560px;line-height:1.7}

/* Utility */
.gold{color:var(--gold)}.muted{color:var(--muted)}
.gold-line{width:48px;height:3px;background:var(--gold);margin-bottom:28px;border-radius:2px}
.divider{width:100%;height:1px;background:var(--line);margin:40px 0}

/* Cover */
.cover{justify-content:flex-end;padding-bottom:100px}
.cover .logo{font-family:'Urbanist',sans-serif;font-weight:800;font-size:14px;letter-spacing:5px;text-transform:uppercase;color:var(--gold);margin-bottom:64px}
.cover h1{font-size:52px;margin-bottom:8px}
.cover .address{font-size:20px;color:var(--muted);font-weight:400;margin-bottom:48px}
.cover .meta{font-size:14px;color:var(--muted);line-height:2}
.cover .meta strong{color:var(--ink);font-weight:600}

/* Cards */
.card-grid{display:grid;gap:20px;margin:28px 0}
.card-grid-2{grid-template-columns:1fr 1fr}
.card-grid-3{grid-template-columns:1fr 1fr 1fr}
.card-grid-4{grid-template-columns:1fr 1fr 1fr 1fr}
.card{padding:28px 24px;border:1px solid var(--line);border-radius:12px;background:var(--bg)}
.card:hover{border-color:var(--gold)}
.card .num{font-family:'Urbanist',sans-serif;font-size:42px;font-weight:800;color:var(--gold);opacity:0.25;line-height:1;margin-bottom:12px}
.card h4{margin-bottom:8px}
.card p{font-size:13px;color:var(--muted);line-height:1.6}

/* Stats */
.stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:28px 0}
.stat{text-align:center;padding:24px 12px;border:1px solid var(--line);border-radius:12px;background:var(--bg-warm)}
.stat .val{font-family:'Urbanist',sans-serif;font-size:32px;font-weight:800;color:var(--gold-deep)}
.stat .lbl{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);margin-top:6px}

/* Property grid */
.prop-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:28px 0}
.prop-item{padding:20px;background:var(--bg-warm);border-radius:10px}
.prop-item .lbl{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);margin-bottom:6px}
.prop-item .val{font-size:20px;font-weight:700;color:var(--ink)}

/* Price cards */
.price-cards{display:grid;grid-template-columns:1fr 1.3fr 1fr;gap:16px;margin:32px 0}
.price-card{padding:28px 20px;border-radius:14px;text-align:center;border:1px solid var(--line)}
.price-card.featured{background:var(--gold);border-color:var(--gold);color:#fff;transform:scale(1.04)}
.price-card .tier{font-size:10px;text-transform:uppercase;letter-spacing:2px;font-weight:600;margin-bottom:10px;opacity:0.7}
.price-card .amt{font-family:'Urbanist',sans-serif;font-size:28px;font-weight:800}
.price-card.featured .tier{color:rgba(255,255,255,0.8)}.price-card.featured .amt{color:#fff}

/* Table */
table.comp{width:100%;border-collapse:collapse;margin:20px 0;font-size:13px}
table.comp th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--gold);padding:10px 14px;border-bottom:2px solid var(--line);font-weight:600}
table.comp th:last-child,table.comp td:last-child{text-align:right}
table.comp td{padding:12px 14px;border-bottom:1px solid var(--line);color:var(--muted)}
table.comp td:first-child{color:var(--ink);font-weight:500}

/* Proceeds */
.line-item{display:flex;justify-content:space-between;align-items:baseline;padding:12px 0;border-bottom:1px solid var(--line);font-size:15px}
.line-item .lbl{color:var(--muted)}.line-item .amt{font-weight:600}
.line-item.deduct .amt{color:#dc2626}
.line-item.total{border-top:2px solid var(--gold);border-bottom:none;padding-top:16px;margin-top:8px}
.line-item.total .lbl{color:var(--ink);font-weight:700;font-size:16px}
.line-item.total .amt{color:var(--gold-deep);font-family:'Urbanist',sans-serif;font-size:28px;font-weight:800}

/* Marketing list */
.mkt-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:24px 0}
.mkt-item{display:flex;align-items:flex-start;gap:14px;padding:16px;border:1px solid var(--line);border-radius:10px}
.mkt-item .step{width:28px;height:28px;border-radius:50%;background:var(--gold);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0}
.mkt-item .txt{font-size:13px;color:var(--muted);line-height:1.5}
.mkt-item .txt strong{color:var(--ink)}

/* Portals */
.portal-list{display:flex;flex-wrap:wrap;gap:8px;margin:20px 0}
.portal-tag{padding:6px 14px;background:var(--bg-warm);border:1px solid var(--line);border-radius:8px;font-size:11px;font-weight:600;color:var(--gold-deep)}

/* Bullet section */
.bullets{list-style:none;padding:0;margin:20px 0}
.bullets li{padding:10px 0;border-bottom:1px solid var(--line);font-size:14px;color:var(--ink);display:flex;align-items:flex-start;gap:12px}
.bullets li::before{content:'';width:8px;height:8px;border-radius:50%;background:var(--gold);flex-shrink:0;margin-top:6px}
.bullets li:last-child{border-bottom:none}

/* Process */
.process-step{display:flex;align-items:flex-start;gap:20px;margin-bottom:20px}
.process-step .circle{width:36px;height:36px;border-radius:50%;border:2px solid var(--gold);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:var(--gold);flex-shrink:0}
.process-step .title{font-size:16px;font-weight:600;color:var(--ink);margin-bottom:2px}
.process-step .desc{font-size:13px;color:var(--muted)}

/* Two-col */
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin:24px 0}
.two-col ul{list-style:none;padding:0}
.two-col li{padding:8px 0;font-size:14px;color:var(--ink);border-bottom:1px solid var(--line)}
.two-col li:last-child{border-bottom:none}

/* Agent */
.agent-box{padding:40px;border:1px solid var(--line);border-radius:16px;margin-top:32px;background:var(--bg-warm)}
.agent-box h4{font-size:24px;margin-bottom:4px}
.agent-box .role{font-size:14px;color:var(--gold);font-weight:500;margin-bottom:16px}
.agent-box p{font-size:14px;color:var(--muted);line-height:1.8}

/* CTA */
.cta{text-align:center;margin-top:48px}
.cta .headline{font-family:'Urbanist',sans-serif;font-size:28px;font-weight:700;color:var(--ink);margin-bottom:16px}
.cta .details{font-size:14px;color:var(--muted);line-height:2.2}
.cta .details strong{color:var(--ink)}

/* Legal */
.legal{font-size:10px;color:var(--muted);line-height:1.8;max-width:900px;margin:0 auto;padding:40px 56px 80px}

/* Print */
@media print{
  body{background:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{padding:36px 40px;min-height:auto;page-break-inside:avoid}
  .card:hover{border-color:var(--line)}
}
</style>
</head>
<body>

<!-- ══════ 1. COVER ══════ -->
<div class="page cover">
  <div class="logo">Mallan Real Estate</div>
  <h1>Home Selling &amp;<br>Marketing Proposal</h1>
  <div class="address">${esc(fullAddr)}${borough ? ` — ${esc(borough)}` : ""}</div>
  <div class="gold-line"></div>
  <div class="meta">
    Prepared exclusively for <strong>${esc(d.ownerName || "the homeowner")}</strong><br>
    By <strong>${esc(d.agentName)}</strong> — Licensed Real Estate Broker<br>
    Mallan Real Estate Inc. | 646-258-4460 | maya@mallan.nyc<br>
    ${esc(fmtDate(d.generatedAt))}
  </div>
  <div class="page-brand">Mallan Real Estate</div>
  <div class="page-num">mallan.nyc</div>
</div>

<!-- ══════ 2. WHAT TO EXPECT ══════ -->
<div class="page">
  <h3>Overview</h3>
  <h2>What to Expect</h2>
  <div class="gold-line"></div>
  <div class="subtitle">This proposal outlines how we will work together to sell your property for the best possible price, in the shortest time, with the least inconvenience to you.</div>
  <ul class="bullets">
    <li>Identifying your goals, timeline, and priorities</li>
    <li>Understanding and appreciating your property's unique features</li>
    <li>Establishing a data-driven pricing strategy</li>
    <li>Preparing your property for sale</li>
    <li>Comprehensive marketing and maximum exposure</li>
    <li>Expert negotiation on every offer</li>
    <li>Managing the deal through closing</li>
    <li>After-sale service and referrals</li>
  </ul>
  <div class="page-brand">Mallan Real Estate</div>
</div>

<!-- ══════ 3. THE 4 PILLARS ══════ -->
<div class="page">
  <h3>Our Commitment</h3>
  <h2>Every Property We Represent</h2>
  <div class="subtitle">Receives the full weight of our marketing, our network, and our relentless attention to detail.</div>
  <div class="card-grid card-grid-2">
    <div class="card"><div class="num">01</div><h4>Professional Imagery</h4><p>High-resolution photography, virtual tours, and floor plans that make buyers stop scrolling and start calling. Your property will be presented at its absolute best.</p></div>
    <div class="card"><div class="num">02</div><h4>Strategic Pricing</h4><p>Data-driven pricing backed by comparable sales, real-time market conditions, and deep neighborhood expertise. We position your property to attract the right buyers at the right price.</p></div>
    <div class="card"><div class="num">03</div><h4>Expert Negotiation</h4><p>Every offer evaluated, every term negotiated, every dollar fought for. We protect your interests from the first showing to the final closing table.</p></div>
    <div class="card"><div class="num">04</div><h4>Personal Attention</h4><p>You work directly with your broker from day one through closing. No hand-offs, no assistants, no runaround. Your sale is our priority.</p></div>
  </div>
  <div class="page-brand">Mallan Real Estate</div>
</div>

<!-- ══════ 4. UNDERSTANDING YOUR NEEDS ══════ -->
<div class="page">
  <h3>Discovery</h3>
  <h2>Understanding Your Needs</h2>
  <div class="gold-line"></div>
  <div class="subtitle">The following topics will help me understand what is most important to you in the sale of your property:</div>
  <div class="two-col">
    <ul>
      <li>Your communication preferences</li>
      <li>Your motivation for selling</li>
      <li>Your ideal time frame</li>
      <li>Relocation needs or assistance</li>
      <li>Previous home selling experience</li>
    </ul>
    <ul>
      <li>Your price expectations</li>
      <li>Your marketing preferences</li>
      <li>Key home selling decisions</li>
      <li>What a positive experience looks like</li>
      <li>Any concerns or special conditions</li>
    </ul>
  </div>
  <div class="page-brand">Mallan Real Estate</div>
</div>

<!-- ══════ 5. APPRECIATING YOUR PROPERTY ══════ -->
<div class="page">
  <h3>Your Home</h3>
  <h2>Appreciating Your Property</h2>
  <div class="gold-line"></div>
  <div class="subtitle">Each property has special features that may interest buyers. These questions help us highlight what makes your home unique:</div>
  <ul class="bullets">
    <li>What do you feel are the <strong>most appealing features</strong> of this property?</li>
    <li>What features does this property have that <strong>differentiate</strong> it from other similar properties?</li>
    <li>What <strong>changes or enhancements</strong> would you suggest to make your property as salable as possible?</li>
    <li>What do you regard as the most attractive features of the <strong>surrounding neighborhood</strong>?</li>
    <li>Do you have any <strong>special terms or conditions</strong> regarding the sale I should be aware of (e.g., items of personal property to be excluded)?</li>
    <li>Are you aware of any <strong>problems or concerns</strong> regarding the property or the neighborhood that will need to be disclosed to prospective buyers?</li>
  </ul>
  <div class="page-brand">Mallan Real Estate</div>
</div>

<!-- ══════ 6. YOUR PROPERTY DETAILS ══════ -->
<div class="page">
  <h3>Property Data</h3>
  <h2>${esc(fullAddr)}</h2>
  <p class="muted" style="font-size:14px;margin-bottom:4px;">${borough ? esc(borough) + " — " : ""}${d.propertyType ? esc(d.propertyType) : "Residential"}</p>
  <div class="divider"></div>
  <div class="prop-grid">
    ${d.beds != null ? `<div class="prop-item"><div class="lbl">Bedrooms</div><div class="val">${d.beds}</div></div>` : ""}
    ${d.baths != null ? `<div class="prop-item"><div class="lbl">Bathrooms</div><div class="val">${d.baths}</div></div>` : ""}
    ${d.sqft ? `<div class="prop-item"><div class="lbl">Square Feet</div><div class="val">${d.sqft.toLocaleString()}</div></div>` : ""}
    ${d.yearBuilt ? `<div class="prop-item"><div class="lbl">Year Built</div><div class="val">${d.yearBuilt}</div></div>` : ""}
    ${d.floors ? `<div class="prop-item"><div class="lbl">Building Floors</div><div class="val">${d.floors}</div></div>` : ""}
    ${d.unitsTotal ? `<div class="prop-item"><div class="lbl">Total Units</div><div class="val">${d.unitsTotal}</div></div>` : ""}
    ${d.lastPurchasePrice ? `<div class="prop-item"><div class="lbl">Purchase Price</div><div class="val">${usd(d.lastPurchasePrice)}</div></div>` : ""}
    ${d.lastPurchaseDate ? `<div class="prop-item"><div class="lbl">Purchased</div><div class="val">${fmtDate(d.lastPurchaseDate)}${d.ownershipYears ? ` (${Math.round(d.ownershipYears)}yr)` : ""}</div></div>` : ""}
    ${d.annualTax ? `<div class="prop-item"><div class="lbl">Annual Tax</div><div class="val">${usd(d.annualTax)}</div></div>` : ""}
  </div>
  <p style="font-size:11px;color:var(--muted);margin-top:16px;">Property data sourced from NYC ACRIS, DOF, and PLUTO public records.</p>
  <div class="page-brand">Mallan Real Estate</div>
</div>

<!-- ══════ 7. COMPARABLE SALES ══════ -->
${d.recentSales.length > 0 ? `
<div class="page">
  <h3>Market Analysis</h3>
  <h2>Recent Comparable Sales</h2>
  <div class="gold-line"></div>
  <p class="subtitle">Closed transactions in your building and immediate area over the past 12 months.</p>
  <table class="comp">
    <thead><tr><th>Address</th><th>Beds</th><th>Baths</th><th>Sq Ft</th><th>Close Date</th><th>Sale Price</th></tr></thead>
    <tbody>
    ${d.recentSales.map(s => `<tr>
      <td>${esc(s.address)}${s.unit ? ` #${esc(s.unit)}` : ""}</td>
      <td>${s.beds ?? "—"}</td><td>${s.baths ?? "—"}</td>
      <td>${s.sqft ? s.sqft.toLocaleString() : "—"}</td>
      <td>${fmtDate(s.closeDate ?? null)}</td>
      <td style="color:var(--gold-deep);font-weight:600">${usd(s.closePrice)}</td>
    </tr>`).join("")}
    </tbody>
  </table>
  ${d.activeCompetition.length > 0 ? `
  <div class="divider"></div>
  <h3>Active Competition</h3>
  <table class="comp">
    <thead><tr><th>Address</th><th>Beds</th><th>Baths</th><th>Sq Ft</th><th>List Price</th></tr></thead>
    <tbody>
    ${d.activeCompetition.map(c => `<tr>
      <td>${esc(c.address)}${c.unit ? ` #${esc(c.unit)}` : ""}</td>
      <td>${c.beds ?? "—"}</td><td>${c.baths ?? "—"}</td>
      <td>${c.sqft ? c.sqft.toLocaleString() : "—"}</td>
      <td style="font-weight:600">${usd(c.listPrice)}</td>
    </tr>`).join("")}
    </tbody>
  </table>` : ""}
  <div class="page-brand">Mallan Real Estate</div>
</div>` : ""}

<!-- ══════ 8. PRICING STRATEGY ══════ -->
<div class="page">
  <h3>Pricing</h3>
  <h2>Positioning for <span class="gold">Maximum Value</span></h2>
  <div class="gold-line"></div>
  <p class="subtitle">Our pricing recommendation is built on ${d.compsUsed || 0} comparable sales, current market conditions, and deep knowledge of ${borough || "New York City"} real estate.</p>
  ${d.recommended ? `
  <div class="price-cards">
    <div class="price-card"><div class="tier">Conservative</div><div class="amt">${usd(d.conservative)}</div></div>
    <div class="price-card featured"><div class="tier">Recommended</div><div class="amt">${usd(d.recommended)}</div></div>
    <div class="price-card"><div class="tier">Aspirational</div><div class="amt">${usd(d.aspirational)}</div></div>
  </div>` : `
  <div style="padding:40px;text-align:center;border:1px solid var(--line);border-radius:14px;margin:28px 0">
    <p style="color:var(--muted)">Pricing analysis will be prepared after property evaluation and comparable sales review.</p>
  </div>`}
  <div class="page-brand">Mallan Real Estate</div>
</div>

<!-- ══════ 9. NET PROCEEDS ══════ -->
${d.recommended ? `
<div class="page">
  <h3>Financial Summary</h3>
  <h2>Estimated Net Proceeds</h2>
  <div class="gold-line"></div>
  <p class="subtitle">Based on the recommended list price. Actual results depend on final sale price, negotiated terms, and attorney review.</p>
  <div style="max-width:520px">
    <div class="line-item"><span class="lbl">Estimated Sale Price</span><span class="amt">${usd(d.recommended)}</span></div>
    <div class="line-item deduct"><span class="lbl">Commission (${Math.round((d.commissionRate || 0.06) * 100)}%)</span><span class="amt">- ${usd(d.commission)}</span></div>
    <div class="line-item deduct"><span class="lbl">NYC/NYS Transfer Tax</span><span class="amt">- ${usd(d.transferTax)}</span></div>
    <div class="line-item deduct"><span class="lbl">Attorney Fees (est.)</span><span class="amt">- ${usd(d.attorneyFees || 3000)}</span></div>
    ${d.mortgagePayoff ? `<div class="line-item deduct"><span class="lbl">Mortgage Payoff</span><span class="amt">- ${usd(d.mortgagePayoff)}</span></div>` : ""}
    <div class="line-item total"><span class="lbl">Your Estimated Net Proceeds</span><span class="amt">${usd(d.netProceeds)}</span></div>
  </div>
  <div class="page-brand">Mallan Real Estate</div>
</div>` : ""}

<!-- ══════ 10. MARKETING PLAN ══════ -->
<div class="page">
  <h3>After the Exclusive is Signed</h3>
  <h2>Marketing Your Property</h2>
  <div class="gold-line"></div>
  <div class="mkt-grid">
    <div class="mkt-item"><div class="step">1</div><div class="txt"><strong>Professional Photography</strong> — High-resolution photos, virtual tour, and floor plans for your home</div></div>
    <div class="mkt-item"><div class="step">2</div><div class="txt"><strong>Building Postcards</strong> — Professional postcards announcing the sale in your building and surrounding buildings</div></div>
    <div class="mkt-item"><div class="step">3</div><div class="txt"><strong>mallan.nyc Featured Listing</strong> — Premium placement as a featured property on our website</div></div>
    <div class="mkt-item"><div class="step">4</div><div class="txt"><strong>REBNY RLS Distribution</strong> — Listed on all REBNY broker sites (17,000+ agents across 570 firms)</div></div>
    <div class="mkt-item"><div class="step">5</div><div class="txt"><strong>National Portal Syndication</strong> — StreetEasy, Zillow, Realtor.com, Redfin, Homes.com, RentHop</div></div>
    <div class="mkt-item"><div class="step">6</div><div class="txt"><strong>Management Coordination</strong> — Announce sale to managing agent, obtain purchase application and showing guidelines</div></div>
    <div class="mkt-item"><div class="step">7</div><div class="txt"><strong>Weekly Open Houses</strong> — Public open houses set and advertised on all major platforms</div></div>
    <div class="mkt-item"><div class="step">8</div><div class="txt"><strong>Private Showings</strong> — Coordinated showings to qualified buyers and broker previews</div></div>
    <div class="mkt-item"><div class="step">9</div><div class="txt"><strong>Broker Open Houses</strong> — Monthly broker events to draw attention and create buzz</div></div>
    <div class="mkt-item"><div class="step">10</div><div class="txt"><strong>Weekly Reports</strong> — Showings, customer feedback, advertising traffic, and broker feedback</div></div>
    <div class="mkt-item"><div class="step">11</div><div class="txt"><strong>Email &amp; Social</strong> — Targeted campaigns to our buyer database, LinkedIn (30K+ followers), and agent network</div></div>
    <div class="mkt-item"><div class="step">12</div><div class="txt"><strong>Monthly Pricing Review</strong> — Assessment of market position with strategy adjustments as needed</div></div>
  </div>
  <div class="page-brand">Mallan Real Estate</div>
</div>

<!-- ══════ 11. DIGITAL REACH ══════ -->
<div class="page">
  <h3>Exposure</h3>
  <h2>Maximum Reach, <span class="gold">Maximum Results</span></h2>
  <div class="gold-line"></div>
  <p class="subtitle">More than 90% of home searches begin online. Your property will be displayed across every major platform.</p>
  <div class="stat-grid">
    <div class="stat"><div class="val">${d.buyerCount.toLocaleString()}</div><div class="lbl">Active Buyers</div></div>
    <div class="stat"><div class="val">${d.agentNetwork.toLocaleString()}+</div><div class="lbl">REBNY Agents</div></div>
    <div class="stat"><div class="val">${d.firms}</div><div class="lbl">Brokerage Firms</div></div>
    <div class="stat"><div class="val">30</div><div class="lbl">IDX Providers</div></div>
  </div>
  <h3>Your Property Will Appear On</h3>
  <div class="portal-list">
    ${["StreetEasy (NYC)", "Zillow (National)", "Trulia (National)", "Realtor.com (National)", "Redfin (National)", "Homes.com (National)", "RentHop (NYC)", "mallan.nyc (Featured)", "REBNY RLS (17K+ Agents)", "LinkedIn (30K+ Followers)", "Google Search (Global)", "openigloo", "Samaki.com", "TBI Listings"].map(p => `<div class="portal-tag">${p}</div>`).join("")}
  </div>
  <div class="page-brand">Mallan Real Estate</div>
</div>

<!-- ══════ 12. DANGERS OF OVERPRICING ══════ -->
<div class="page">
  <h3>Pricing Insight</h3>
  <h2>The Dangers of Overpricing</h2>
  <div class="gold-line"></div>
  <p class="subtitle">An asking price beyond market range can adversely affect the marketing of your property:</p>
  <ul class="bullets">
    <li><strong>Fewer buyers are attracted</strong>, and fewer offers are received</li>
    <li><strong>Marketing time is prolonged</strong>, and initial marketing momentum is lost — the critical first 2 weeks see the most buyer activity</li>
    <li>The property <strong>attracts "lookers"</strong> and helps competing properties look better by comparison</li>
    <li>If a property does sell above true market value, it <strong>may not appraise</strong>, and the buyers may not be able to secure a loan</li>
    <li>The property may <strong>eventually sell below market value</strong> due to stigma of extended time on market</li>
  </ul>
  <div style="padding:24px;background:var(--bg-warm);border-radius:12px;margin-top:24px">
    <p style="font-size:13px;color:var(--muted);line-height:1.7"><strong style="color:var(--ink)">Pricing at fair market value attracts 60% of prospective buyers.</strong> Pricing just 5% above reduces interest to 30%. At 10% above, only 2% of buyers will even look at the property. Our pricing strategy is designed to generate maximum activity during the critical first two weeks on market.</p>
  </div>
  <div class="page-brand">Mallan Real Estate</div>
</div>

<!-- ══════ 13. PREPARING YOUR HOME ══════ -->
<div class="page">
  <h3>Preparation</h3>
  <h2>How Will Buyers See Your Property?</h2>
  <div class="gold-line"></div>
  <p class="subtitle">It is important for your property to make the best possible impression on prospective buyers. The following can interfere with a buyer's appreciation:</p>
  <div class="two-col">
    <ul>
      <li>Clutter and personal items</li>
      <li>Worn carpets and drapes</li>
      <li>Peeling paint, smudges on walls</li>
      <li>Dead or dying plants</li>
      <li>Anything that looks old or worn</li>
    </ul>
    <ul>
      <li>Soiled windows, kitchen, baths</li>
      <li>Pet and smoking odors</li>
      <li>Outdated fixtures or hardware</li>
      <li>Dark or poorly lit rooms</li>
      <li>Overflowing closets or storage</li>
    </ul>
  </div>
  <div class="divider"></div>
  <h4>Show Off Your Property Every Time</h4>
  <p style="font-size:14px;color:var(--muted);margin-bottom:16px">These tips help your home make the best impression every time it is shown:</p>
  <div class="two-col">
    <ul>
      <li>Make beds, clean dishes, empty wastebaskets</li>
      <li>Remove clutter and put away toys</li>
      <li>Set out "show towels" in bathrooms</li>
      <li>Freshen the air — deodorize pet areas</li>
      <li>Set a comfortable temperature</li>
    </ul>
    <ul>
      <li>Quick vacuuming and dusting</li>
      <li>Arrange fresh flowers throughout</li>
      <li>Open blinds — maximize natural light</li>
      <li>Play soft background music</li>
      <li>Fire in fireplace (when appropriate)</li>
    </ul>
  </div>
  <div class="page-brand">Mallan Real Estate</div>
</div>

<!-- ══════ 14. YOU ARE THE KEY PLAYER ══════ -->
<div class="page">
  <h3>Partnership</h3>
  <h2>You Are the Key Player</h2>
  <div class="gold-line"></div>
  <p class="subtitle">No one has a more important role in the home-selling process than you. Here are ways your participation contributes to a successful sale:</p>
  <ul class="bullets">
    <li>Maintain the property in <strong>ready-to-show condition</strong></li>
    <li>Ensure the property is <strong>easily accessible</strong> to real estate professionals</li>
    <li>Try to be <strong>flexible in scheduling</strong> showings</li>
    <li>When you are not at home, let me know <strong>how to reach you</strong> in case an offer is received</li>
    <li>If approached directly by a buyer who is not represented by a real estate professional, <strong>please contact me</strong> — do not allow them into the property unescorted</li>
    <li>Remove or lock up <strong>valuables, jewelry, cash, and prescription medications</strong></li>
  </ul>
  <div class="page-brand">Mallan Real Estate</div>
</div>

<!-- ══════ 15. WHEN OFFERS COME IN ══════ -->
<div class="page">
  <h3>Closing the Deal</h3>
  <h2>When Offers Come In</h2>
  <div class="gold-line"></div>
  <div class="subtitle">When all goes well and offers are received, here is what happens next:</div>
  <div style="display:flex;flex-direction:column;gap:16px">
    ${[
      { s: "Qualifying the Buyers", d: "Verifying assets, income, income-to-debt ratio — do they meet the co-op board requirements?" },
      { s: "Deal Sheet & Documents", d: "Setting up the deal sheet and sending the offering plan, financials, and deal sheet to the buyer/seller lawyers" },
      { s: "Board Package Preparation", d: "Preparing the board package while following up with the mortgage company to set appraisal and provide comps" },
      { s: "Board Submission", d: "The board package is reviewed and submitted with all supporting financial documents" },
      { s: "Interview Coordination", d: "Following up with management on interview date and preparing the buyer(s) for the board interview" },
      { s: "Board Approval", d: "Once approved, the closing date is coordinated with all parties — mortgage, title search, managing agent, buyer and seller" },
      { s: "Closing Day", d: "Final walk-through, document signing, key handover. We coordinate every detail so closing goes smoothly." },
    ].map((item, i) => `
    <div class="process-step">
      <div class="circle">${i + 1}</div>
      <div><div class="title">${item.s}</div><div class="desc">${item.d}</div></div>
    </div>`).join("")}
  </div>
  <div style="margin-top:24px;padding:16px 20px;background:var(--bg-warm);border-radius:10px;font-size:14px;font-weight:600;color:var(--ink);text-align:center">
    It's all about you and your property — and I will make certain of that.
  </div>
  <div class="page-brand">Mallan Real Estate</div>
</div>

<!-- ══════ 16. AGENCY RELATIONSHIPS ══════ -->
<div class="page">
  <h3>Disclosure</h3>
  <h2>Agency Relationships</h2>
  <div class="gold-line"></div>
  <p class="subtitle">When real estate professionals work with buyers and sellers, "agency" relationships are established. Throughout the transaction you may receive more than one disclosure form. The law requires each agent to present you with this disclosure.</p>
  <div class="card-grid card-grid-2">
    <div class="card"><h4>Seller's Agent</h4><p>When you agree to have me help you sell your property, I become your "seller's agent," which means I will work for <em>your</em> best interests throughout the entire process.</p></div>
    <div class="card"><h4>Buyer's Agent</h4><p>When an offer is presented, the buyers may have a separate agency relationship with their own broker who represents their interests.</p></div>
    <div class="card"><h4>Dual Agency</h4><p>If our firm also represents a buyer interested in your property, dual agency would require consent from both parties with full disclosure.</p></div>
    <div class="card"><h4>Designated Sales</h4><p>With Designated Sales Associates, different agents within the same firm can represent buyer and seller independently with informed consent.</p></div>
  </div>
  <div class="page-brand">Mallan Real Estate</div>
</div>

<!-- ══════ 17. ABOUT / CONTACT ══════ -->
<div class="page">
  <h3>Your Broker</h3>
  <h2>Maya Allan</h2>
  <div class="gold-line"></div>
  <div class="agent-box">
    <h4>Maya Allan</h4>
    <div class="role">Licensed Real Estate Broker — Principal</div>
    <p>
      An experienced real estate professional with deep expertise in New York City residential, investment, and commercial properties. Active member of the Real Estate Board of New York (REBNY) with access to the full REBNY RLS network of 17,000+ agents across 570 brokerage firms.<br><br>
      An active member of the community — Home Community Access, NYU Clean Energy Forum, and mentor to young entrepreneurs. Skilled negotiator and marketer with a commitment to personal service. You work directly with your broker from day one through closing.
    </p>
  </div>

  <div class="cta">
    <div class="headline">Let's get started.</div>
    <div class="details">
      <strong>${esc(d.agentName)}</strong><br>
      Licensed Real Estate Broker — NY DOS #10311201806<br>
      Mallan Real Estate Inc. — NY DOS #10991205323<br>
      646-258-4460 — maya@mallan.nyc — mallan.nyc<br>
      400 East 90th Street, Suite 17C, New York, NY 10128
    </div>
  </div>
  <div class="page-brand">Mallan Real Estate</div>
</div>

<!-- ══════ LEGAL / FAIR HOUSING ══════ -->
<div class="legal">
  <p>This proposal is intended for the exclusive use of the property owner named herein. The market data and pricing estimates are based on currently available information and are subject to change. This is not an appraisal or guarantee of value.</p>
  <p style="margin-top:8px">Mallan Real Estate Inc. is committed to compliance with the Fair Housing Act, the New York State Human Rights Law, and the New York City Human Rights Law (Title 8). We do not discriminate on the basis of race, color, religion, sex, national origin, familial status, disability, sexual orientation, gender identity, marital status, age, lawful source of income, or any other protected class.</p>
  <p style="margin-top:8px">&copy; ${new Date().getFullYear()} Mallan Real Estate Inc. All rights reserved.</p>
</div>

</body>
</html>`;
}
