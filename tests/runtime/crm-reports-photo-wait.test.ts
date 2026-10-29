/**
 * Reports modal — the full photo sets are downloaded once per listing and Print / Email wait for them.
 *
 * Found 2026-10-27 in the browser: Fact Sheet with "Photos: 4" printed one photo per listing, because
 * Generate built the page synchronously while the media batch was still in flight (the preview re-rendered
 * with the photos a second later, but the print tab had already opened).
 *
 * The prefetch block is executed in a vm sandbox with a fake fetch; the wiring (print/email wait, early
 * download on format / photo-count change, compliance self-check) is asserted on the shipped source.
 */
import * as fs from "fs";
import * as path from "path";
import * as vm from "vm";

const ROOT = path.resolve(__dirname, "../../");
const reportsSrc = fs.readFileSync(path.join(ROOT, "public/crm/js/output/reports.js"), "utf8");
const reportsHtml = fs.readFileSync(path.join(ROOT, "public/crm/html/modals/reports.html"), "utf8");
const gatesSrc = fs.readFileSync(path.join(ROOT, "public/crm/js/compliance/compliance-gates-and-output.js"), "utf8");

type Listing = { id: string; images?: Array<{ url: string }>; _reportMediaRequested?: boolean; _reportMediaApplied?: boolean; photoCount?: number };

function fakeMedia(id: string, n: number) {
  return Array.from({ length: n }, (_, i) => ({ url: "/api/media/proxy?url=" + id + "-" + i, mediaType: i === n - 1 ? "FloorPlan" : "Photo", order: i, caption: "" }));
}

function loadPrefetch(opts: { format: string; fsCount?: string | null; options?: Record<string, unknown>; photosPerListing?: number }) {
  const start = reportsSrc.indexOf("// ── Report media prefetch ──");
  const end = reportsSrc.indexOf("function populateReportPreview() {");
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const block = reportsSrc.slice(start, end);
  const fetched: string[] = [];
  const toasts: string[] = [];
  const ctx: Record<string, unknown> = {
    reportState: { format: opts.format, options: opts.options || {} },
    document: { getElementById: (id: string) => (id === "fsPhotoCount" && opts.fsCount != null ? { value: opts.fsCount } : null) },
    fetch: (url: string) => {
      fetched.push(url);
      const ids = decodeURIComponent(url.split("ids=")[1].split("&")[0]).split(",");
      const media: Record<string, unknown> = {};
      ids.forEach((id) => { media[id] = fakeMedia(id, opts.photosPerListing ?? 6); });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ photos: {}, media }) });
    },
    Promise, console,
    // the 4s print safety timer must not hold jest open after the test
    setTimeout: (fn: () => void, ms: number) => { const t = setTimeout(fn, ms); (t as { unref?: () => void }).unref?.(); return t; },
    showReportToast: (m: string) => toasts.push(m),
  };
  vm.createContext(ctx);
  vm.runInContext(block, ctx);
  return { ctx: ctx as Record<string, any>, fetched, toasts };
}

const oneImage = (id: string): Listing => ({ id, images: [{ url: "/api/media/proxy?url=" + id + "-cover" }] });

