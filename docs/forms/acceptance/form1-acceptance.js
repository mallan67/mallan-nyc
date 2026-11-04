#!/usr/bin/env node
/**
 * FORM 1 ACCEPTANCE SCRIPT  -  public/crm/SALE-FORM-REDESIGN.html
 *
 * Drives the REAL page in real Chrome (Playwright) against the LOCAL app (http://localhost:3100, throwaway Postgres):
 *   create a sale -> Save Draft -> close -> reopen -> edit -> save -> reopen -> publish -> public page -> psql read-back.
 * The Cotality-sourced parts use a REAL LIVE Cotality listing (queried now, throttled, ~14 provider requests):
 *   the building/unit address is typed into the form and the form's own Cotality building lookup must fill the building facts,
 *   which are compared with the live Property record; every picklist value the form emits is checked against the LIVE Lookup/metadata.
 *
 * Usage:  node form1-acceptance.js
 * Env:    BASE (default http://localhost:3100, must be localhost), TOKEN (session_token of a BROKER; default audit-broker-token),
 *         AGENT_TOKEN (default audit-agent-token = an AGENT with no association), REAL_ID (live ListingId; default: first live Active
 *         Residential Condominium with >=10 photos), LISTING_TYPE (default ExclusiveRightToSell; InHouseWebOnly = website-only),
 *         PSQL (default C:/Program Files/PostgreSQL/18/bin/psql.exe; DB 127.0.0.1:55432/t), OUT (results json path).
 * Exit code = number of FAILED checks. Prints PASS/FAIL per check with the observed value.
 * Safety: refuses non-local BASE; never restarts anything; never calls reset-sync; only writes the throwaway DB through the real UI/API.
 * Written against main 71381e1c behavior: on that revision the checks marked [EXPECTED-FAIL-TODAY] fail; they are the fix list.
 */
"use strict";
const fs = require("fs"), path = require("path"), os = require("os"), { execFileSync } = require("child_process");
const BASE = (process.env.BASE || "http://localhost:3100").replace(/\/$/, "");
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) { console.error("REFUSING: BASE must be localhost"); process.exit(99); }
const TOKEN = process.env.TOKEN || "audit-broker-token", AGENT_TOKEN = process.env.AGENT_TOKEN || "audit-agent-token";
const LT = process.env.LISTING_TYPE || "ExclusiveRightToSell";
const PSQL = process.env.PSQL || "C:/Program Files/PostgreSQL/18/bin/psql.exe";
const OUT = process.env.OUT || path.join(__dirname, "form1-acceptance-results.json");
const PW = process.env.PLAYWRIGHT_CORE || "C:/Users/MayaAllan/Desktop/mallan-nyc/node_modules/playwright-core";
const ENVH = process.env.COTALITY_ENV_HELPER || "C:/Users/MayaAllan/mallan-ops/tools/mallan-cotality-env.js";
const { chromium } = require(PW);
const FORM = BASE + "/crm/SALE-FORM-REDESIGN.html";
const results = []; let fails = 0;
const check = (name, ok, observed, todo) => { results.push({ name, ok: !!ok, observed: String(observed === undefined ? "" : observed).slice(0, 400), todo: !!todo }); if (!ok) fails++; console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : (todo ? "  [EXPECTED-FAIL-TODAY]" : "")) + "  :: " + String(observed === undefined ? "" : observed).slice(0, 300)); };
const sql = q => execFileSync(PSQL, ["-h", "127.0.0.1", "-p", "55432", "-U", "postgres", "-d", "t", "-At", "-c", q], { encoding: "utf8", maxBuffer: 1 << 26 }).trim();
const row = id => JSON.parse(sql("select row_to_json(l) from listings l where id=" + id) || "null");
const norm = s => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, "");

