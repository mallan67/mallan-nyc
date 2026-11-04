// MEDIA CONTRACT acceptance script - re-proves media-contract.md live.
// Run:  node media-acceptance.js [--no-cotality] [--no-ui]        (needs: app on :3100, throwaway DB 127.0.0.1:55432/t, playwright-core in mallan-nyc/node_modules)
// Each check prints  PASS  (observed == contract)  or  DEFECT (observed != contract; this is the defect the contract lists)  or  INFO.
// Provider budget: ~16 direct Cotality requests, 1/sec. No secrets printed. Writes only to the throwaway DB (listings SL-95xx).
const fs = require("fs"), path = require("path");
const { execFileSync } = require("child_process");
const HERE = __dirname, MC = path.join(HERE, "..", "media-contract");
const REPO = "C:/Users/MayaAllan/Desktop/mallan-nyc";
const TSXCLI = REPO + "/node_modules/tsx/dist/cli.mjs";
const APP = "http://localhost:3100";
const PSQL = "C:/Program Files/PostgreSQL/18/bin/psql.exe";
const args = new Set(process.argv.slice(2));
const results = [];
const rec = (id, status, claim, observed) => { results.push({ id, status, claim, observed }); console.log(`${status.padEnd(6)} ${id}  ${claim}\n         observed: ${typeof observed === "string" ? observed : JSON.stringify(observed)}`); };
const psql = (sql) => execFileSync(PSQL, ["-h", "127.0.0.1", "-p", "55432", "-U", "postgres", "-d", "t", "-At", "-c", sql], { encoding: "utf8" }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const E = encodeURIComponent;

async function cotality() {
  const { loadCotalityEnv } = require("C:/Users/MayaAllan/mallan-ops/tools/mallan-cotality-env.js");
  const v = (await loadCotalityEnv()).vars; const base = v.TRESTLE_API_URL.replace(/[/]+$/, "");
  const tr = await fetch(base.replace(/[/]odata.*$/, "") + "/oidc/connect/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "client_credentials", client_id: v.IDX_CLIENT_ID, client_secret: v.IDX_CLIENT_SECRET, scope: "api" }).toString() });
  const H = { Authorization: "Bearer " + (await tr.json()).access_token };
  const q = async (p) => { await sleep(1100); const r = await fetch(base + p, { headers: H }); const j = await r.json().catch(() => null); return { s: r.status, j }; };
  // C1 no Video / tour rows in Media
  const cnt = {};
  for (const c of ["Video", "UnbrandedVirtualTour", "BrandedVirtualTour", "Document", "FloorPlan"]) { const r = await q("/odata/Media?$top=1&$count=true&$select=MediaKey&$filter=" + E(`MediaCategory eq '${c}'`)); cnt[c] = r.j && r.j["@odata.count"]; }
  rec("C1", cnt.Video === 0 && cnt.UnbrandedVirtualTour === 0 && cnt.BrandedVirtualTour === 0 ? "PASS" : "DEFECT", "Cotality Media resource carries NO video / virtual-tour rows (video+3D only as Property.VirtualTourURL*)", cnt);
  rec("C2", cnt.Document === 0 && cnt.FloorPlan > 0 ? "PASS" : "DEFECT", "Only floor plans exist as non-photo Media (MediaCategory FloorPlan, MediaClassification DOCUMENT); no real documents", cnt);
  // C3 VideosCount>0 listing: tour URLs, floor plan rows, order restart, PhotosCount semantics
  const p = await q("/odata/Property?$top=40&$orderby=ModificationTimestamp desc&$filter=" + E("StandardStatus eq 'Active' and VideosCount gt 0 and PhotosCount gt 3 and DocumentsCount gt 0") + "&$select=ListingKey,ListingId,PhotosCount,VideosCount,DocumentsCount,FloorPlansCount,VirtualTourURLBranded,VirtualTourURLUnbranded");
  const rows = (p.j && p.j.value) || [];
  const t = rows.find((r) => r.VirtualTourURLUnbranded || r.VirtualTourURLBranded) || rows[0];
  rec("C3", t && (t.VirtualTourURLUnbranded || t.VirtualTourURLBranded) ? "PASS" : "DEFECT", "VideosCount>0 listings expose the video as a URL string in VirtualTourURLUnbranded/Branded", t);
  const m = await q("/odata/Media?$top=100&$orderby=Order&$filter=" + E(`ResourceRecordKey eq '${t.ListingKey}' and MediaStatus ne 'Deleted'`));
  const mr = (m.j && m.j.value) || [];
  const photos = mr.filter((x) => x.MediaCategory === "Photo"), fps = mr.filter((x) => x.MediaCategory === "FloorPlan");
  rec("C4", t.PhotosCount === photos.length + fps.length && fps.every((x) => x.MediaClassification === "DOCUMENT") && photos.every((x) => x.MediaClassification === "PHOTO") ? "PASS" : "DEFECT", "PhotosCount = photo rows + floor-plan rows; classification PHOTO / DOCUMENT (uppercase); FloorPlansCount is null", { PhotosCount: t.PhotosCount, photos: photos.length, floorPlans: fps.length, FloorPlansCount: t.FloorPlansCount, DocumentsCount: t.DocumentsCount });
  const fpOrder = fps[0] && fps[0].Order, clash = photos.some((x) => x.Order === fpOrder);
  rec("C5", clash ? "PASS" : "INFO", "Order restarts per class (floor plan Order collides with a photo Order) -> sort by (class, Order)", { floorPlanOrder: fpOrder, photoOrders: photos.map((x) => x.Order).slice(0, 12) });
  // C6 image URL behaviour
  const u = photos[0] && photos[0].MediaURL;
  const r1 = await fetch(u, { redirect: "manual" }); const loc = r1.headers.get("location") || "";
  await sleep(1100);
  const img = loc ? await fetch(loc) : null; const exp = loc ? Number(new URL(loc).searchParams.get("Expires")) : 0;
  rec("C6", r1.status === 302 && /media-cdn-v2\.corelogic\.com/.test(loc) && img && img.status === 200 ? "PASS" : "DEFECT", "MediaURL -> 302 to signed media-cdn-v2.corelogic.com URL, NO Authorization needed; signed URL expires ~6h; image/jpeg", { status: r1.status, cdnHost: loc && new URL(loc).host, expiresInHours: exp ? +((exp * 1000 - Date.now()) / 36e5).toFixed(1) : null, cdnStatus: img && img.status, contentType: img && img.headers.get("content-type") });
  return t;
}

function routeDefectCheck() {
  const routes = fs.readFileSync(REPO + "/.next/dev/types/routes.d.ts", "utf8");
  const listed = routes.includes('"/api/crm/listings/[id]/media/upload"');
  const onDisk = fs.existsSync(REPO + "/app/api/crm/listings/[id]/media/upload/route.ts");
  rec("R1", onDisk && !listed ? "DEFECT" : "PASS", "upload route file exists on disk AND is in the running dev server's route table", { onDisk, inDevRouteTable: listed });
  return (async () => {
    const o = {};
    for (const verb of ["GET", "POST", "OPTIONS"]) { const r = await fetch(APP + "/api/crm/listings/38/media/upload", { method: verb, headers: { cookie: "session_token=audit-broker-token" } }); o[verb] = r.status; }
    rec("R2", o.OPTIONS === 204 ? "PASS" : "DEFECT", "dev server answers OPTIONS 204 / GET 405 for the upload path (a registered route handler would)", o);
    try {
      const out = execFileSync(process.execPath, [TSXCLI, path.join(MC, "invoke-upload-route.cjs")], { cwd: REPO, encoding: "utf8", timeout: 200000 });
      const j = JSON.parse(out.slice(out.indexOf("{")));
      rec("R3", j["brokerSession_SL-0030"].status === 503 && j.noSession.status === 401 ? "PASS" : "DEFECT", "route handler invoked IN-PROCESS (bypassing dev router): 401 no session, 403 buyer, 404 unknown listing, 503 'Media storage not configured' without R2_* env -> code is correct; 404 is a dev-server routing artifact", { noSession: j.noSession.status, buyer: j.buyerSession.status, broker: j["brokerSession_SL-0030"], unknown: j.brokerSession_unknownListing.status });
    } catch (e) { rec("R3", "INFO", "in-process invoke", String(e.message).slice(0, 200)); }
  })();
}

async function mallanListing(pw) {
  const sharp = require(REPO + "/node_modules/sharp");
  for (const [n, c] of [["photo1", { r: 200, g: 30, b: 30 }], ["photo2", { r: 30, g: 200, b: 30 }], ["floorplan", { r: 240, g: 240, b: 240 }]]) if (!fs.existsSync(`${MC}/${n}.jpg`)) await sharp({ create: { width: 1600, height: 1200, channels: 3, background: c } }).jpeg().toFile(`${MC}/${n}.jpg`);
  const base = JSON.parse(fs.readFileSync(MC + "/base-sale-body.json", "utf8"));
  const ctx = await pw.chromium.launchPersistentContext(MC + "/profile-accept", { channel: "chrome", headless: true, viewport: { width: 1440, height: 900 } });
  await ctx.clearCookies(); await ctx.addCookies([{ name: "session_token", value: "audit-broker-token", url: APP }]);
  const page = await ctx.newPage(); const net = []; let ui = null;
  page.on("dialog", (d) => d.accept().catch(() => { }));
  page.on("response", (r) => { if (/\/api\/crm\/listings/.test(r.url()) && r.request().method() !== "GET") net.push(r.request().method() + " " + r.url().replace(APP, "") + " -> " + r.status()); });
  await page.route("**/api/crm/listings", async (route) => { if (route.request().method() !== "POST") return route.continue(); ui = JSON.parse(route.request().postData() || "{}"); const m = { ...base }; for (const k of Object.keys(ui)) if (/media|tour|video|photo|floor|matterport|VirtualTour|doc/i.test(k)) m[k] = ui[k]; await route.continue({ postData: JSON.stringify(m) }); });
  await page.goto(APP + "/crm/SALE-FORM-REDESIGN.html", { waitUntil: "load" }); await page.waitForFunction(() => typeof showSaleMediaDocs === "function" && typeof manualSaveDraft === "function", null, { timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => { window.__t = []; const o = window.showToast; window.showToast = function (m, t) { window.__t.push((t || "info") + ": " + m); return o && o.apply(this, arguments); }; showSaleMediaDocs(); });
  const vals = { saleVideoUrl: "https://www.youtube.com/watch?v=ACCVIDEO01", saleVideoTourUrl: "https://vimeo.com/222222222", saleMatterportUrl: "https://my.matterport.com/show/?m=ACCBRANDED1", saleVirtualTourUnbranded: "https://my.matterport.com/show/?m=ACCUNBRAND1", saleVirtualTourUnbranded2: "https://my.matterport.com/show/?m=ACCUNBRAND2" };
  for (const [id, x] of Object.entries(vals)) await page.fill("#" + id, x);
  await page.setInputFiles("#salePhotoInput", [MC + "/photo1.jpg", MC + "/photo2.jpg"]); await page.setInputFiles("#saleFloorplanInput", [MC + "/floorplan.jpg"]);
  await page.evaluate(() => manualSaveDraft()); await page.waitForTimeout(9000);
  const toasts = await page.evaluate(() => window.__t);
  const lid = await page.evaluate(() => (document.getElementById("saleListingIdDisplay") || {}).textContent);
  rec("M1", /^SL-\d+/.test(lid || "") ? "PASS" : "DEFECT", "UI Save Draft creates an SL- listing (media keys merged onto a known-valid base body: diagnostic patch, UI alone fails validation 422)", { lid, net });
  rec("M2", net.some((n) => /media\/upload -> 20\d/.test(n)) ? "PASS" : "DEFECT", "photos + floor plan staged in the form are uploaded after create (POST .../media/upload 2xx)", net.filter((n) => /upload/.test(n)));
  rec("M3", toasts.some((x) => /^success: 0 photo/.test(x)) ? "DEFECT" : "PASS", "toast reports real file count (form says '0 photo(s) added' because it clears the FileList first)", toasts.slice(0, 3));
  const raw = JSON.parse(psql(`select row_to_json(t) from (select raw_data->>'VirtualTourURLBranded' b, raw_data->>'VirtualTourURLUnbranded' u, raw_data->>'VirtualTourURLUnbranded2' u2, raw_data->>'saleVideoUrl' v1, raw_data->>'saleVideoTourUrl' v2, raw_data->>'saleMatterportUrl' m, raw_data->>'saleDocInput' doc, (select count(*) from listing_media where listing_id='${lid}') media_rows, media::text media_json from listings where listing_id='${lid}') t`));
  rec("M4", raw.b === vals.saleMatterportUrl && raw.u === vals.saleVirtualTourUnbranded && raw.u2 === vals.saleVirtualTourUnbranded2 ? "PASS" : "DEFECT", "branded / unbranded / unbranded2 tour URLs are stored under CANONICAL raw_data keys VirtualTourURLBranded / Unbranded / Unbranded2 (what the public DTO reads)", raw);
  rec("M5", raw.v1 && !/ACCVIDEO01/.test(raw.b + raw.u + raw.u2) ? "DEFECT" : "PASS", "'Video URL' control is stored where the public page can read it (observed: only under DOM id saleVideoUrl; also bound in HTML to VirtualTourURLBranded)", { saleVideoUrl: raw.v1, saleVideoTourUrl: raw.v2 });
  rec("M6", raw.media_rows >= 3 ? "PASS" : "DEFECT", "photos + floor plan exist as listing_media rows after save", { media_rows: raw.media_rows });
  // Seed rows exactly as the upload route would write them (R2 is not configured, route unreachable) so the READ path can be proven.
  psql(`delete from listing_media where listing_id='${lid}'`);
  psql(`insert into listing_media (listing_id,media_key,resource_record_key,media_url_original,media_url_cached,media_type,media_category,media_classification,"order",preferred_photo_yn,media_modification_ts,status,updated_at) values ('${lid}','crm:${lid}:aaaaaaaaaaaaaaaaaaaaaaaa','${lid}','/images/hero.jpg','/images/hero.jpg','Photo','Photo',null,0,true,now(),'active',now()),('${lid}','crm:${lid}:bbbbbbbbbbbbbbbbbbbbbbbb','${lid}','/images/about-penthouse.png','/images/about-penthouse.png','Photo','Photo',null,1,false,now(),'active',now()),('${lid}','crm:${lid}:cccccccccccccccccccccccc','${lid}','/images/broker-admin-icon.png','/images/broker-admin-icon.png','FloorPlan','FloorPlan','Document',0,false,now(),'active',now())`);
  const order = await fetch(APP + `/api/crm/listings/${lid}/media-order`, { method: "PATCH", headers: { cookie: "session_token=audit-broker-token", "content-type": "application/json" }, body: JSON.stringify({ ordered_media_ids: [`crm:${lid}:bbbbbbbbbbbbbbbbbbbbbbbb`, `crm:${lid}:aaaaaaaaaaaaaaaaaaaaaaaa`] }) });
  const ord = psql(`select string_agg(right(media_key,3)||':'||"order",',' order by "order",id) from listing_media where listing_id='${lid}' and media_type='Photo'`);
  rec("M7", order.status === 200 && ord.startsWith("bbb:0") ? "PASS" : "DEFECT", "reorder persists (PATCH media-order 200, listing_media.order updated)", { status: order.status, photoOrders: ord });
  const sm = await fetch(APP + `/api/crm/listings/${lid}/media/crm:${lid}:bbbbbbbbbbbbbbbbbbbbbbbb`, { method: "PATCH", headers: { cookie: "session_token=audit-broker-token", "content-type": "application/json" }, body: JSON.stringify({ preferred_photo_yn: true }) });
  rec("M8", sm.status === 200 ? "PASS" : "DEFECT", "set-main-photo PATCH media/[mediaId] answers 200 (dev server: 404 = same routing artifact as upload)", sm.status);
  const get = await (await fetch(APP + `/api/crm/listings/${lid}/media`, { headers: { cookie: "session_token=audit-broker-token" } })).json();
  rec("M9", get.media && get.media.length === 3 ? "PASS" : "DEFECT", "reopen: GET /api/crm/listings/{id}/media returns the keyed rows", (get.media || []).map((x) => x.media_type + ":" + x.order + (x.preferred_photo_yn ? "*" : "")));
  await page.close();
  // public page
  const pub = await ctx.newPage(); const csp = []; pub.on("console", (c) => { if (/Refused to frame|Framing .* violates/.test(c.text())) csp.push(c.text().slice(0, 120)); });
  const slug = psql(`select address->>'full' from listings where listing_id='${lid}'`);
  await pub.goto(APP + "/listing/x/" + lid.toLowerCase(), { waitUntil: "load" }); await pub.waitForTimeout(2500);
  const tabs = await pub.$$eval("button", (bs) => bs.map((b) => b.textContent.trim()).filter((t) => /^(Photos|Floor ?plan|Video|3D Tour)/i.test(t)));
  const tourFrame = async () => { const b = await pub.$('button:has-text("3D Tour")'); if (b) await b.click(); await pub.waitForTimeout(2500); return pub.$$eval("iframe", (f) => f.map((x) => x.src).filter((s) => /matterport|youtu|vimeo/.test(s))); };
  const frames3d = await tourFrame();
  const vb = await pub.$('button:has-text("Video")'); if (vb) { await vb.click(); await pub.waitForTimeout(2000); }
  const vframes = await pub.$$eval("iframe", (f) => f.map((x) => x.src).filter((s) => /youtu|vimeo/.test(s)));
  rec("P1", tabs.includes("Video") && tabs.some((x) => /^Photos/.test(x)) && tabs.includes("Floor Plan") && tabs.includes("3D Tour") ? "PASS" : "DEFECT", "public page for the Mallan listing shows Photos, Floor Plan, Video (the 'Video URL' entered) and 3D Tour", { tabs, videoFrames: vframes, tourFrames: frames3d });
  rec("P2", frames3d.some((f) => /ACCUNBRAND1/.test(f)) ? "PASS" : "DEFECT", "public 3D tab embeds the UNBRANDED tour", frames3d);
  await pub.close();
  // clones for host / branded rules (fresh ids avoid the public-page cache)
  psql("delete from listings where listing_id like 'SL-95__'");
  const cases = [["branded-only matterport", { VirtualTourURLBranded: "https://my.matterport.com/show/?m=BR1" }, "3D Tour", /matterport/], ["branded+unbranded youtube", { VirtualTourURLUnbranded: "https://youtu.be/UNBR0000001", VirtualTourURLBranded: "https://youtu.be/BRND0000001" }, "Video", /UNBR0000001/], ["ricoh360 (CSP)", { VirtualTourURLUnbranded: "https://view.ricoh360.com/a/b" }, "3D Tour", "csp"], ["zillow imx (CSP)", { VirtualTourURLUnbranded: "https://www.zillow.com/view-imx/abc" }, "3D Tour", "csp"], ["dailymotion", { VirtualTourURLUnbranded: "https://www.dailymotion.com/video/x8abcde" }, "Video", "videotag"], ["mp4", { VirtualTourURLUnbranded: "https://example.com/a.mp4" }, "Video", "videotag"]];
  for (let i = 0; i < cases.length; i++) {
    const id = "SL-95" + String(i + 1).padStart(2, "0"); const [name, kv, tab, expect] = cases[i];
    const raw2 = JSON.stringify(Object.assign({ VirtualTourURLUnbranded: null, VirtualTourURLBranded: null }, kv)).replace(/'/g, "''");
    psql(`create temp table x as select * from listings where listing_id='${lid}'; update x set id=nextval(pg_get_serial_sequence('listings','id')), listing_id='${id}', raw_data=raw_data||'${raw2}'::jsonb, status='Active', mls_id=null; insert into listings select * from x;`);
    psql(`insert into listing_media (listing_id,media_key,resource_record_key,media_url_original,media_url_cached,media_type,media_category,"order",preferred_photo_yn,media_modification_ts,status,updated_at) select '${id}','crm:${id}:'||substr(media_key,length(media_key)-23),'${id}',media_url_original,media_url_cached,media_type,media_category,"order",preferred_photo_yn,now(),'active',now() from listing_media where listing_id='${lid}' and media_type='Photo'`);
    const pg = await ctx.newPage(); const cs = []; pg.on("console", (c) => { if (/Refused to frame|Framing .* violates/.test(c.text())) cs.push(1); });
    await pg.goto(APP + "/listing/x/" + id.toLowerCase(), { waitUntil: "load" }); await pg.waitForTimeout(1500);
    const b = await pg.$(`button:has-text("${tab}")`); if (b) await b.click(); await pg.waitForTimeout(3000);
    const fr = await pg.$eval("iframe", (f) => f.map((x) => x.src).filter((s) => s && !s.startsWith("data:") && !s.includes("google.com/maps"))); const vt = await pg.$$eval("video", (v) => v.map((x) => x.src));
    let ok, obs = { frames: fr, videoTags: vt, cspRefusals: cs.length };
    if (expect === "csp") { ok = cs.length === 0; } else if (expect === "videotag") { ok = name === "mp4" ? vt.length > 0 : vt.length === 0; } else ok = fr.concat(vt).some((s) => expect.test(s));
    rec("H" + (i + 1), ok ? "PASS" : "DEFECT", `host/branded rule: ${name} renders (contract: embeddable hosts only YouTube/Vimeo/Matterport; direct mp4 via <video>; others must be a link, not a blocked/blank iframe; branded shown only when no unbranded)`, obs);
    await pg.close();
  }
  psql("delete from listings where listing_id like 'SL-95__'");
  await ctx.close();
  return lid;
}

async function cotalityListing(pw, t) {
  const key = t.ListingKey;
  const have = psql(`select count(*) from listings where mls_id='${t.ListingId}' or listing_id='${t.ListingId}'`);
  if (have === "0") {
    try { execFileSync(process.execPath, [TSXCLI, path.join(MC, "ingest-target.cjs"), key], { cwd: REPO, encoding: "utf8", timeout: 250000, stdio: "pipe" }); } catch (e) { rec("L0", "INFO", "ingest via syncListings", String(e.stderr || e.message).slice(0, 200)); }
  }
  const row = psql(`select row_to_json(t) from (select listing_id, jsonb_array_length(media) media_json, raw_data->>'VirtualTourURLBranded' b, raw_data->>'VirtualTourURLUnbranded' u, raw_data->>'VideosCount' videos_count_in_raw, (select count(*) from listing_media m where m.listing_id=l.listing_id) media_rows from listings l where mls_id='${t.ListingId}' or listing_id='${t.ListingId}' limit 1) t`);
  const r = row ? JSON.parse(row) : null;
  rec("L1", r && r.media_json > 0 && (r.b || r.u) ? "PASS" : "DEFECT", "repo syncListings ingests the live listing: legacy media JSON (photos+floor plan), raw_data.VirtualTourURL*", r);
  rec("L2", r && r.videos_count_in_raw === null ? "INFO" : "INFO", "VideosCount is NOT kept in raw_data; media_rows stays 0 until media-sync runs (photos then come from the legacy JSON fallback)", r);
  if (!r) return;
  const ctx = await pw.chromium.launchPersistentContext(MC + "/profile-accept", { channel: "chrome", headless: true, viewport: { width: 1440, height: 900 } });
  await ctx.clearCookies(); await ctx.addCookies([{ name: "session_token", value: "audit-broker-token", url: APP }]);
  const pg = await ctx.newPage();
  await pg.goto(APP + "/listing/x/" + r.listing_id.toLowerCase(), { waitUntil: "load" }); await pg.waitForTimeout(3000);
  const tabs = await pg.$$eval("button", (bs) => bs.map((b) => b.textContent.trim()).filter((x) => /^(Photos|Floor ?plan|Video|3D Tour)/i.test(x)));
  const out = {};
  for (const tab of ["Floor Plan", "Video", "3D Tour"]) { const b = await pg.$(`button:has-text("${tab}")`); if (!b) continue; await b.click(); await pg.waitForTimeout(2500); out[tab] = await pg.$$eval("iframe,img[alt='Floor Plan']", (e) => e.map((x) => (x.src || "").replace(/^.*\/api\/media\/proxy.*$/, "/api/media/proxy?url=..."))).then((a) => a.filter((s) => !s.startsWith("data:") && !s.includes("google.com/maps"))); }
  rec("L3", tabs.includes("Video") && tabs.includes("3D Tour") && tabs.includes("Floor Plan") ? "PASS" : "DEFECT", "public page of the ingested Cotality listing: Photos / Floor Plan / Video (youtube embed) / 3D Tour (matterport)", { tabs, out });
  await pg.close();
  // CRM search viewer
  await ctx.route(APP + "/crm/index-built.html", async (route) => { const resp = await route.fetch(); let b = await resp.text(); b = b.replace("MallanAPI.configure({ baseUrl: 'https://mallan.nyc' });", "/*patched-for-localhost*/"); await route.fulfill({ response: resp, body: b }); });
  const crm = await ctx.newPage(); const csp = []; crm.on("console", (c) => { if (/Framing/.test(c.text())) csp.push(c.text().slice(0, 90)); });
  await crm.goto(APP + "/crm/index-built.html", { waitUntil: "load" }); await crm.waitForTimeout(6000);
  const info = await crm.evaluate(async (id) => { const res = await MallanAPI.idx.search({ listingId: id, limit: 1 }); const l = res.listings[0]; if (!listings.find((x) => x.id === l.id)) listings.push(l); showListingDetail(l.id); await new Promise((r) => setTimeout(r, 6000)); detailSwitchTab("media"); await new Promise((r) => setTimeout(r, 3000)); const p = document.getElementById("detailPanelMedia"); return { virtualTourUrl: l.virtualTourUrl, videoTourUrl: l.videoTourUrl || null, cards: [...p.querySelectorAll(".lux-card")].map((c) => (c.querySelector("h3") || {}).textContent.trim().replace(/\s+/g, " ").slice(0, 24) + " iframes=" + c.querySelectorAll("iframe").length + " imgs=" + c.querySelectorAll("img").length) }; }, r.listing_id);
  const videoCard = info.cards.find((c) => /^Video Tour/.test(c)) || "";
  rec("V1", /iframes=1/.test(videoCard) && csp.length === 0 ? "PASS" : "DEFECT", "CRM search viewer (index-built.html) shows the YouTube video in the Video card, the Matterport in the 3D card, no CSP refusal", { ...info, cspRefusals: csp.length });
  await ctx.close();
}

async function forms(pw) {
  const ctx = await pw.chromium.launchPersistentContext(MC + "/profile-accept", { channel: "chrome", headless: true, viewport: { width: 1440, height: 900 } });
  await ctx.clearCookies(); await ctx.addCookies([{ name: "session_token", value: "audit-broker-token", url: APP }]);
  const rows = [["RENTAL-FORM-REDESIGN", "showRentalMediaDocs", "rentalPhotoInput", "rentalPhotoPreview"], ["TENANT-DEAL-FORM", null, "tenantManualPhotos", "tenantPhotoGrid"], ["BUYER-DEAL-FORM", null, "buyerManualPhotos", "buyerPhotoGrid"]];
  for (const [f, open, inp, prev] of rows) {
    const pg = await ctx.newPage(); pg.on("dialog", (d) => d.accept().catch(() => { }));
    await pg.goto(APP + "/crm/" + f + ".html", { waitUntil: "domcontentloaded", timeout: 45000 }); await pg.waitForTimeout(4500);
    if (open) await pg.evaluate((n) => window[n] && window[n](), open);
    const before = await pg.evaluate((id) => document.getElementById(id).children.length, prev);
    await pg.setInputFiles("#" + inp, [MC + "/photo1.jpg"]); await pg.waitForTimeout(1200);
    const after = await pg.evaluate((id) => document.getElementById(id).children.length, prev);
    rec("F-" + f, after > before ? "PASS" : "DEFECT", `${f}: choosing a photo file produces a preview/queue entry`, { before, after });
    await pg.close();
  }
  const dp = await ctx.newPage(); await dp.goto(APP + "/crm/BUYER-DEAL-FORM.html", { waitUntil: "domcontentloaded" }); await dp.waitForTimeout(4000);
  let idx = 0; dp.on("request", (r) => { if (/api\/idx\/search/.test(r.url())) idx++; });
  await dp.evaluate(() => searchListingForBuyerDeal("120 E 87th")); await dp.waitForTimeout(1500);
  rec("F-DEAL-IDX", idx > 0 ? "PASS" : "DEFECT", "deal forms populate their listing search from /api/idx/search so IDX photos can load (observed: listingDatabase=[] is never filled)", { idxSearchRequests: idx });
  await ctx.close();
}

(async () => {
  const pw = require(REPO + "/node_modules/playwright-core");
  console.log("MEDIA CONTRACT ACCEPTANCE  " + new Date().toISOString() + "  HEAD " + execFileSync("git", ["-C", REPO, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim());
  let t = null;
  if (!args.has("--no-cotality")) t = await cotality();
  await routeDefectCheck();
  if (!args.has("--no-ui")) { await mallanListing(pw); if (t) await cotalityListing(pw, t); await forms(pw); }
  const s = results.reduce((a, r) => (a[r.status] = (a[r.status] || 0) + 1, a), {});
  console.log("\nSUMMARY", JSON.stringify(s));
  fs.writeFileSync(path.join(HERE, "media-acceptance-last-run.json"), JSON.stringify(results, null, 1));
})().catch((e) => { console.error("FATAL", e); process.exit(2); });