describe("report media prefetch", () => {
  test("asks for the Photos selector value on a Fact Sheet, 8 on Images and 1 everywhere else", () => {
    expect(loadPrefetch({ format: "factSheet", fsCount: "4" }).ctx.reportWantedPhotos()).toBe(4);
    expect(loadPrefetch({ format: "detail", fsCount: "2" }).ctx.reportWantedPhotos()).toBe(2);
    expect(loadPrefetch({ format: "factSheet", fsCount: null, options: { factSheetPhotoCount: 3 } }).ctx.reportWantedPhotos()).toBe(3);
    expect(loadPrefetch({ format: "images", fsCount: "4" }).ctx.reportWantedPhotos()).toBe(8);
    expect(loadPrefetch({ format: "grid", fsCount: "4" }).ctx.reportWantedPhotos()).toBe(1);
  });

  test("downloads the full set once per listing, in batches of 25, and the promise settles when every batch has landed", async () => {
    const { ctx, fetched } = loadPrefetch({ format: "factSheet", fsCount: "4" });
    const listings: Listing[] = Array.from({ length: 30 }, (_, i) => oneImage("RLS" + (1000 + i)));
    let done = 0;
    const pending = ctx.prefetchReportMedia(listings, () => done++);
    expect(pending).toBeTruthy();
    expect(fetched).toHaveLength(2);
    expect(fetched[0]).toContain("&detail=true");
    expect(decodeURIComponent(fetched[0]).split(",")).toHaveLength(25);
    expect(listings.every((l) => l._reportMediaRequested)).toBe(true);
    await pending;
    expect(done).toBe(1);
    expect(listings.every((l) => l.images && l.images.length === 6 && l._reportMediaApplied)).toBe(true);
    expect(listings[0].photoCount).toBe(5); // the floor plan is not a photo
    // A second call has nothing left to fetch and nothing pending
    expect(ctx.prefetchReportMedia(listings, null)).toBeNull();
    expect(fetched).toHaveLength(2);
  });

  test("a listing that already has enough photos is not fetched again", () => {
    const { ctx, fetched } = loadPrefetch({ format: "factSheet", fsCount: "4" });
    const full: Listing = { id: "RLS1", images: fakeMedia("RLS1", 6) };
    expect(ctx.prefetchReportMedia([full], null)).toBeNull();
    expect(fetched).toHaveLength(0);
  });

  test("whenReportMediaReady runs the output synchronously when nothing is pending, and after the download otherwise", async () => {
    const ready = loadPrefetch({ format: "factSheet", fsCount: "4" });
    let ran = 0;
    ready.ctx.whenReportMediaReady([{ id: "RLS1", images: fakeMedia("RLS1", 6) }], () => ran++);
    expect(ran).toBe(1); // no wait, so the print tab opens inside the click
    expect(ready.toasts).toHaveLength(0);

    const waiting = loadPrefetch({ format: "factSheet", fsCount: "4" });
    const listings = [oneImage("RLS2"), oneImage("RLS3")];
    let built = 0;
    waiting.ctx.whenReportMediaReady(listings, () => built++);
    expect(built).toBe(0);
    expect(waiting.toasts).toEqual(["Loading listing photos…"]);
    await waiting.ctx._reportMediaPending ?? Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(built).toBe(1);
    expect(listings.every((l) => l.images && l.images.length === 6)).toBe(true);
  });
});