// ------------------------------------------------------------------ live Cotality (throttled) ------------------
let H, odata, last = 0, provReq = 0;
async function cInit() {
  const { loadCotalityEnv } = require(ENVH); const v = (await loadCotalityEnv()).vars; odata = v.TRESTLE_API_URL.replace(/[/]+$/, ""); const root = odata.replace(/[/]odata.*$/, ""); if (!/[/]odata$/.test(odata)) odata = root + "/odata";
  const tr = await fetch(root + "/oidc/connect/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "client_credentials", client_id: v.IDX_CLIENT_ID, client_secret: v.IDX_CLIENT_SECRET, scope: "api" }).toString() }); provReq++;
  H = { Authorization: "Bearer " + (await tr.json()).access_token };
}
async function cGet(p) { const w = 1100 - (Date.now() - last); if (w > 0) await new Promise(r => setTimeout(r, w)); last = Date.now(); provReq++; const r = await fetch(odata + p, { headers: H }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { status: r.status, json: j }; }

// ------------------------------------------------------------------ page helpers ---------------------------------
const SKIP = "saleComm|saleAuction|saleTH|saleOffice|saleBusinessType|saleStreetAddress|saleUnitNumber|saleBuildingSearch|saleBorough|saleZipCode|salePostalCity|saleNeighborhoodFromAddress|saleCountyOrParish|saleBldg|saleStructureType|saleMaintCC$|saleBuildingPetsAllowed|salePetsAllowed|saleBuildingLaundry|saleNewOH|Search$|commSale";
async function open(ctx, url) {
  const page = await ctx.newPage(); const log = { req: [], dialogs: [], toasts: [], console: [] };
  page.on("dialog", d => { log.dialogs.push(d.message().slice(0, 500)); d.accept().catch(() => {}); });
  page.on("pageerror", e => log.console.push("PAGEERROR " + e.message.slice(0, 200)));
  page.on("response", async r => { const u = r.url(); if (u.startsWith(BASE + "/api/") && r.request().method() !== "GET") { let t = ""; try { t = (await r.text()).slice(0, 4000); } catch {} log.req.push({ m: r.request().method(), u: u.replace(BASE, ""), s: r.status(), body: r.request().postData() || "", res: t }); } });
  await page.goto(url, { waitUntil: "load" }); await page.waitForTimeout(3500);
  await page.evaluate(() => { window.__t = []; const o = window.showToast; window.showToast = function (m, t) { window.__t.push((t || "info") + ": " + m); return o.apply(this, arguments); }; window.alert = function (m) { window.__t.push("ALERT: " + m); }; });
  return { page, log };
}
const toasts = page => page.evaluate(() => (window.__t || []).splice(0));
async function setVals(page, vals) { await page.evaluate(vals => { for (const [id, v] of Object.entries(vals)) { const e = document.getElementById(id); if (!e) continue; if (e.type === "checkbox") e.checked = !!v; else e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); } }, vals); }
async function genericFill(page) { // fill every NON-skipped control so the round trip covers the whole form; returns control->value map (real inputs only)
  await page.evaluate(([lt]) => { const c = (n, v) => { const r = document.querySelector('input[name="' + n + '"][value="' + v + '"]'); if (r) { r.checked = true; r.dispatchEvent(new Event("change", { bubbles: true })); } }; c("saleListingType", lt); c("salePropertyType", "Condo"); }, [LT]);
  await page.waitForTimeout(400);
  for (let pass = 0; pass < 2; pass++) await page.evaluate(skip => { const re = new RegExp(skip); const seen = {};
    document.querySelectorAll("input, select, textarea").forEach((f, i) => { const key = f.id || f.name; if (!key || re.test(key) || f.type === "file" || f.type === "hidden" || f.disabled || f.readOnly || f.name === "saleListingType" || f.name === "salePropertyType") return;
      const fire = () => { f.dispatchEvent(new Event("input", { bubbles: true })); f.dispatchEvent(new Event("change", { bubbles: true })); };
      if (f.tagName === "SELECT") { const o = Array.from(f.options).filter(o => o.value && !o.disabled && !/^──/.test(o.value)); if (o.length) { f.value = o[Math.min(1, o.length - 1)].value; fire(); } }
      else if (f.type === "checkbox") { f.checked = true; fire(); } else if (f.type === "radio") { if (seen[f.name]) return; seen[f.name] = 1; f.checked = true; fire(); }
      else if (f.type === "number") { f.value = String(1000 + i); fire(); } else if (f.type === "date") { f.value = new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10); fire(); }
      else if (f.type === "datetime-local") { f.value = "2027-02-03T10:30"; fire(); } else if (f.type === "time") { f.value = "10:30"; fire(); }
      else if (f.type === "url") { f.value = "https://example.com/acc" + i; fire(); } else if (f.type === "email") { f.value = "acc" + i + "@example.test"; fire(); } else if (f.type === "tel") { f.value = "21255501" + String(10 + (i % 90)); fire(); }
      else { f.value = "ACC" + i + "_" + key.replace(/[^A-Za-z0-9]/g, "").slice(0, 16); fire(); } }); }, SKIP);
}
const readState = page => page.evaluate(() => { const o = {}; document.querySelectorAll("input, select, textarea").forEach((f, i) => { const k = f.id || f.name || ("idx" + i); if (f.type === "file" || f.type === "hidden") return; if (f.type === "checkbox") o[k + ":" + f.value] = f.checked; else if (f.type === "radio") { if (f.checked) o[f.name] = f.value; } else o[k] = f.value; }); return o; });
function diffState(a, b) { const lost = []; for (const [k, v] of Object.entries(a)) { if (v === "" || v === false || v == null) continue; if (!(k in b)) { lost.push(k + " (control gone)"); continue; } if (String(b[k]) !== String(v) && !/saleCreateDate|saleLastUpdatedDate|SearchSearch|Search$/.test(k)) lost.push(k + ": " + String(v).slice(0, 25) + " -> " + JSON.stringify(b[k]).slice(0, 25)); } return lost; }
const clickBtn = (page, re) => page.evaluate(src => { const b = Array.from(document.querySelectorAll("button")).find(b => new RegExp(src).test(b.getAttribute("onclick") || "")); if (b) b.click(); return !!b; }, re);

