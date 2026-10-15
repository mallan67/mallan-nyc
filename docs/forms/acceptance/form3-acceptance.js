#!/usr/bin/env node
/**
 * FORM 3 ACCEPTANCE SCRIPT  -  public/crm/SALE-FORM-WITH-TOOLS.html  (served at /crm/sale-view on Vercel)
 *
 * Runs the REAL page in real Chrome (Playwright) against the LOCAL app (default http://localhost:3100, throwaway Postgres).
 * Expected values for the real Cotality listing come from LIVE Cotality data:
 *   - default: the raw records saved by the live queries (live-proof-property-<ID>.json, live-proof-media-<ID>.json,
 *     live-proof-openhouse.json) found in PROOF_DIR;
 *   - COTALITY_LIVE=1 : re-query Cotality now (3 throttled requests) via mallan-ops/tools/mallan-cotality-env.js.
 *
 * Safety: refuses to run unless BASE is localhost/127.0.0.1. Any request to https://mallan.nyc is re-routed to BASE
 * (the page hard-codes that host when its own origin is not mallan.nyc) and counted; the script FAILS if the page
 * sends anything to a non-local application host. Nothing is sent to production. Never restarts the server.
 *
 * Usage (from any directory):
 *   node form3-acceptance.js                       # as shipped
 *   DIAG_PATCH=1 node form3-acceptance.js          # in-memory syntax+race diagnostic patch (shows what is behind the syntax errors)
 *   SELFTEST=1 DIAG_PATCH=1 node form3-acceptance.js   # also injects reference calculators/photo helper to prove the harness itself works
 *   REAL_ID=RLS20113389 MALLAN_ID=SL-0028 PROOF_DIR=<dir> RESULTS=<file.json> node form3-acceptance.js
 *
 * Prerequisites: app running on BASE with seeded sessions audit-broker-token / audit-agent-token / audit-buyer-token;
 * the real listing present in the throwaway DB (loaded with the repo's mapTrestleToPrisma + upsertListingMedia, see
 * form3-owner/ingest-real.ts); the Mallan fixture is created through the real POST /api/crm/listings if MALLAN_ID is not given.
 *
 * Required DOM contract for the fixed page (test hooks) - see dossier section 7:
 *   body[data-viewer-state] = loading | ready | denied | error
 *   #saleViewerDenied (access-denied screen), #saleSourceBadge, #saleAsOf, #saleGallery, #saleGalleryCount, .sale-gallery-img,
 *   #saleFloorPlans .sale-floorplan-img, #saleVideoBlock[data-host], #saleTourBlock[data-host], #saleOpenHouseList .sale-oh-row,
 *   #saleTransitSource, #saleListingAgentName
 * Exit code = number of FAILED tests.
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const BASE = (process.env.BASE || "http://localhost:3100").replace(/\/$/, "");
const REAL_ID = process.env.REAL_ID || "RLS20113389";
let MALLAN_ID = process.env.MALLAN_ID || "";
const PROOF_DIR = process.env.PROOF_DIR || path.join(__dirname, "..", "form3-owner");
const RESULTS = process.env.RESULTS || path.join(__dirname, "form3-acceptance-results.json");
const DIAG = !!process.env.DIAG_PATCH, SELF = !!process.env.SELFTEST;
const PW = process.env.PLAYWRIGHT_CORE || "C:/Users/MayaAllan/Desktop/mallan-nyc/node_modules/playwright-core";
const TOK = { broker: "audit-broker-token", agent: "audit-agent-token", buyer: "audit-buyer-token" };

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) { console.error("REFUSING: BASE must be localhost/127.0.0.1, got " + BASE); process.exit(99); }
const { chromium } = require(PW);

// ---------------------------------------------------------------- expected values (live Cotality) ----------------
async function loadExpected() {
  let prop, media, oh;
  if (process.env.COTALITY_LIVE === "1") {
    const { loadCotalityEnv } = require(process.env.COTALITY_ENV_HELPER || "C:/Users/MayaAllan/mallan-ops/tools/mallan-cotality-env.js");
    const v = (await loadCotalityEnv()).vars; const odata = v.TRESTLE_API_URL.replace(/[/]+$/, ""); const root = odata.replace(/[/]odata.*$/, "");
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const tr = await fetch(root + "/oidc/connect/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "client_credentials", client_id: v.IDX_CLIENT_ID, client_secret: v.IDX_CLIENT_SECRET, scope: "api" }).toString() });
    const H = { Authorization: "Bearer " + (await tr.json()).access_token };
    const g = async q => { await sleep(1100); const r = await fetch(odata + q, { headers: H }); if (r.status !== 200) throw new Error("Cotality " + r.status + " " + q.slice(0, 80)); return (await r.json()).value; };
    prop = (await g("/Property?$filter=" + encodeURIComponent("ListingId eq '" + REAL_ID + "'")))[0];
    media = await g("/Media?$top=100&$orderby=Order&$filter=" + encodeURIComponent("ResourceRecordKey eq '" + prop.ListingKey + "'"));
    oh = await g("/OpenHouse?$top=20&$filter=" + encodeURIComponent("ListingKey eq '" + prop.ListingKey + "'"));
  } else {
    prop = JSON.parse(fs.readFileSync(path.join(PROOF_DIR, `live-proof-property-${REAL_ID}.json`), "utf8")).value[0];
    media = JSON.parse(fs.readFileSync(path.join(PROOF_DIR, `live-proof-media-${REAL_ID}.json`), "utf8")).value;
    try { oh = JSON.parse(fs.readFileSync(path.join(PROOF_DIR, "live-proof-openhouse.json"), "utf8")).forRLS20113389.value; } catch (e) { oh = []; }
  }
  const photos = media.filter(m => m.MediaCategory === "Photo"), plans = media.filter(m => m.MediaCategory === "FloorPlan");
  const onMkt = String(prop.OnMarketDate), today = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const dom = Math.floor((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - Date.parse(onMkt + "T00:00:00Z")) / 86400000);
  const street = [prop.StreetNumber, prop.StreetDirPrefix, prop.StreetName, prop.StreetSuffix, prop.StreetDirSuffix].filter(Boolean).join(" ");
  return { prop, photos, plans, oh, dom, street, header: street + (prop.UnitNumber ? " #" + prop.UnitNumber : "") };
}

// ---------------------------------------------------------------- reference calculators (NYS TP-584-NYC-I 8/25; NYC DOF RPTT) ----------------
const cents = n => Math.round(n * 100) / 100;
const REF = {
  buyerRate(p) { if (p < 1e6) return 0; let s = 0; if (p >= 25e6) s = 0.029; else if (p >= 20e6) s = 0.0275; else if (p >= 15e6) s = 0.025; else if (p >= 10e6) s = 0.0225; else if (p >= 5e6) s = 0.0125; else if (p >= 3e6) s = 0.005; else if (p >= 2e6) s = 0.0025; return 0.01 + s; },
  buyerTax(p) { return cents(p * this.buyerRate(p)); },
  sellerNYS(p) { if (p <= 500) return 0; const u = Math.ceil(p / 500); return cents(2 * u + (p >= 3e6 ? 1.25 * u : 0)); },
  sellerNYC(p) { return p <= 25000 ? 0 : cents(p * (p <= 500000 ? 0.01 : 0.01425)); },
  pmt(loan, ratePct, yrs) { const n = yrs * 12, r = ratePct / 1200; if (loan <= 0) return 0; return r === 0 ? loan / n : loan * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1); },
  roi(price, a, rent, exp, y) { const fv = price * Math.pow(1 + a / 100, y), net = (rent - exp) * y, gain = fv - price + net; return { fv, net, tot: gain / price * 100, ann: (Math.pow((price + gain) / price, 1 / y) - 1) * 100 }; },
  money: n => (n < 0 ? "-" : "") + "$" + Math.round(Math.abs(n)).toLocaleString("en-US"),
};
const num = s => { const m = String(s).replace(/[,\s]/g, "").match(/-?\$?-?\d+(\.\d+)?/); return m ? parseFloat(m[0].replace("$", "")) : NaN; };
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1 : tol);

// ---------------------------------------------------------------- harness ----------------
const results = []; let browser; const prodHits = [], foreignHits = new Set(); let ALIVE = false;
const alive = () => { if (!ALIVE) throw new Error("NOT EVALUABLE: page JavaScript is dead (see T01a), so an absence-of-defect check would be meaningless"); };
function rec(id, name, pass, detail) { results.push({ id, name, pass: !!pass, detail: String(detail == null ? "" : detail).slice(0, 700) }); console.log((pass ? "PASS " : "FAIL ") + id + "  " + name + (pass ? "" : "\n      -> " + String(detail).slice(0, 500))); }
async function T(id, name, fn) { try { const r = await fn(); if (r === true || r === undefined) rec(id, name, true, ""); else if (r && typeof r === "object" && "pass" in r) rec(id, name, r.pass, r.detail); else rec(id, name, false, String(r)); } catch (e) { rec(id, name, false, "THREW: " + (e && e.message || e)); } }

async function newCtx(token, vp, tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f3acc-" + tag + "-"));
  const ctx = await chromium.launchPersistentContext(dir, { channel: "chrome", headless: true, viewport: vp || { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"], acceptDownloads: false });
  ctx.__dir = dir;
  await ctx.clearCookies(); if (token) await ctx.addCookies([{ name: "session_token", value: token, url: BASE }]);
  await ctx.route(/^https?:\/\/(www\.)?mallan\.nyc\//, async route => {   // page hard-codes this host: never let it leave the machine
    const u = new URL(route.request().url()); prodHits.push(route.request().method() + " " + u.pathname);
    const r = await route.fetch({ url: BASE + u.pathname + u.search, headers: { ...route.request().headers(), cookie: "session_token=" + token, host: new URL(BASE).host, origin: BASE } });
    await route.fulfill({ response: r, headers: { ...r.headers(), "access-control-allow-origin": BASE, "access-control-allow-credentials": "true" } });
  });
  const ALLOW = /(^|\.)(localhost|127\.0\.0\.1|tailwindcss\.com|cloudflare\.com|googleapis\.com|gstatic\.com|cotality\.com|r2\.dev|mallan\.nyc|youtube\.com|youtu\.be|ytimg\.com|vimeo\.com|matterport\.com)$/;
  ctx.on("request", rq => { const u = rq.url(); if (!/^https?:\/\//.test(u)) return; const h = new URL(u).hostname; if (!ALLOW.test(h)) foreignHits.add(h); });
  if (DIAG || SELF) {
    const CLOSE = "<" + "/script>", ESC = "<" + String.fromCharCode(92) + "/script>";
    await ctx.route(/\/crm\/SALE-FORM-WITH-TOOLS\.html/, async route => {
      const r = await route.fetch({ headers: { ...route.request().headers(), cookie: "session_token=" + token }, url: route.request().url() });
      let h = (await r.text()).split("\r\n").join("\n");
      h = h.replace("encodeURIComponent(b);}" + CLOSE + "' +", "encodeURIComponent(b);}" + ESC + "' +").split("'/crm/login.html;").join("'/crm/login.html';");
      h = h.replace("if (!d) { showSaleFailClosed(listingId); return null; }", "if (!d) { return null; }");
      await route.fulfill({ status: 200, contentType: "text/html", body: h });
    });
  }
  return ctx;
}
async function closeCtx(ctx) { try { await ctx.unrouteAll({ behavior: "ignoreErrors" }); } catch (e) {} try { await ctx.close(); } catch (e) {} try { fs.rmSync(ctx.__dir, { recursive: true, force: true }); } catch (e) {} }
async function openViewer(ctx, id, wait) {
  const page = await ctx.newPage(); const errs = []; page.__errs = errs;
  page.on("pageerror", e => errs.push("PAGEERROR " + e.message)); page.on("response", r => { if (r.status() >= 400) errs.push("HTTP " + r.status() + " " + r.url().replace(BASE, "").slice(0, 80)); });
  await page.goto(BASE + "/crm/SALE-FORM-WITH-TOOLS.html?id=" + encodeURIComponent(id), { waitUntil: "load", timeout: 45000 });
  try { await page.waitForFunction(() => document.body && document.body.dataset && ["ready", "denied", "error"].includes(document.body.dataset.viewerState), null, { timeout: wait || 15000 }); } catch (e) { page.__noStateHook = true; await page.waitForTimeout(2500); }
  if (SELF) await selfInject(page);
  return page;
}
async function selfInject(page) {   // SELFTEST only: swaps in the REFERENCE calculators so the vector plumbing (UI -> output) is proven; never used to score a real fix
  await page.evaluate(() => {
    const $ = id => document.getElementById(id), n = (id, d) => { const v = parseFloat($(id).value); return isNaN(v) ? d : v; }, money = x => (x < 0 ? "-" : "") + "$" + Math.round(Math.abs(x)).toLocaleString("en-US");
    window.getListingPhotoUrls = window.getListingPhotoUrls || function () { return []; };
    window.updateSaleMortgageCalc = function () { const p = n("saleCalcPrice", 0), d = n("saleCalcDown", 20), r = n("saleCalcRate", 6.75), t = n("saleCalcTerm", 30), loan = p * (1 - d / 100), m = r / 1200, N = t * 12; const pi = loan <= 0 ? 0 : m === 0 ? loan / N : loan * m * Math.pow(1 + m, N) / (Math.pow(1 + m, N) - 1); $("saleCalcLoanAmt").textContent = money(loan); $("saleCalcMonthlyPI").textContent = money(pi); };
    window.updateSaleClosingCosts = function () { const p = n("saleClosingPrice", 0), seller = saleClosingRole === "seller"; let s = 0; if (p >= 25e6) s = .029; else if (p >= 20e6) s = .0275; else if (p >= 15e6) s = .025; else if (p >= 10e6) s = .0225; else if (p >= 5e6) s = .0125; else if (p >= 3e6) s = .005; else if (p >= 2e6) s = .0025; const buyer = p >= 1e6 ? p * (0.01 + s) : 0; const u = Math.ceil(p / 500); const nys = p <= 500 ? 0 : 2 * u + (p >= 3e6 ? 1.25 * u : 0); const nyc = p <= 25000 ? 0 : p * (p <= 500000 ? .01 : .01425); $("saleClosingNYCTax").textContent = money(seller ? nyc : 0); $("saleClosingNYSTax").textContent = money(seller ? nys : 0); $("saleClosingMansion").textContent = money(seller ? 0 : buyer); };
    window.updateSaleROI = function () { const p = n("saleROIPrice", 0), a = n("saleROIAppreciation", 3), rent = n("saleROIRent", 0), ex = n("saleROIExpenses", 0), y = n("saleROIYears", 5), fv = p * Math.pow(1 + a / 100, y), net = (rent - ex) * y, g = fv - p + net; $("saleROIFutureVal").textContent = money(fv); $("saleROINetIncome").textContent = money(net); $("saleROITotal").textContent = (g / p * 100).toFixed(1) + "%"; $("saleROIAnnual").textContent = ((Math.pow((p + g) / p, 1 / y) - 1) * 100).toFixed(1) + "%"; $("saleROIFutureVal").parentElement.firstElementChild.textContent = "Projected Value (" + y + "yr):"; };
    window.updateSaleBuyVsSell = function () { const v = n("saleBvSValue", 0), a = n("saleBvSAppreciation", 3), c = n("saleBvSCarry", 0), y = n("saleBvSYears", 3); $("saleBvSHoldGain").textContent = money(v * Math.pow(1 + a / 100, y) - v - c * 12 * y); };
  });
}
const txt = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; return (/^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName) ? e.value : e.textContent).trim(); }, sel);

// ---------------------------------------------------------------- main ----------------
(async () => {
  const X = await loadExpected();
  const P = X.prop;
  console.log(`Form 3 acceptance | base ${BASE} | real ${REAL_ID} (${P.ListingKey}) | diag=${DIAG} self=${SELF} | live=${process.env.COTALITY_LIVE === "1"}`);

  // Mallan fixture through the REAL create route (throwaway DB only)
  if (!MALLAN_ID) {
    const body = { listing_type: "sale", rls_eligible: false, MlsStatus: "Active", StandardStatus: "Active", PropertyType: "Residential", PropertySubType: "Apartment", CommonInterest: "Condominium", ListPrice: 3250000, BedroomsTotal: 3, BathroomsFull: 2, BathroomsHalf: 1, LivingArea: 1850, RoomsTotal: 6, StreetNumber: "200", StreetName: "West 20th Street", UnitNumber: "7C", City: "New York", CityRegion: "Manhattan", StateOrProvince: "NY", PostalCode: "10011", SubdivisionName: "Chelsea", AssociationFee: 1850, AssociationFeeFrequency: "Monthly", TaxAnnualAmount: 36000, YearBuilt: 2015, StoriesTotal: 22, EntryLevel: "7", PublicRemarks: "Corner three bedroom with open Hudson views. <img src=x onerror=window.__xssRemarks=1> Acceptance fixture.", ListingAgreement: "ExclusiveRightToSell", OnMarketDate: "2026-09-20", ListingContractDate: "2026-09-20", ExpirationDate: "2027-03-20", VirtualTourURLUnbranded: "https://my.matterport.com/show/?m=abcDEF12345", VirtualTourURLBranded: "https://my.matterport.com/show/?m=BRANDED12345" };
    const r = await fetch(BASE + "/api/crm/listings", { method: "POST", headers: { "Content-Type": "application/json", cookie: "session_token=" + TOK.broker }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); MALLAN_ID = j.listing_id || ""; console.log("Mallan fixture:", r.status, MALLAN_ID);
  }
  const chk = await fetch(BASE + "/api/crm/listings/" + REAL_ID, { headers: { cookie: "session_token=" + TOK.broker } });
  if (chk.status !== 200) { console.error(`PRECONDITION: ${REAL_ID} is not in the throwaway DB (GET -> ${chk.status}). Load it with the repo mapper first (form3-owner/ingest-real.ts).`); process.exit(98); }
  const db = await chk.json();

  const brokerCtx = await newCtx(TOK.broker, null, "broker");
  const R = await openViewer(brokerCtx, REAL_ID);

  ALIVE = await R.evaluate(() => typeof loadSaleListingData === "function" && typeof updateSaleMortgageCalc === "function" && typeof openSalePrintModal === "function");
  // ---- T01 page integrity
  await T("T01a", "page JavaScript parses (no PAGEERROR) and core functions exist", async () => {
    const f = await R.evaluate(() => ({ load: typeof loadSaleListingData, calc: typeof updateSaleMortgageCalc, sheet: typeof generateAgentInfoSheet }));
    const bad = R.__errs.filter(e => /PAGEERROR/.test(e));
    return { pass: f.load === "function" && f.calc === "function" && !bad.length, detail: JSON.stringify({ f, bad }) };
  });
  await T("T01b", "no page JavaScript is rendered as visible text", async () => { const t = await R.evaluate(() => document.body.innerText); return { pass: !/function\s+showToast|VIEWER_LISTINGS|MallanAPI\.configure/.test(t), detail: t.slice(0, 200) }; });
  await T("T01c", "no request to a non-local application host; production never reached", async () => ({ pass: foreignHits.size === 0, detail: `rerouted(prod host hard-coded by page): ${prodHits.length} e.g. ${prodHits[0] || "-"} ; foreign: ${[...foreignHits].join(",")}` }));
  await T("T01d", "page makes NO production-host request of its own (same-origin API only)", async () => { alive(); return ({ pass: prodHits.length === 0, detail: `page sent ${prodHits.length} request(s) to https://mallan.nyc (hard-coded baseUrl, lines 130-136): ${prodHits.slice(0, 3).join(" | ")}` }); });
  await T("T01e", "viewer reaches a terminal state (ready) without wiping the page", async () => { const s = await R.evaluate(() => ({ st: document.body.dataset.viewerState || null, wiped: /Listing Not Available/.test(document.body.innerText) })); return { pass: s.st === "ready" && !s.wiped, detail: JSON.stringify(s) + (R.__noStateHook ? " (viewerState hook missing)" : "") }; });

  // ---- T02 Cotality-backed fields for the REAL listing
  const exp = [
    ["#saleAddressDisplay", X.header, "header address = StreetNumber+StreetDirPrefix+StreetName+StreetSuffix + #UnitNumber", "eq"],
    ["#saleStreetAddress", X.street, "Street Address", "eq"],
    ["#saleUnitNumber", P.UnitNumber, "Unit (UnitNumber)", "eq"],
    ["#saleZipCode", P.PostalCode, "Zip (PostalCode)", "eq"],
    ["#saleNeighborhoodFromAddress", P.SubdivisionName, "Neighborhood (SubdivisionName)", "eq"],
    ["#salePrice", String(P.ListPrice), "List price (ListPrice)", "num"],
    ["#saleOriginalPrice", String(P.OriginalListPrice), "Original price (OriginalListPrice)", "num"],
    ["#saleBedrooms", String(P.BedroomsTotal), "Bedrooms (BedroomsTotal)", "num"],
    ["#saleFullBaths", String(P.BathroomsFull), "Full baths (BathroomsFull)", "num"],
    ["#saleHalfBaths", String(P.BathroomsHalf), "Half baths (BathroomsHalf)", "num"],
    ["#saleBathroomsTotal", String(P.BathroomsTotalInteger), "Total baths (BathroomsTotalInteger)", "num"],
    ["#saleTotalRooms", String(P.RoomsTotal), "Rooms (RoomsTotal)", "num"],
    ["#saleFloorInBuilding", String(P.EntryLevel), "Floor (EntryLevel)", "eq"],
    ["#saleBldgYearBuilt", String(P.YearBuilt), "Year built (YearBuilt)", "num"],
    ["#saleBldgTotalFloors", String(P.StoriesTotal), "Stories (StoriesTotal)", "num"],
    ["#saleMaintCC", String(P.AssociationFee), "Maintenance (AssociationFee)", "num"],
  ];
  for (const [sel, want, label, mode] of exp) {
    await T("T02-" + sel.replace(/[^A-Za-z0-9]/g, ""), `${label} shows live Cotality value "${want}"`, async () => {
      const got = await txt(R, sel);
      const ok = got != null && (mode === "num" ? near(num(got), num(want), 0.5) : got.replace(/\s+/g, " ").trim() === String(want));
      return { pass: ok, detail: `got ${JSON.stringify(got)} want ${JSON.stringify(want)}` };
    });
  }
  await T("T02-status", "status badge shows Cotality StandardStatus (Active), not DRAFT", async () => { const t = await txt(R, "#saleDraftBadge"); return { pass: !!t && /Active/i.test(t) && !/draft/i.test(t), detail: t }; });
  await T("T02-updated", "'Updated' shows Cotality ModificationTimestamp date", async () => { const t = await txt(R, "#saleLastUpdated"); const d = new Date(P.ModificationTimestamp); return { pass: !!t && t !== "--" && t.includes(String(d.getUTCFullYear())), detail: `${t} vs ${P.ModificationTimestamp}` }; });
  await T("T02-dom", `Days on market derived from OnMarketDate (${P.OnMarketDate}) = ${X.dom}`, async () => { const t = await txt(R, "#saleDaysOnMarket"); return { pass: num(t) === X.dom, detail: `got ${t} want ${X.dom}` }; });
  await T("T02-desc", "description = PublicRemarks, HTML <br> rendered as line breaks, full length", async () => {
    const v = await txt(R, "#saleDescription"); const want = P.PublicRemarks.replace(/<br\s*\/?>/gi, "\n").replace(/\s+/g, " ").trim();
    const got = (v || "").replace(/\s+/g, " ").trim();
    return { pass: !!v && !/<br/i.test(v) && got.startsWith(want.slice(0, 60)) && got.length >= want.length - 10, detail: `len ${got.length}/${want.length} head=${got.slice(0, 80)}` };
  });
  await T("T02-pdp", "persisted DB row equals live Cotality for ListPrice/Beds/Baths/Agent (mapTrestleToPrisma fidelity)", async () => ({ pass: Number(db.list_price) === P.ListPrice && db.bedrooms_total === P.BedroomsTotal && db.bathrooms_full === P.BathroomsFull && db.list_agent_full_name === P.ListAgentFullName && db.list_office_name === P.ListOfficeName, detail: JSON.stringify({ lp: db.list_price, bd: db.bedrooms_total, fb: db.bathrooms_full, ag: db.list_agent_full_name, of: db.list_office_name }) }));

  // ---- T03 listing agent / attribution (listing agent is NOT the viewer)
  await T("T03a", `listing agent shows ${P.ListAgentFullName} (Cotality), not the logged-in viewer`, async () => { const n = (await txt(R, "#saleListingAgentName")) || (await txt(R, "#saleListingAgentSearch")); return { pass: n === P.ListAgentFullName, detail: `got ${JSON.stringify(n)}` }; });
  await T("T03b", "listing agent MLS id shows ListAgentMlsId", async () => { const n = await txt(R, "#saleListingAgentId"); return { pass: n === String(P.ListAgentMlsId), detail: `got ${n} want ${P.ListAgentMlsId}` }; });
  await T("T03c", `"Listing Courtesy of ${P.ListOfficeName}" is displayed`, async () => { const t = await R.evaluate(() => { const e = document.getElementById("saleCourtesyAttribution"); return e && getComputedStyle(e).display !== "none" ? e.textContent.replace(/\s+/g, " ").trim() : null; }); return { pass: !!t && t.includes("Listing Courtesy of") && t.includes(P.ListOfficeName), detail: t }; });
  await T("T03d", "'Created/Updating agent' header shows the VIEWER only as 'Viewing as', never as the listing agent", async () => { alive(); const ag = await txt(R, "#saleUpdatingAgentDisplay"); const lab = await R.evaluate(() => { const e = document.getElementById("saleUpdatingAgentDisplay"); const l = e && e.closest("div") && e.closest("div").querySelector("label"); return l ? l.textContent.trim() : ""; }); return { pass: !(/Listing Agent/i.test(lab) && /Audit Broker/.test(ag || "")), detail: `label=${lab} value=${ag}` }; });
  await T("T03e", "source badge identifies a Cotality (third-party) listing and its office", async () => { const t = await txt(R, "#saleSourceBadge"); return { pass: !!t && /Cotality|third-party|RLS/i.test(t) && t.includes(P.ListOfficeName), detail: t }; });
  await T("T03f", "no 'Mallan Exclusive' badge is shown on a third-party listing (checked with the public-page preview toggled on, if the page still has one)", async () => { alive(); const v = await R.evaluate(() => { try { showSaleMainTab(5); if (typeof toggleSalePreviewView === "function") toggleSalePreviewView("site"); } catch (e) {} const b = document.getElementById("salePreviewSiteBadge"); if (!b) return false; for (let n = b; n; n = n.parentElement) { const st = getComputedStyle(n); if (st.display === "none" || st.visibility === "hidden" || (n.classList && n.classList.contains("hidden"))) return false; } return true; }); return { pass: v === false, detail: "badge visible=" + v }; });

  // ---- T04 roles
  await T("T04a", "BROKER sees tabs Listing/Unit/Building/Distribution/Preview/History (Commission only if Sold)", async () => { alive(); const v = await R.evaluate(() => [1, 2, 3, 4, 5, 6].map(n => { const s = document.getElementById("sidebarTab" + n); return !!s && !s.classList.contains("viewer-hidden") && getComputedStyle(s).display !== "none"; })); return { pass: v.every(Boolean), detail: JSON.stringify(v) }; });
  await T("T04b", "body has exactly ONE role class (server role), not role-buyer + role-broker", async () => { alive(); const c = await R.evaluate(() => document.body.className); const roles = (c.match(/role-[a-z]+/g) || []); return { pass: roles.length === 1 && roles[0] === "role-broker", detail: c }; });
  const aCtx = await newCtx(TOK.agent, null, "agent"); const A = await openViewer(aCtx, REAL_ID);
  await T("T04c", "AGENT without association to a third-party row gets an explicit access state (not a blank DRAFT skeleton)", async () => { const s = await A.evaluate(() => ({ st: document.body.dataset.viewerState || null, denied: !!document.getElementById("saleViewerDenied"), draft: /\[Enter Address\]/.test(document.body.innerText) })); return { pass: (s.st === "denied" || s.denied) && !s.draft, detail: JSON.stringify(s) }; });
  const bCtx = await newCtx(TOK.buyer, null, "buyer"); const B = await openViewer(bCtx, REAL_ID);
  await T("T04d", "BUYER (non-agent principal) sees NO CRM chrome and an explicit denial", async () => { const s = await B.evaluate(() => ({ st: document.body.dataset.viewerState || null, tools: !!document.querySelector('[onclick*="openSalePrintModal"]') && getComputedStyle(document.querySelector('[onclick*="openSalePrintModal"]')).display !== "none", denied: !!document.getElementById("saleViewerDenied") })); return { pass: s.denied && !s.tools, detail: JSON.stringify(s) }; });
  await closeCtx(aCtx); await closeCtx(bCtx);

  // ---- T05 media: photos, floor plans, video, tour (live Media resource + Property VirtualTourURL*)
  const nPh = X.photos.length, nFp = X.plans.length;
  await T("T05a", `gallery shows ${nPh} photos (live Media rows, category Photo)`, async () => { const n = await R.evaluate(() => document.querySelectorAll("#saleGallery .sale-gallery-img").length); const c = await txt(R, "#saleGalleryCount"); return { pass: n === nPh && num(c) === nPh, detail: `imgs ${n}, count label ${JSON.stringify(c)}, want ${nPh}` }; });
  await T("T05b", "first 3 gallery images actually load (naturalWidth>0) from a same-origin / R2 URL, not a raw rotating locator", async () => { const r = await R.evaluate(() => [...document.querySelectorAll("#saleGallery .sale-gallery-img")].slice(0, 3).map(i => ({ ok: i.complete && i.naturalWidth > 0, src: (i.currentSrc || i.src).slice(0, 80) }))); return { pass: r.length === 3 && r.every(x => x.ok) && r.every(x => !/api\.cotality\.com\/trestle\/Media/.test(x.src)), detail: JSON.stringify(r) }; });
  await T("T05c", `floor plan(s): ${nFp} shown separately from photos`, async () => { const n = await R.evaluate(() => document.querySelectorAll("#saleFloorPlans .sale-floorplan-img").length); return { pass: n === nFp, detail: `got ${n} want ${nFp}` }; });
  const vurl = P.VirtualTourURLUnbranded || P.VirtualTourURLBranded;
  await T("T05d", "video: YouTube link from VirtualTourURL* shown once (Branded==Unbranded de-duplicated) with host label", async () => { const r = await R.evaluate(() => { const v = [...document.querySelectorAll("#saleVideoBlock")]; return { n: v.length, host: v[0] && v[0].dataset.host, html: v[0] ? v[0].outerHTML.slice(0, 300) : "" }; }); const id = (vurl.match(/youtu\.be\/([\w-]+)/) || [])[1]; return { pass: r.n === 1 && /youtu/.test(r.host || "") && r.html.includes(id), detail: JSON.stringify(r) }; });
  await T("T05e", "a listing whose only tour URL is a video shows a video block and NO 3D-tour block", async () => { alive(); const r = await R.evaluate(() => ({ v: document.querySelectorAll("#saleVideoBlock").length, t: document.querySelectorAll("#saleTourBlock").length })); return { pass: r.v === 1 && r.t === 0, detail: JSON.stringify(r) }; });
  await T("T05f", "Preview tab counts are live (Photos N, Video Yes, Floor plan N), not '0 uploaded'", async () => { await R.evaluate(() => showSaleMainTab(5)); await R.waitForTimeout(500); const p = await txt(R, "#salePreviewPhotos"), v = await txt(R, "#salePreviewVideo"); return { pass: num(p) === nPh && /yes/i.test(v || ""), detail: `photos=${p} video=${v}` }; });
  await T("T05g", "embedded video/tour iframes are not blocked by the page CSP (frame-src present) OR shown as safe external links", async () => { const csp = (await (await fetch(BASE + "/crm/SALE-FORM-WITH-TOOLS.html")).headers.get("content-security-policy")) || ""; const hasFrame = /frame-src[^;]*(youtube|vimeo|matterport)/.test(csp); const link = await R.evaluate(() => !!document.querySelector('#saleVideoBlock a[rel~="noopener"]')); return { pass: hasFrame || link, detail: "frame-src present=" + hasFrame + " safe link=" + link }; });

  // ---- T06 open houses (live Cotality OpenHouse resource)
  await T("T06", `Open Houses tab lists the ${X.oh.length} live Cotality open house(s) for this listing`, async () => { await R.evaluate(() => { showSaleMainTab(1); showSaleSubTab(1, 4); }); await R.waitForTimeout(400); const rows = await R.evaluate(() => [...document.querySelectorAll("#saleOpenHouseList .sale-oh-row")].map(e => e.textContent.replace(/\s+/g, " ").trim())); const ok = rows.length === X.oh.length && X.oh.every(o => rows.some(r => r.includes(new Date(o.OpenHouseDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })))); return { pass: ok, detail: JSON.stringify(rows) }; });

  // ---- T07 fields that do not exist in Cotality must not render as empty controls on a Cotality listing
  const RENDERED = `function rendered(e) { for (let n = e; n; n = n.parentElement) { if (n.classList && (n.classList.contains("sale-main-tab") || n.classList.contains("sale-sub-tab") || n.classList.contains("sale-bldg-main-tab-content") || n.classList.contains("sale-bldg-sub-tab-content"))) return true; const st = getComputedStyle(n); if (st.display === "none" || st.visibility === "hidden" || (n.classList && n.classList.contains("viewer-hidden"))) return false; } return true; }`;
  await T("T07", "the 15 field names absent from live Cotality Property are hidden (not blank) for a Cotality listing", async () => {
    alive();
    const ids = ["salePercentCommon", "saleTaxDeduction", "saleFlipTaxAmount", "saleGuarantors", "saleTHCommercialYN", "saleTHLandmark", "saleBldgLandmark", "saleBldgSponsorUnits", "saleAttendanceType", "saleBldgNumElevators", "saleBldgCapitalReserves", "saleBldgCapitalReservesYN", "saleBldgTaxLot", "saleBldgTaxAbatementYN", "saleBldgTaxAbatementComments", "saleBldgMaxFinancing"];
    const vis = await R.evaluate(([src, ids]) => { eval(src); return ids.filter(id => { const e = document.getElementById(id) || document.querySelector('[name="' + id + '"]'); return e && rendered(e); }); }, [RENDERED, ids]);
    return { pass: vis.length === 0, detail: "still rendered: " + vis.join(",") };
  });
  await T("T07b", "no empty placeholder inputs rendered anywhere in Tab 1 sub-tabs 1.1-1.3 on a loaded Cotality listing", async () => {
    alive();
    const n = await R.evaluate(src => { eval(src); return [...document.querySelectorAll("#saleMainTab1 input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), #saleMainTab1 textarea")].filter(e => !e.value && rendered(e)).map(e => e.id || e.name || e.placeholder).slice(0, 40); }, RENDERED);
    return { pass: n.length === 0, detail: n.length + " empty rendered inputs: " + n.join(",") };
  });

  // ---- T08 print
  await T("T08a", "Print: executeSalePrint opens a report with address, price, photos, courtesy, as-of = Cotality timestamp", async () => {
    const [pop] = await Promise.all([brokerCtx.waitForEvent("page", { timeout: 8000 }).catch(() => null), R.evaluate(() => { try { openSalePrintModal(); executeSalePrint(); } catch (e) { window.__printErr = String(e); } })]);
    const err = await R.evaluate(() => window.__printErr || null); if (!pop) return { pass: false, detail: "no print window; error=" + err };
    await pop.waitForLoadState("load"); await pop.waitForTimeout(800);
    const t = (await pop.evaluate(() => document.body.innerText)).replace(/\s+/g, " "); const imgs = await pop.evaluate(() => [...document.images].map(i => ({ ok: i.complete && i.naturalWidth > 0, src: i.src.slice(0, 60) })));
    global.__printText = t; global.__printImgs = imgs; await pop.close();
    const asOf = new Date(P.ModificationTimestamp).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "America/New_York" });
    const checks = { address: t.includes(X.street), price: t.includes("9,995,000"), courtesy: t.includes("Listing Courtesy of " + P.ListOfficeName), asOf: t.includes(asOf), photos: imgs.length >= 1 && imgs.every(i => i.ok), noPreparedBy1: !/Prepared by 1\b/.test(t) };
    return { pass: Object.values(checks).every(Boolean), detail: JSON.stringify(checks) + " err=" + err };
  });
  await T("T08b", "Print contains NO source-agent email / direct phone, NO commission, NO internal notes", async () => { const t = global.__printText || ""; const bad = [P.ListAgentEmail, P.ListAgentDirectPhone, "Exclusive Commission", "Administrative Comments"].filter(s => s && t.includes(s)); return { pass: !!t && bad.length === 0, detail: t ? "leaked: " + bad.join(",") : "no print text" }; });
  await T("T08c", "Print uses the current public disclaimer wording and no legacy 'REBNY Listing Service' copyright block", async () => { const t = global.__printText || ""; return { pass: !!t && /Residential Listing Service/.test(t) && !/Listing data provided by the REBNY Listing Service/.test(t), detail: t.slice(-300) }; });
  await T("T08d", "Print photo URLs are absolute (work inside a blob: window)", async () => { const i = global.__printImgs || []; return { pass: i.length > 0 && i.every(x => /^https?:\/\//.test(x.src)), detail: JSON.stringify(i.slice(0, 3)) }; });

  // ---- T09 email
  await T("T09a", "Email modal: subject has address and price; card has photo, courtesy line, creator name (not id)", async () => {
    await R.evaluate(() => { try { openSaleEmailModal(); } catch (e) { window.__emErr = String(e); } }); await R.waitForTimeout(600);
    const e = await R.evaluate(() => ({ subj: document.getElementById("saleEmailSubject").value, card: document.getElementById("saleEmailCardPreview").innerText.replace(/\s+/g, " "), img: !!document.querySelector("#saleEmailCardPreview img"), err: window.__emErr || null }));
    global.__email = e; const c = { subject: e.subj.includes(X.street) && e.subj.includes("9,995,000"), photo: e.img, courtesy: e.card.includes("Listing Courtesy of " + P.ListOfficeName), creator: /Audit Broker/.test(e.card) && !/\b1 Licensed/.test(e.card) };
    return { pass: Object.values(c).every(Boolean) && !e.err, detail: JSON.stringify(c) + " subj=" + e.subj + " err=" + e.err };
  });
  await T("T09b", "Email 'Copy to clipboard' puts HTML+text with courtesy line on the clipboard", async () => {
    const r = await R.evaluate(async () => { try { copySaleEmailToClipboard(); await new Promise(r => setTimeout(r, 800)); const items = await navigator.clipboard.read(); const out = {}; for (const it of items) for (const t of it.types) out[t] = (await (await it.getType(t)).text()).replace(/\s+/g, " ").slice(0, 2000); return out; } catch (e) { return { err: String(e) }; } });
    const all = JSON.stringify(r); return { pass: !r.err && /Listing Courtesy of/.test(all), detail: all.slice(0, 300) };
  });
  await T("T09c", "Email/print/agent-sheet builders escape listing text (no script runs from Cotality/agent-authored remarks)", async () => { alive();
    const M = await openViewer(brokerCtx, MALLAN_ID);
    const r = await M.evaluate(() => { document.getElementById("saleDescription").value = '<img src=x onerror="window.__x1=1">hello'; const s = document.getElementById("saleStreetAddress"); if (s) s.value = '1 Main <img src=x onerror="window.__x2=1">'; try { openSaleEmailModal(); } catch (e) {} return true; });
    await M.waitForTimeout(700); const ran = await M.evaluate(() => (document.getElementById("saleEmailCardPreview") || {}).innerHTML ? document.getElementById("saleEmailCardPreview").innerHTML.length : 0);
    if (!ran) { await M.close(); throw new Error("NOT EVALUABLE: the email card builder did not run (see T09a)"); }
    const f = await M.evaluate(() => ({ x1: window.__x1 || 0, x2: window.__x2 || 0, remarks: window.__xssRemarks || 0 }));
    await M.close(); return { pass: !f.x1 && !f.x2 && !f.remarks, detail: JSON.stringify(f) };
  });

  // ---- T10 agent info sheet
  await T("T10", "Agent Sheet: 'Prepared by' = viewer with phone/license/email; listing block shows the real listing agent/office; no '--, --'", async () => {
    const [pop] = await Promise.all([brokerCtx.waitForEvent("page", { timeout: 8000 }).catch(() => null), R.evaluate(() => { try { generateAgentInfoSheet(); } catch (e) { window.__shErr = String(e); } })]);
    if (!pop) return { pass: false, detail: "no popup; err=" + await R.evaluate(() => window.__shErr || null) };
    await pop.waitForTimeout(500); const t = (await pop.evaluate(() => document.body.innerText)).replace(/\s+/g, " "); await pop.close();
    const c = { street: t.includes(X.street), listingAgent: t.includes(P.ListAgentFullName), courtesy: t.includes(P.ListOfficeName), noDashes: !/Current Listing\s*--/.test(t) && !/PHONE\s*--/.test(t), asOf: !/Data last updated\s+\w+\s+\d+,\s+2026\b/.test(t) || t.includes(new Date(P.ModificationTimestamp).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "America/New_York" })) };
    return { pass: Object.values(c).every(Boolean), detail: JSON.stringify(c) + " :: " + t.slice(0, 260) };
  });

  // ---- T11 calculators (vectors from REF; sources in dossier section 4)
  async function calcOpen(page) { await page.evaluate(() => openSaleFinancialCalc()); await page.waitForTimeout(300); }
  async function setv(page, id, v) { await page.evaluate(([i, val]) => { const e = document.getElementById(i); e.value = val; e.dispatchEvent(new Event("input", { bubbles: true })); }, [id, String(v)]); }
  await T("T11-open", "calculator modal opens", async () => { await calcOpen(R); return true; });
  await T("T11a", "calculators auto-populate from THIS listing when opened via ?id= (price, monthly maintenance, tax)", async () => { const p = await txt(R, "#saleCalcPrice"); const m = await txt(R, "#saleCalcMonthlyMaint"); return { pass: num(p) === P.ListPrice && num(m) === P.AssociationFee, detail: `price=${p} maint=${m} want ${P.ListPrice}/${P.AssociationFee}` }; });
  await T("T11b", "mortgage P&I: 1,000,000 / 20% / 6.75% / 30y = " + REF.money(REF.pmt(800000, 6.75, 30)), async () => { await R.evaluate(() => switchSaleCalcTab(1)); await setv(R, "saleCalcPrice", 1000000); await setv(R, "saleCalcDown", 20); await setv(R, "saleCalcRate", 6.75); await R.selectOption("#saleCalcTerm", "30"); const g = await txt(R, "#saleCalcMonthlyPI"); return { pass: near(num(g), REF.pmt(800000, 6.75, 30), 1), detail: g }; });
  await T("T11c", "mortgage: 0% down is honored (loan = price)", async () => { await setv(R, "saleCalcDown", 0); const g = await txt(R, "#saleCalcLoanAmt"); return { pass: num(g) === 1000000, detail: `loan ${g} want $1,000,000` }; });
  await T("T11d", "mortgage: 0% rate is honored (P&I = loan/term months)", async () => { await setv(R, "saleCalcDown", 20); await setv(R, "saleCalcRate", 0); const g = await txt(R, "#saleCalcMonthlyPI"); return { pass: near(num(g), 800000 / 360, 1), detail: `P&I ${g} want ${REF.money(800000 / 360)}` }; });
  const buyerVec = [999999, 1000000, 1999999, 2000000, 2999999, 3000000, 4999999, 5000000, 9995000, 10000000, 15000000, 20000000, 25000000];
  try { await R.evaluate(() => switchSaleCalcTab(2)); } catch (e) {}
  for (const p of buyerVec) await T("T11e-" + p, `buyer mansion+NYC supplemental @ $${p.toLocaleString()} = ${REF.money(REF.buyerTax(p))} (${(REF.buyerRate(p) * 100).toFixed(2)}%)`, async () => { await R.evaluate(() => switchSaleClosingRole("buyer")); await setv(R, "saleClosingPrice", p); const g = await txt(R, "#saleClosingMansion"); return { pass: near(num(g), REF.buyerTax(p), 1), detail: g }; });
  for (const p of [500000, 500001, 1000000, 2999999, 3000000, 9995000]) await T("T11f-" + p, `seller NYC RPTT @ $${p.toLocaleString()} = ${REF.money(REF.sellerNYC(p))}; NYS(+NYC addl base at >= $3M) = ${REF.money(REF.sellerNYS(p))}`, async () => { await R.evaluate(() => switchSaleClosingRole("seller")); await setv(R, "saleClosingPrice", p); const c = await txt(R, "#saleClosingNYCTax"), s = await txt(R, "#saleClosingNYSTax"); return { pass: near(num(c), REF.sellerNYC(p), 1) && near(num(s), REF.sellerNYS(p), 1), detail: `NYC ${c} NYS ${s}` }; });
  await T("T11g", "closing-cost lines that are NOT law (attorney/title) are labelled as estimates and editable inputs", async () => { const r = await R.evaluate(() => ({ att: document.querySelector("#saleClosingAttorney") && document.querySelector("#saleClosingAttorney").parentElement.textContent, title: document.querySelector("#saleClosingTitle") && document.querySelector("#saleClosingTitle").parentElement.textContent, inputs: !!document.querySelector("#saleClosingAttorneyInput") && !!document.querySelector("#saleClosingTitleInput") })); return { pass: /est/i.test(r.att || "") && /est/i.test(r.title || "") && r.inputs, detail: JSON.stringify(r) }; });
  await T("T11h", "ROI: 1,000,000 @4% for 10y, rent 60k, exp 20k => FV 1,480,244; net 400,000; total 88.0%; annualized 6.5% (label shows 10yr, not '5yr')", async () => { await R.evaluate(() => switchSaleCalcTab(4)); await setv(R, "saleROIPrice", 1000000); await setv(R, "saleROIAppreciation", 4); await setv(R, "saleROIRent", 60000); await setv(R, "saleROIExpenses", 20000); await setv(R, "saleROIYears", 10); const g = k => txt(R, k); const [fv, net, tot, ann] = [await g("#saleROIFutureVal"), await g("#saleROINetIncome"), await g("#saleROITotal"), await g("#saleROIAnnual")]; const lab = await R.evaluate(() => document.querySelector("#saleROIFutureVal").parentElement.textContent); const r = REF.roi(1e6, 4, 6e4, 2e4, 10); return { pass: near(num(fv), r.fv, 1) && near(num(net), r.net, 1) && near(num(tot), r.tot, 0.06) && near(num(ann), r.ann, 0.06) && /10/.test(lab) && !/5yr/.test(lab), detail: `${fv} ${net} ${tot} ${ann} label=${lab}` }; });
  await T("T11i", "ROI: 0% appreciation is honored (FV = price)", async () => { await setv(R, "saleROIAppreciation", 0); const fv = await txt(R, "#saleROIFutureVal"); return { pass: near(num(fv), 1000000, 1), detail: fv }; });
  await T("T11j", "cash-on-cash: NOI 30,000 / cash 400,000 = 7.50%", async () => { await R.evaluate(() => switchSaleCalcTab(3)); await setv(R, "saleCoCNOI", 30000); await setv(R, "saleCoCCash", 400000); const g = await txt(R, "#saleCoCResult"); return { pass: near(num(g), 7.5, 0.005), detail: g }; });
  await T("T11k", "buy-vs-sell: 0% appreciation honored (hold net change = V(1+a)^N(1-c) - V - carry = -$180,000 with c=0); negative amounts format -$180,000, never $-180,000", async () => { await R.evaluate(() => switchSaleCalcTab(6)); await setv(R, "saleBvSValue", 1000000); await setv(R, "saleBvSAppreciation", 0); await setv(R, "saleBvSCarry", 5000); await setv(R, "saleBvSYears", 3); if (await R.evaluate(() => !!document.getElementById("saleBvSSellCost"))) await setv(R, "saleBvSSellCost", 0); const g = await txt(R, "#saleBvSHoldGain"); return { pass: !/\$-/.test(g) && near(num(g), -180000, 1), detail: g }; });
  await T("T11l", "rent-vs-buy uses purchase price / P&I (changing price or rate changes the comparison)", async () => { await R.evaluate(() => switchSaleCalcTab(5)); await setv(R, "saleRvBRent", 8000); await setv(R, "saleRvBYears", 7); await setv(R, "saleRvBPrice", 1000000); const a = await txt(R, "#saleRvBTotalOwn"); await setv(R, "saleRvBPrice", 2000000); const b = await txt(R, "#saleRvBTotalOwn"); return { pass: a !== b, detail: `own@1M=${a} own@2M=${b}` }; });
  try { await R.evaluate(() => closeSaleFinancialCalc()); } catch (e) {}

  // ---- T12 transit (Cotality Latitude/Longitude are null in the feed -> Mallan geocode; label approximate)
  await T("T12a", "transit for a downtown listing (Chelsea 10011) shows its real nearby stations (200 W 20th St: 18th St / 23rd St), not Upper East Side defaults or a far Union Sq default", async () => { const M = await openViewer(brokerCtx, MALLAN_ID); await M.evaluate(() => showSaleMainTab(5)); await M.waitForTimeout(900); const t = await txt(M, "#saleTransitResults"); const src = await txt(M, "#saleTransitSource"); await M.close(); global.__transitSrc = src; return { pass: !/86th St|96th St|77th St|68th St/.test(t) && /(18th St|23rd St)/.test(t), detail: t.replace(/\s+/g, " ").slice(0, 200) }; });
  await T("T12b", "transit states its source and whether the location is exact or a ZIP-centroid approximation", async () => ({ pass: !!global.__transitSrc && /(exact|approx|centroid|geocod)/i.test(global.__transitSrc), detail: String(global.__transitSrc) }));

  // ---- T13 history / preview honesty
  await T("T13a", "Update History is not a hard-coded 'No results found' when price/status data exists", async () => { await R.evaluate(() => showSaleMainTab(6)); await R.waitForTimeout(300); const t = await R.evaluate(() => document.getElementById("saleMainTab6").innerText); return { pass: !/No results found for this Listing/.test(t), detail: t.replace(/\s+/g, " ").slice(0, 160) }; });
  await T("T13b", "Preview contains no mock public-site chrome (fake 'Send Inquiry' form, 'Contact Agent', browser frame)", async () => { await R.evaluate(() => { showSaleMainTab(5); toggleSalePreviewView("site"); }); const t = await R.evaluate(() => document.getElementById("saleMainTab5").innerText); return { pass: !/Send Inquiry|Request Information|Contact Agent/.test(t), detail: "found: " + (t.match(/Send Inquiry|Request Information|Contact Agent/g) || []).join(",") }; });

  // ---- T14 responsive
  for (const [w, h, n] of [[1440, 900, "desktop"], [820, 1180, "tablet"], [390, 844, "mobile"]]) await T("T14-" + n, `no horizontal page overflow at ${w}x${h}`, async () => { const c = await newCtx(TOK.broker, { width: w, height: h }, n); const p = await openViewer(c, REAL_ID); const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })); await closeCtx(c); return { pass: o.sw <= o.iw + 1, detail: JSON.stringify(o) }; });

  await closeCtx(brokerCtx);
  const failed = results.filter(r => !r.pass);
  const summary = { when: new Date().toISOString(), base: BASE, realId: REAL_ID, mallanId: MALLAN_ID, diag: DIAG, selftest: SELF, live: process.env.COTALITY_LIVE === "1", total: results.length, passed: results.length - failed.length, failed: failed.length, prodHostRequestsFromPage: prodHits.length, foreignHosts: [...foreignHits], results };
  fs.writeFileSync(RESULTS, JSON.stringify(summary, null, 1));
  console.log(`\nSUMMARY: ${summary.passed}/${summary.total} passed, ${summary.failed} failed  -> ${RESULTS}`);
  process.exit(Math.min(failed.length, 250));
})().catch(e => { console.error("FATAL", e); process.exit(97); });