describe("report outputs wait for the photos (shipped source)", () => {
  test("Print and Email build the page inside whenReportMediaReady", () => {
    const printCase = reportsSrc.slice(reportsSrc.indexOf("case 'print':"), reportsSrc.indexOf("case 'email':"));
    expect(printCase).toMatch(/whenReportMediaReady\(listings, function\(\) \{[\s\S]*buildFullReportHTML\(title\)[\s\S]*printReportViaIframe\(printContent, title\)/);
    const emailCase = reportsSrc.slice(reportsSrc.indexOf("case 'email':"), reportsSrc.indexOf("function buildFullReportHTML") > 0 ? reportsSrc.length : reportsSrc.length);
    const emailBranch = emailCase.slice(0, emailCase.indexOf("sendEmailDirect({") + 400);
    expect(emailBranch).toMatch(/whenReportMediaReady\(listings, function\(\) \{[\s\S]*buildFullReportHTML\(title\)[\s\S]*sendEmailDirect\(\{/);
    // The recipient check still happens before any waiting
    expect(emailCase.indexOf("Please enter a recipient email address")).toBeLessThan(emailCase.indexOf("whenReportMediaReady"));
    // The old fire-and-forget counter is gone
    expect(reportsSrc).not.toContain("completedBatches");
  });

  test("choosing a format or a photo count starts the download before Generate", () => {
    const formatHandler = reportsSrc.slice(reportsSrc.indexOf("if (step === 'format') {"), reportsSrc.indexOf("if (step === 'version') {"));
    expect(formatHandler).toContain("prefetchReportMedia(getReportListings(), null)");
    expect(reportsHtml).toMatch(/id="fsPhotoCount"[^>]*onchange="[^"]*prefetchReportMedia\(getReportListings\(\), null\)/);
  });
});

describe("human feel (found clicking through the page 2026-10-27)", () => {
  const gallerySrc = fs.readFileSync(path.join(ROOT, "public/crm/js/render/render-gallery.js"), "utf8");

  test("the address title on a gallery card opens the listing, like the photo and the Summary view's title do", () => {
    expect(gallerySrc).toMatch(/<h4 class="[^"]*cursor-pointer[^"]*" title="Open listing" onclick="openListingInNewTab\('\$\{listing\.id\}'\)">/);
  });

  test("a refusal in the reports modal shows a red mark, not a green tick", () => {
    expect(reportsSrc).toMatch(/function showReportToast\(message, kind\)/);
    expect(reportsSrc).toContain("showReportToast('Please select a client or enter a recipient email address first.', 'error')");
    expect(reportsSrc).toContain("showReportToast('No listings to include in report.', 'error')");
    expect(reportsSrc).toMatch(/showReportToast\('Loading listing photos(\\u2026|…)', 'info'\)/);
    const fn = reportsSrc.slice(reportsSrc.indexOf("function showReportToast(message, kind)"), reportsSrc.indexOf("function getReportListings()"));
    expect(fn).toMatch(/kind === 'error' \? '<i class="fas fa-exclamation-circle"/);
    expect(fn).toMatch(/kind === 'info' \? '<i class="fas fa-circle-notch fa-spin"/);
    expect(fn).toContain("toast.setAttribute('role', kind === 'error' ? 'alert' : 'status')");
  });
});

describe("detail page actions (found clicking through the page 2026-10-27)", () => {
  const paginationSrc = fs.readFileSync(path.join(ROOT, "public/crm/js/search/pagination.js"), "utf8");

  test("the Email button opens the reports modal with Email preselected, like Print preselects Print", () => {
    expect(paginationSrc).toContain(`<button onclick="openReportsModal(['\${listing.id}'], 'email')" class="sidebar-action-primary" title="Email report to client">`);
    expect(paginationSrc).toContain(`<button onclick="openReportsModal(['\${listing.id}'], 'print')" class="sidebar-action-primary" title="Print report in new tab">`);
  });

  test("the photo arrows carry a name for the hover title and for screen readers", () => {
    expect(paginationSrc).toMatch(/detailPhotoPrev\(\)" title="Previous photo" aria-label="Previous photo"/);
    expect(paginationSrc).toMatch(/detailPhotoNext\(\)" title="Next photo" aria-label="Next photo"/);
    expect(paginationSrc).toMatch(/lightboxPrev\(\)" class="photo-lightbox-nav photo-lightbox-prev" title="Previous photo" aria-label="Previous photo"/);
    expect(paginationSrc).toMatch(/lightboxNext\(\)" class="photo-lightbox-nav photo-lightbox-next" title="Next photo" aria-label="Next photo"/);
  });

  test("Share copies the public site's /listing/ URL, id-only when the address is suppressed", () => {
    const helper = paginationSrc.slice(paginationSrc.indexOf("function publicListingUrl("), paginationSrc.indexOf("function shareListing("));
    expect(helper).toContain("'https://mallan.nyc/listing/' + (listing.addressDisplayYN === false || !slug ? listing.id : slug + '-' + listing.id)");
    // Share, the agent email body and the agent inquiry all use it; no /buy/ or /rent/ listing link is built anywhere
    expect(paginationSrc.match(/= publicListingUrl\(listing\);/g)?.length).toBe(3);
    expect(paginationSrc).not.toMatch(/'https:\/\/mallan\.nyc\/' \+ \(isSale \? 'buy' : 'rent'\)/);
  });

  test("Back on a listing opened in its own tab closes the listing instead of a dead history.back()", () => {
    const routingSrc = fs.readFileSync(path.join(ROOT, "public/crm/js/init/init-hash-routing.js"), "utf8");
    const standalone = routingSrc.slice(routingSrc.indexOf("function _setupStandaloneDetail()"), routingSrc.indexOf("function _setupStandaloneDetail()") + 2500);
    expect(standalone).not.toMatch(/backBtn\.onclick = function\(\) \{ history\.back\(\); \};/);
    expect(standalone.match(/backBtn\.onclick = function\(\) \{ closeListingDetail\(\); \};/g)?.length).toBe(2);
  });

  test("the default load keeps the listing that is open in its own tab", () => {
    const loaderSrc = fs.readFileSync(path.join(ROOT, "public/crm/js/core/data-loader.js"), "utf8");
    const fn = loaderSrc.slice(loaderSrc.indexOf("function _replaceListings(newData, source) {"), loaderSrc.indexOf("// Ensure all fields used by renderers have safe defaults"));
    expect(fn).toContain("var open = openId != null ? listings.find(function(l) { return l.id === openId; }) : null;");
    expect(fn).toMatch(/listings\.length = 0;[\s\S]*if \(open && !listings\.some\(function\(l\) \{ return l\.id === open\.id; \}\)\) listings\.push\(open\);/);
  });

  test("the listing-agent inquiry asks before it emails another brokerage", () => {
    const fn = paginationSrc.slice(paginationSrc.indexOf("function sendAgentInquiry("), paginationSrc.indexOf("fetch('/api/crm/agent-inquiry'"));
    expect(fn).toMatch(/if \(!confirm\('Send an inquiry about ' \+ listingAddr \+ ' to ' \+ listingAgentName \+ ' \(' \+ listingAgentEmail \+ '\)\?/);
    expect(fn).toContain("records the inquiry in the audit trail.')) {");
  });

  test("report descriptions are injected as escaped text with paragraph breaks, never as markup", () => {
    expect(reportsSrc).toMatch(/function getReportDescription\(listing\) \{\s*return escapeHtml\(getReportDescriptionText\(listing\)\)\.replace\(\/\\n\{2,\}\/g, '<br><br>'\)\.replace\(\/\\n\/g, '<br>'\);/);
    expect(reportsSrc).toContain("var listDesc = getReportDescriptionText(l);");
    expect(reportsSrc).toContain("var snippet = escapeHtml(listDesc.length > 180 ? listDesc.substring(0, 177) + '...' : listDesc)");
  });
});

describe("the CRM pages talk to the origin they are served from (acceptance finding 0, 2026-10-27)", () => {
  test("no CRM page hard-codes https://mallan.nyc as the API base", () => {
    const dir = path.join(ROOT, "public/crm");
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    const files = walk(dir).filter((f) => /\.(html|js)$/.test(f));
    const offenders = files.filter((f) => /baseUrl:\s*'https:\/\/mallan\.nyc'|https:\/\/mallan\.nyc\/api\//.test(fs.readFileSync(f, "utf8")));
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
    // every page that configures the client uses the served origin
    const configured = files.filter((f) => fs.readFileSync(f, "utf8").includes("MallanAPI.configure({"));
    expect(configured.length).toBeGreaterThanOrEqual(4);
    for (const f of configured) expect(fs.readFileSync(f, "utf8")).toContain("MallanAPI.configure({ baseUrl: location.origin })");
  });
});

describe("compliance self-check on a live feed", () => {
  test("a skipped core check is not counted as a warning", () => {
    const core = gatesSrc.slice(gatesSrc.indexOf("function addResult(testNum, name, status, detail) {"), gatesSrc.indexOf("Test 1: Attribution Display"));
    expect(core).toContain("else if (status !== 'SKIP') warnings++;");
    expect(core).not.toMatch(/\n\s*else warnings\+\+;/);
  });

  test("W6 Regression Snapshot no longer fails when the live listing set changes between page loads", () => {
    const w6 = gatesSrc.slice(gatesSrc.indexOf("W6: Regression Snapshot"), gatesSrc.indexOf("W7: Cross-Surface Consistency"));
    expect(w6).not.toContain("REGRESSION DETECTED");
    expect(w6).not.toMatch(/addResult\('W6', 'Regression Snapshot', 'FAIL', '(Baseline|No regression|REGRESSION)/);
    expect(w6).toMatch(/addResult\('W6', 'Regression Snapshot', 'SKIP', 'Live feed changed since the last run/);
    // the snapshot is still recorded
    expect(w6).toContain("localStorage.setItem(key, JSON.stringify(snap))");
  });
});