(async () => {
  console.log("FORM 1 acceptance: BASE=" + BASE + " LISTING_TYPE=" + LT);
  // ============ S1 live Cotality =============================================================================
  await cInit();
  const flt = process.env.REAL_ID ? "ListingId eq '" + process.env.REAL_ID + "'" : "StandardStatus eq 'Active' and PropertyType eq 'Residential' and CommonInterest eq 'Condominium' and PhotosCount gt 9 and VideosCount gt 0";
  const pr = await cGet("/Property?$top=1&$filter=" + encodeURIComponent(flt));
  const live = (pr.json.value || [])[0];
  check("S1 live Cotality listing fetched (Property)", pr.status === 200 && live, "status " + pr.status + " ListingKey " + (live && live.ListingKey) + " " + (live && live.ListingId) + " filter: " + flt);
  if (!live) { console.log("NO LIVE PROOF"); process.exit(98); }
  // live picklists: ONE $metadata request; every Lookup/enum value set is read from the live EnumType members (identical to the Lookup resource values, verified 2026-10-15)
  const mx = await (async () => { const w = 1100 - (Date.now() - last); if (w > 0) await new Promise(r => setTimeout(r, w)); last = Date.now(); provReq++; const r = await fetch(odata + "/$metadata", { headers: H }); return { status: r.status, text: await r.text() }; })();
  const lk = {}; { const re = new RegExp('<EnumType Name="([^"]+)"[^>]*>([^]*?)</EnumType>', "g"); let m; while ((m = re.exec(mx.text))) lk[m[1]] = new Set([...m[2].matchAll(/<Member Name="([^"]+)"/g)].map(x => x[1])); }
  check("S1 live metadata enums read (StandardStatus, MediaCategory, StructureType ...)", mx.status === 200 && lk.StandardStatus && lk.StandardStatus.size > 3 && lk.MediaCategory && lk.MediaCategory.has("Photo"), "status " + mx.status + " StandardStatus=" + [...(lk.StandardStatus || [])].join("|"));
  const mr = await cGet("/Media?$top=100&$filter=" + encodeURIComponent("ResourceRecordKey eq '" + live.ListingKey + "'") + "&$select=MediaCategory,Order,MediaType");
  const liveMedia = (mr.json.value || []); const liveCats = {}; liveMedia.forEach(m => liveCats[m.MediaCategory] = (liveCats[m.MediaCategory] || 0) + 1);
  check("S1 live Media categories for the listing (informational)", mr.status === 200, JSON.stringify(liveCats) + " PhotosCount=" + live.PhotosCount + " VideosCount=" + live.VideosCount + " Unbranded=" + live.VirtualTourURLUnbranded);

  // ============ S2 open form, type the REAL address, building autofill ======================================
  const browser = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "f1acc-")), { channel: "chrome", headless: true, viewport: { width: 1440, height: 900 } });
  await browser.addCookies([{ name: "session_token", value: TOKEN, url: BASE }]);
  const meR = await (await fetch(BASE + "/api/auth/me", { headers: { Cookie: "session_token=" + TOKEN } })).json(); const me = meR.user || {};
  check("S0 broker session valid", meR.authenticated && meR.role === "BROKER", JSON.stringify({ id: me.id, mlsId: me.mlsId, role: meR.role }));
  let { page, log } = await open(browser, FORM);
  const street = [live.StreetNumber, live.StreetDirPrefix, live.StreetName, live.StreetSuffix].filter(Boolean).join(" ");
  await page.fill("#saleStreetAddress", street); await page.fill("#saleUnitNumber", live.UnitNumber || ""); await page.locator("#saleStreetAddress").blur(); await page.waitForTimeout(6000);
  const af = await readState(page);
  const bs = await (await fetch(BASE + "/api/buildings/search?q=" + encodeURIComponent(street), { headers: { Cookie: "session_token=" + TOKEN } })).json(); const b0 = (bs.buildings || [])[0] || {};
  check("S2 building lookup is served from live Cotality, not from Mallan draft rows", b0.source === "cotality", "source=" + b0.source + " year_built=" + b0.year_built + " fee_freq=" + b0.association_fee_frequency + " (source db = autofill built from CRM draft listings, can carry junk)", true);
  check("S2 building autofill from Cotality: BuildingName", norm(af.saleBldgName) === norm(live.BuildingName), af.saleBldgName + " vs live " + live.BuildingName);
  check("S2 autofill YearBuilt", String(af.saleBldgYearBuilt) === String(live.YearBuilt), af.saleBldgYearBuilt + " vs " + live.YearBuilt, true);
  check("S2 autofill StoriesTotal", String(af.saleBldgTotalFloors) === String(live.StoriesTotal), af.saleBldgTotalFloors + " vs " + live.StoriesTotal);
  check("S2 autofill TaxBlock/TaxLot", af.saleBldgTaxBlock === live.TaxBlock && af.saleBldgTaxLot === live.TaxLot, af.saleBldgTaxBlock + "/" + af.saleBldgTaxLot + " vs " + live.TaxBlock + "/" + live.TaxLot);
  check("S2 autofill PostalCode + CityRegion", af.saleZipCode === live.PostalCode && af.saleBorough === live.CityRegion, af.saleZipCode + "/" + af.saleBorough + " vs " + live.PostalCode + "/" + live.CityRegion);
  check("S2 autofill SubdivisionName exact string (no stripped spaces)", af.saleBldgNeighborhood === live.SubdivisionName, af.saleBldgNeighborhood + " vs live " + live.SubdivisionName, true);
  check("S2 autofill StructureType/CommonInterest valid live Lookup values", lk.StructureType.has(af.saleStructureType) && lk.CommonInterest.has(af.saleCommonInterest || "Condominium"), af.saleStructureType + "/" + af.saleCommonInterest);
  check("S2 unit maintenance NOT filled with a building-wide number", !af.saleMaintCC || String(af.saleMaintCC) === String(live.AssociationFee), af.saleMaintCC + " vs live unit fee " + live.AssociationFee, true);

  // ============ S3 fill the sale (every control) + real values from the live listing ========================
  await genericFill(page);
  const real = { salePrice: live.ListPrice, saleBedrooms: live.BedroomsTotal, saleFullBaths: live.BathroomsFull, saleHalfBaths: live.BathroomsHalf || 0, saleLivingArea: live.LivingArea, saleUnitSqFt: live.LivingArea, saleMaintCC: live.AssociationFee || 0, saleRETaxes: 0, saleDateListed: "2026-10-15", saleExclusiveStart: "2026-10-15", saleExclusiveExpires: "2027-04-15", saleDescription: "Corner residence on a high floor with open views and a chef's kitchen. Immediate occupancy.", saleBrokerComments: "", saleShowingInstructions: "By appointment through the listing agent.", saleStatus: "Draft", saleBldgYearBuilt: live.YearBuilt,
    saleVideoUrl: "", saleVideoTourUrl: "", saleMatterportUrl: "", saleVirtualTourUnbranded: "https://www.youtube.com/watch?v=5OLc_TDa5ss", saleVirtualTourUnbranded2: "https://my.matterport.com/show/?m=ABCDEFGHIJK", saleFairHousingAck: true, saleCommNegotiabilityAck: true };
  await setVals(page, real);
  const before = await readState(page);
  await clickBtn(page, "manualSaveDraft"); await page.waitForTimeout(5000);
  const t3 = await toasts(page); const post = log.req.find(r => r.m === "POST" && r.u === "/api/crm/listings");
  check("S3 Save Draft creates the sale (POST /api/crm/listings 201)", post && post.s === 201, post ? post.s + " " + post.res.slice(0, 200) : "no POST");
  check("S3 failure (if any) shows the reason, not 'Request failed: 422'", !t3.some(x => /Request failed: 4\d\d/.test(x)), t3.join(" | "), true);
  if (!post || post.s !== 201) { console.log("Cannot continue the round trip: create failed. Re-run with LISTING_TYPE=InHouseWebOnly to exercise the rest."); finish(); return; }
  const created = JSON.parse(post.res); const dbId = created.id; const body = JSON.parse(post.body);
  let r1 = row(dbId);
  const CAP = Object.keys(body).filter(k => /^[A-Z]/.test(k));
  // every canonical key emitted must be a real Cotality Property field (live $select probe, <=4 requests)
  let probe = CAP.slice(), bad = [];
  for (let i = 0; i < 4; i++) { const r = await cGet("/Property?$top=1&$select=" + probe.join(",")); if (r.status === 200) break; const m = /property named '?([A-Za-z0-9_]+)'?/i.exec(JSON.stringify(r.json)) || /([A-Za-z0-9_]+)['"]? (?:is not|was not|could not)/i.exec(JSON.stringify(r.json)); if (!m) { bad.push("(unparsed 400)"); break; } bad.push(m[1]); probe = probe.filter(k => k !== m[1]); }
  check("S4 every emitted capitalized payload key is a live Cotality Property field", bad.length === 0, bad.length ? "REJECTED by live $select: " + bad.join(",") : CAP.length + " keys accepted", true);
  check("S4 StandardStatus/MlsStatus emitted value is a live enum member (Draft must not be sent)", !body.MlsStatus || lk.MlsStatus.has(body.MlsStatus) || lk.StandardStatus.has(body.MlsStatus), "MlsStatus=" + body.MlsStatus, true);
  check("S4 PropertyType/PropertySubType emitted are live enum members", lk.PropertyType.has(body.PropertyType) && (!body.PropertySubType || lk.PropertySubType.has(body.PropertySubType)), body.PropertyType + "/" + body.PropertySubType);
  check("S4 StructureType emitted is a live enum member", lk.StructureType.has(body.StructureType), body.StructureType);
  check("S4 ListingAgreement emitted is a live enum member", lk.ListingAgreement.has(body.ListingAgreement), body.ListingAgreement);
  check("S4 Heating/Cooling/View/PetsAllowed arrays only contain live enum members", ["Heating", "Cooling", "View", "PetsAllowed"].every(k => (body[k] || []).every(v => lk[k].has(v))), ["Heating", "Cooling", "View", "PetsAllowed"].map(k => k + ":" + (body[k] || []).filter(v => !lk[k].has(v)).join(",")).join(" "), true);
  check("S4 list agent: ListAgentMlsId = session agent trestle id; ListAgentKey distinct", !!me.mlsId && String(r1.list_agent_mls_id || "") === String(me.mlsId) && !!body.ListAgentKey && body.ListAgentKey !== body.ListAgentMlsId, "session agent mlsId=" + me.mlsId + " (null = session agent has no trestle_mls_id; give agents.trestle_mls_id a real Member.MemberMlsId) col list_agent_mls_id=" + r1.list_agent_mls_id + " payload ListAgentKey=" + body.ListAgentKey, true);
  check("S4 typed columns: list_price/bedrooms/bathrooms/living_area/borough/neighborhood", String(r1.list_price) === String(live.ListPrice) && r1.bedrooms_total === live.BedroomsTotal && r1.bathrooms_full === live.BathroomsFull && Number(r1.living_area) === live.LivingArea && r1.borough === live.CityRegion && r1.neighborhood === live.SubdivisionName, [r1.list_price, r1.bedrooms_total, r1.bathrooms_full, r1.living_area, r1.borough, r1.neighborhood].join("/"));
  check("S4 typed columns: expiration_date and bathrooms_half written", r1.expiration_date && r1.bathrooms_half === (live.BathroomsHalf || 0), "expiration_date=" + r1.expiration_date + " bathrooms_half=" + r1.bathrooms_half, true);
  check("S4 media/tour URLs stored under canonical Cotality keys (VirtualTourURLUnbranded[2])", (r1.raw_data || {}).VirtualTourURLUnbranded === real.saleVirtualTourUnbranded && (r1.raw_data || {}).VirtualTourURLUnbranded2 === real.saleVirtualTourUnbranded2, "U=" + (r1.raw_data || {}).VirtualTourURLUnbranded + " U2=" + (r1.raw_data || {}).VirtualTourURLUnbranded2, true);
  check("S4 commission-request fields are NOT stored in the listing row", !Object.keys(r1.raw_data || {}).some(k => /^commSale/.test(k)), Object.keys(r1.raw_data || {}).filter(k => /^commSale/.test(k)).length + " commSale* keys in raw_data", true);
  const pubUrl = BASE + new URL(created.publicUrl).pathname;
  const dr = await fetch(pubUrl); check("S4 a Draft listing is NOT publicly viewable", dr.status === 404, "GET " + new URL(created.publicUrl).pathname + " -> " + dr.status, true);

  // ============ S5 close + reopen ==============================================================================
  await page.close(); ({ page, log } = await open(browser, FORM + "?id=" + dbId)); await page.waitForTimeout(3000);
  const after = await readState(page); const lost1 = diffState(before, after);
  check("S5 reopen restores every filled control (lost list below)", lost1.length === 0, lost1.length + " lost: " + lost1.slice(0, 12).join("; "), true);
  check("S5 reopen: Living Area (required) restored", !!after.saleLivingArea, "saleLivingArea=" + after.saleLivingArea + " saleUnitSqFt=" + after.saleUnitSqFt, true);
  check("S5 reopen: autosave on load does not blank anything (no PATCH before user edit)", !log.req.some(r => r.m === "PATCH"), log.req.filter(r => r.m === "PATCH").length + " automatic PATCH", true);
  const r2 = row(dbId);
  check("S5 DB unchanged by merely opening the listing", r2.updated_at === r1.updated_at, r1.updated_at + " -> " + r2.updated_at, true);

  // ============ S6 edit + save + reopen =======================================================================
  await setVals(page, { salePrice: String(Number(live.ListPrice) - 5000), saleDescription: "Corner residence on a high floor with open views. Price improved." });
  await clickBtn(page, "manualSaveDraft"); await page.waitForTimeout(4500);
  const t6 = await toasts(page); const pat = log.req.filter(r => r.m === "PATCH").pop(); let pj = {}; try { pj = JSON.parse(pat.res); } catch {}
  check("S6 edit saves (PATCH 200)", pat && pat.s === 200, pat && pat.s);
  check("S6 PATCH reports validation errors honestly (no 'Draft saved' toast with valid=false)", !(pj.validation && pj.validation.valid === false) || !t6.some(x => /Draft saved/.test(x)), "valid=" + (pj.validation && pj.validation.valid) + " toast=" + t6.join("|"), true);
  const r3 = row(dbId), rd1 = r1.raw_data || {}, rd3 = r3.raw_data || {};
  check("S6 price + description updated", String(r3.list_price) === String(Number(live.ListPrice) - 5000) && /Price improved/.test(rd3.PublicRemarks || ""), r3.list_price);
  const clobbered = Object.keys(rd1).filter(k => rd1[k] !== "" && rd1[k] !== null && rd1[k] !== false && !["ListPrice", "salePrice", "PublicRemarks", "saleDescription", "status", "listingAgreement", "saleListingUrl", "saleCreateDate"].includes(k) && (rd3[k] === "" || rd3[k] === null || rd3[k] === undefined || rd3[k] === false));
  check("S6 edit does not clobber untouched saved values (raw_data keys blanked)", clobbered.length === 0, clobbered.length + ": " + clobbered.slice(0, 15).join(","), true);
  check("S6 edit keeps list_agent_mls_id and YearBuilt", !!r1.list_agent_mls_id && String(r3.list_agent_mls_id || "") === String(r1.list_agent_mls_id || "") && String(rd3.YearBuilt || "") === String(rd1.YearBuilt || ""), "list_agent_mls_id " + r1.list_agent_mls_id + "->" + r3.list_agent_mls_id + " YearBuilt " + rd1.YearBuilt + "->" + rd3.YearBuilt, true);
  await page.close(); ({ page, log } = await open(browser, FORM + "?id=" + dbId)); await page.waitForTimeout(3000);
  const after2 = await readState(page); const lost2 = diffState(after, after2).filter(x => !/^salePrice|^saleDescription/.test(x));
  check("S6 second reopen identical to first reopen", lost2.length === 0, lost2.length + ": " + lost2.slice(0, 10).join("; "));

  // ============ S7 media (photo + floor plan upload, video/tour URLs) =========================================
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"); const pf = path.join(os.tmpdir(), "f1acc-photo.png"); fs.writeFileSync(pf, png);
  await page.setInputFiles("#salePhotoInput", pf); await page.waitForTimeout(4500); await page.setInputFiles("#saleFloorplanInput", pf); await page.waitForTimeout(3500);
  const up = log.req.filter(r => /\/media\/upload/.test(r.u));
  check("S7 photo + floor plan upload reach the server (POST media/upload 2xx)", up.length >= 1 && up.every(r => r.s >= 200 && r.s < 300), up.map(r => r.s + " " + r.res.slice(0, 60)).join(" | ") || "no upload request", true);
  const lm = sql("select count(*) from listing_media where listing_id='" + created.listing_id + "'");
  check("S7 listing_media rows created (Photo + FloorPlan)", Number(lm) >= 1, "rows=" + lm, true);
  check("S7 Document upload control does something", (await page.evaluate(() => { const e = document.getElementById("saleDocInput"); return !!(e && (e.onchange || e.getAttribute("onchange"))); })) , "saleDocInput has no change handler", true);

  // ============ S8 publish ==================================================================================
  await setVals(page, { saleStatus: "Active", saleLivingArea: live.LivingArea }); await page.waitForTimeout(500);
  await clickBtn(page, "submitSalesListing"); await page.waitForTimeout(8000);
  const t8 = await toasts(page); const st = log.req.filter(r => /\/status$/.test(r.u)).pop();
  check("S8 Submit publishes (PATCH status -> Active)", st && st.s === 200 && row(dbId).status === "Active", (st && st.s) + " status=" + row(dbId).status + " toasts=" + t8.join("|").slice(0, 200));
  check("S8 publish blocked when REBNY/Cotality-required data is missing (not published with validation.valid=false)", !(log.req.filter(r => r.m === "PATCH" && !/status/.test(r.u)).some(r => /"valid":false/.test(r.res))), "PATCH responses with valid=false before publish", true);
  // ============ S9 public page + API ===========================================================================
  const pg = await (await fetch(pubUrl + "?_=" + Date.now())).text(); const pr2 = await fetch(pubUrl);
  check("S9 public page 200 after publish with price in title", pr2.status === 200 && pg.includes(Number(live.ListPrice) - 5000 > 0 ? (Number(live.ListPrice) - 5000).toLocaleString("en-US") : "x"), "status " + pr2.status);
  check("S9 public page leaks no private data (admin comments / commission request / agent email not intended public)", !/ACC\d+_saleAdminComments|commSale|ACC\d+_commSale/.test(pg), "leak scan", true);
  const api = await (await fetch(BASE + "/api/listings?limit=100&_=" + Date.now())).json(); const pl = (api.listings || []).find(x => JSON.stringify(x).includes(created.listing_id));
  check("S9 /api/listings returns the listing with videoUrl (youtube) and virtualTourURL (matterport)", pl && pl.videoUrl && pl.virtualTourURL, pl ? "videoUrl=" + pl.videoUrl + " tour=" + pl.virtualTourURL : "not in API", true);
  check("S9 public listing exposes photosCount/media consistent with upload", pl && pl.photosCount === (pl.media || []).length, pl && (pl.photosCount + " vs " + (pl.media || []).length), true);

  // ============ S10 status vocabulary (Cotality StandardStatus) ================================================
  const ctxp = await browser.newPage(); await ctxp.goto(BASE + "/crm/login.html"); const sres = {};
  for (const s of ["Pending", "Closed"]) sres[s] = await ctxp.evaluate(async ([id, s]) => { const r = await fetch("/api/crm/listings/" + id + "/status", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: s }) }); return r.status; }, [dbId, s]);
  check("S10 status route accepts Cotality StandardStatus values Pending then Closed", sres.Pending === 200 && sres.Closed === 200, JSON.stringify(sres) + " (server today uses Sold/Rented/Cancelled)", true);
  await ctxp.close();

  // ============ S11 ownership / permissions =====================================================================
  const aj = await (await fetch(BASE + "/api/crm/listings/" + dbId, { headers: { Cookie: "session_token=" + AGENT_TOKEN } })).status;
  check("S11 non-associated AGENT cannot read/edit another agent's local listing", aj === 403, "GET -> " + aj);
  const bctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "f1accb-")), { channel: "chrome", headless: true }); await bctx.addCookies([{ name: "session_token", value: "audit-buyer-token", url: BASE }]);
  const bp = await bctx.newPage(); await bp.goto(FORM, { waitUntil: "load" }); await bp.waitForTimeout(4000);
  check("S11 client/buyer session does not get the agent form", !(await bp.evaluate(() => { const e = document.getElementById("salePrice"); return !!(e && e.offsetParent); })), "form visible to buyer: " + (await bp.evaluate(() => { const e = document.getElementById("salePrice"); return !!(e && e.offsetParent); })), true);
  await bctx.close();
  const tp = sql("select id from listings where rls_eligible and listing_id not like 'SL-%' and listing_id not like 'RL-%' order by id desc limit 1");
  if (tp) { const t = await open(browser, FORM + "?id=" + tp); const ro = await t.page.evaluate(() => ({ banner: !!document.querySelector("[data-readonly-banner],#saleReadOnlyBanner,.read-only-banner"), disabled: Array.from(document.querySelectorAll("button")).filter(b => /manualSaveDraft|submitSalesListing/.test(b.getAttribute("onclick") || "")).every(b => b.disabled) }));
    check("S11 third-party (source-owned) listing opens READ-ONLY with a banner and disabled Save", ro.banner && ro.disabled, JSON.stringify(ro) + " id=" + tp, true); await t.page.close(); }
  finish();
  async function finish() { await browser.close().catch(() => {}); console.log("\nprovider requests used: " + provReq + " | checks: " + results.length + " | FAILED: " + fails); fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), base: BASE, listingType: LT, liveListing: live && { ListingKey: live.ListingKey, ListingId: live.ListingId }, providerRequests: provReq, results }, null, 1)); process.exit(fails); }
})().catch(e => { console.error("SCRIPT ERROR", e); process.exit(97); });
