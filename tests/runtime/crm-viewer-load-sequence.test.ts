/// <reference types="jest" />
/**
 * CRM static viewers: the listing load sequence — the WHOLE page executed with a controllable API.
 *
 * Regression for: the viewer looked the listing up in its built-in cache at DOMContentLoaded, before the API had
 * answered, found nothing, and replaced the page with "Listing Not Available" — so any listing that was not in the
 * cache failed unless the API happened to answer before the page finished parsing.
 *
 * Proves, for the sale and the rental viewer:
 *   - an API that answers LATE still produces a rendered listing;
 *   - an API error fails closed ("Listing Not Available");
 *   - an API that never answers fails closed after the bounded wait;
 *   - restricted server roles never see the listing agent's details once the late data arrives (masking runs last);
 *   - the body ends up with exactly one role-* class.
 */

import { readFileSync } from "fs";
import * as path from "path";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { JSDOM, VirtualConsole } = require("jsdom");

const ROOT = path.resolve(__dirname, "../..");
const SECRET_AGENT = "ZZSECRETAGENT";

const VIEWERS = [
  { file: "SALE-FORM-WITH-TOOLS.html", addressId: "saleAddress", agentInputIds: ["saleListingAgent", "saleUpdatingAgentName"] },
  { file: "RENTAL-FORM-WITH-TOOLS.html", addressId: "rentalAddress", agentInputIds: ["rentalListingAgent", "rentalUpdatingAgentName"] },
] as const;

const LISTING = {
  listing_id: "TEST-1",
  status: "Active",
  property_type: "Residential",
  list_price: "1000000",
  address: { StreetNumber: "1", StreetName: "Test St", UnitNumber: "2A" },
  city: "New York",
  postal_code: "10001",
  borough: "Manhattan",
  neighborhood: "Chelsea",
  list_agent_full_name: SECRET_AGENT,
  list_office_name: "ZZSECRETOFFICE",
  features: {},
  media: [],
};

type Api = "late" | "error" | "never";

async function runViewer(file: string, opts: { api: Api; serverRole: string; waitMs?: number }) {
  const html = readFileSync(path.join(ROOT, "public/crm", file), "utf8");
  const dom = new JSDOM(html, {
    url: `https://mallan.nyc/crm/${file}?listingId=TEST-1`,
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    beforeParse(win: any) {
      win.tailwind = {};
      win.VIEWER_FETCH_TIMEOUT_MS = 3000; // the shipped default is 10s; shortened, but with headroom for a loaded CI machine
      win.fetch = () => new Promise(() => undefined);
      win.alert = win.confirm = win.prompt = () => true;
      // Models the real api-client ordering: onReady callbacks wait for init() to complete, and nothing completes
      // init() until the page calls it. (A stub that fired onReady immediately hid a deadlock between the listing
      // fetch and the boot sequence; real Chrome exposed it.)
      let ready = false;
      let callbacks: Array<() => void> = [];
      win.MallanAPI = {
        onReady: (cb: () => void) => { if (ready) cb(); else callbacks.push(cb); },
        getContext: () => (ready ? { authenticated: true, role: opts.serverRole } : null),
        init: () =>
          new Promise((resolve) =>
            setTimeout(() => {
              ready = true;
              const pending = callbacks;
              callbacks = [];
              pending.forEach((fn) => fn());
              resolve({ authenticated: true, role: opts.serverRole });
            }, 50),
          ),
        get isReady() { return ready; },
        configure: () => undefined,
        hasToken: false,
        listings: {
          get: () => {
            if (opts.api === "late") return new Promise((r) => setTimeout(() => r({ ...LISTING }), 150)); // answers after init, after DOMContentLoaded
            if (opts.api === "error") return Promise.reject(new Error("Request failed: 404"));
            return new Promise(() => undefined);
          },
        },
      };
    },
  });
  await new Promise((r) => setTimeout(r, opts.waitMs ?? 1800));
  const doc = dom.window.document as Document;
  const inputValues = Array.from(doc.querySelectorAll("input,textarea,select")).map((e) => (e as HTMLInputElement).value || "");
  return {
    // the fail-closed view replaces the whole body; match its heading, not the page's own script text
    failedClosed: Array.from(doc.querySelectorAll("h2")).some((h) => /Listing Not Available/.test(h.textContent ?? "")),
    // the listing is shown if its address is in the visible text (script/style removed) or in an input value
    showsListing: (() => {
      const c = doc.body.cloneNode(true) as HTMLElement;
      c.querySelectorAll("script,style").forEach((e) => e.remove());
      return (c.textContent ?? "").includes("Test St") || inputValues.some((v) => v.includes("Test St"));
    })(),
    agentNameAnywhere: doc.documentElement.outerHTML.includes(SECRET_AGENT) || inputValues.some((v) => v.includes(SECRET_AGENT)),
    roleClasses: Array.from(doc.body.classList).filter((c) => c.startsWith("role-")),
    close: () => dom.window.close(),
  };
}

describe.each(VIEWERS)("viewer $file — listing load sequence", (v) => {
  // One page load per scenario; the assertions below share the results (each load executes the whole page).
  type R = Awaited<ReturnType<typeof runViewer>>;
  const r = {} as Record<"lateBroker" | "lateBuyer" | "lateTenant" | "error" | "never", R>;

  beforeAll(async () => {
    r.lateBroker = await runViewer(v.file, { api: "late", serverRole: "broker" });
    r.lateBuyer = await runViewer(v.file, { api: "late", serverRole: "buyer" });
    r.lateTenant = await runViewer(v.file, { api: "late", serverRole: "tenant" });
    r.error = await runViewer(v.file, { api: "error", serverRole: "broker" });
    r.never = await runViewer(v.file, { api: "never", serverRole: "broker", waitMs: 4500 });
  }, 240_000);

  afterAll(() => Object.values(r).forEach((x) => x?.close()));

  it("an API that answers late still renders the listing (does not fail closed early)", () => {
    expect(r.lateBroker.failedClosed).toBe(false);
    expect(r.lateBroker.showsListing).toBe(true);
  });

  it("an API error fails closed", () => {
    expect(r.error.failedClosed).toBe(true);
  });

  it("an API that never answers fails closed after the bounded wait", () => {
    expect(r.never.failedClosed).toBe(true);
  });

  it.each(["lateBuyer", "lateTenant"] as const)("%s: the listing renders but the agent's details are nowhere in the page", (key) => {
    expect(r[key].failedClosed).toBe(false);
    expect(r[key].showsListing).toBe(true);
    expect(r[key].agentNameAnywhere).toBe(false);
  });

  it("a broker does see the agent details (so the restricted checks above are not vacuous)", () => {
    expect(r.lateBroker.agentNameAnywhere).toBe(true);
  });

  it("each session ends with exactly one role class matching its server role", () => {
    expect(r.lateBroker.roleClasses).toEqual(["role-broker"]);
    expect(r.lateBuyer.roleClasses).toEqual(["role-buyer"]);
    expect(r.lateTenant.roleClasses).toEqual(["role-tenant"]);
  });
});
