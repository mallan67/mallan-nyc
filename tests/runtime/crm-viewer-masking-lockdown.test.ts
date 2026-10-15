/// <reference types="jest" />
/**
 * CRM static viewers: role masking and read-only lockdown — EXECUTED, not grepped.
 *
 * Preserves (and strengthens) the provider-independent checks of the retired `rls:validate` validator.
 * For each viewer (sale and rental) this loads the real shipped HTML into jsdom and
 *   1. runs the page's own role-resolution code and the page's own apply*RoleMasking() function for every
 *      role (broker, agent, buyer, tenant, seller, landlord) and for unknown/forged roles, with planted
 *      "secret" agent data, then asserts what each role can and cannot see;
 *   2. runs the page's server-role override logic and proves a server-validated role wins over `?role=`;
 *   3. runs the WHOLE page (all inline scripts), clicks every button and submits every form, and records
 *      every network call and every MallanAPI call, proving the viewer cannot write.
 */

import { readFileSync } from "fs";
import * as path from "path";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { JSDOM, VirtualConsole } = require("jsdom");

const ROOT = path.resolve(__dirname, "../..");

type Viewer = {
  file: string;
  kind: "sale" | "rental";
  failClosed: "buyer" | "tenant";
  maskFn: string;
  agentInfoId: string;
  tabIds: { t4: string; t6: string; t7: string };
  agentHiddenInputs: string[];
};

const VIEWERS: Viewer[] = [
  {
    file: "SALE-FORM-WITH-TOOLS.html",
    kind: "sale",
    failClosed: "buyer",
    maskFn: "applySaleRoleMasking",
    agentInfoId: "saleListingAgentInfo",
    tabIds: { t4: "saleMainTab4", t6: "saleMainTab6", t7: "saleMainTab7" },
    agentHiddenInputs: ["saleUpdatingAgentEmail", "saleUpdatingAgentName", "saleListingAgent"],
  },
  {
    file: "RENTAL-FORM-WITH-TOOLS.html",
    kind: "rental",
    failClosed: "tenant",
    maskFn: "applyRentalRoleMasking",
    agentInfoId: "rentalListingAgentInfo",
    tabIds: { t4: "rentalMainTab4", t6: "rentalMainTab6", t7: "rentalMainTab7" },
    agentHiddenInputs: ["rentalUpdatingAgentEmail", "rentalUpdatingAgentName", "rentalListingAgent"],
  },
];

const SECRET = "SECRET-LISTING-AGENT-DETAIL-555-0100";

const quietConsole = () => new VirtualConsole(); // no sendTo: page noise stays out of test output

/** Balanced-brace slice starting at the first `{` at/after `from`; understands quotes, template literals, comments. */
function sliceBlock(src: string, from: number): string {
  let i = src.indexOf("{", from);
  if (i < 0) throw new Error("no block");
  const start = from;
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "/" && n === "/") { i = src.indexOf("\n", i); if (i < 0) break; continue; }
    if (c === "/" && n === "*") { i = src.indexOf("*/", i) + 1; continue; }
    if (c === "'" || c === '"' || c === "`") {
      const q = c;
      for (i++; i < src.length && src[i] !== q; i++) if (src[i] === "\\") i++;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error("unbalanced block");
}

const extractFunction = (src: string, name: string) => {
  const at = src.indexOf(`function ${name}(`);
  if (at < 0) throw new Error(`function ${name} not found`);
  return sliceBlock(src, at);
};
const extractRoleBlock = (src: string) => {
  // from the URL params through VIEWER_MODE and _isLocal: the page's own role resolution, verbatim
  const m = /var VIEWER_PARAMS[\s\S]*?var _isLocal = [^;]+;/.exec(src);
  if (!m) throw new Error("role block not found");
  return m[0];
};
const extractServerOverride = (src: string) => {
  const at = src.indexOf("if (VIEWER_MODE && typeof MallanAPI !== 'undefined')");
  if (at < 0) throw new Error("server override block not found");
  // the block settles the listing-fetch gate, whose helpers are defined just above it
  const gate = src.indexOf("// Listing-fetch gate.");
  const helpers = gate >= 0 && gate < at ? src.slice(gate, at) : "";
  return helpers + sliceBlock(src, at);
};

function loadViewer(v: Viewer, query: string) {
  const html = readFileSync(path.join(ROOT, "public/crm", v.file), "utf8");
  const dom = new JSDOM(html, { url: `https://mallan.nyc/crm/${v.file}${query}`, runScripts: "outside-only", virtualConsole: quietConsole() });
  return { html, dom, win: dom.window as any, doc: dom.window.document as Document };
}

/** Resolve the role exactly like the page does, then plant secrets and run the page's own masking function. */
function maskAs(v: Viewer, query: string) {
  const { html, dom, win, doc } = loadViewer(v, query);
  win.eval(extractRoleBlock(html));
  // The viewer enters viewer mode before masking (convertXFormToViewer); the CSS that hides things keys off it.
  doc.body.classList.add("viewer-mode");
  const info = doc.getElementById(v.agentInfoId);
  if (info) info.innerHTML = `<p id="planted-agent">${SECRET}</p>`;
  for (const id of v.agentHiddenInputs) {
    const el = doc.getElementById(id) as HTMLInputElement | null;
    if (el) el.value = SECRET;
  }
  win.eval(extractFunction(html, v.maskFn));
  win.eval(`${v.maskFn}();`);
  return { dom, win, doc, role: win.VIEWER_ROLE as string };
}

const hidden = (win: any, doc: Document, id: string) => {
  const el = doc.getElementById(id);
  return !!el && el.classList.contains("viewer-hidden") && win.getComputedStyle(el).display === "none";
};
const visible = (_win: any, doc: Document, id: string) => {
  const el = doc.getElementById(id);
  return !!el && !el.classList.contains("viewer-hidden"); // inactive tabs are display:none by design
};
const inputValue = (doc: Document, id: string) => (doc.getElementById(id) as HTMLInputElement | null)?.value;

describe.each(VIEWERS)("viewer $file — role resolution", (v) => {
  it.each([
    ["broker", "broker"], ["agent", "agent"], ["buyer", "buyer"],
    ["tenant", "tenant"], ["seller", "seller"], ["landlord", "landlord"],
  ])("?role=%s resolves to %s", (param, expected) => {
    expect(maskAs(v, `?role=${param}`).role).toBe(expected);
  });

  it.each(["", "admin", "superuser", "BROKER", "Broker ", "__proto__", "broker,agent", "constructor", "<script>"])(
    "unknown or forged ?role=%j fails closed to the restricted default",
    (param) => {
      expect(maskAs(v, `?role=${encodeURIComponent(param)}`).role).toBe(v.failClosed);
    },
  );

  it("no ?role= at all fails closed to the restricted default", () => {
    expect(maskAs(v, "").role).toBe(v.failClosed);
  });
});

describe.each(VIEWERS)("viewer $file — server-validated role overrides the URL hint", (v) => {
  const run = (query: string, ctx: unknown) => {
    const { html, win } = loadViewer(v, query);
    win.eval(extractRoleBlock(html));
    win.eval(`var VIEWER_LISTING_ID = ''; var VIEWER_LISTINGS = {};`);
    win.eval(`${extractFunction(html, v.maskFn)}`);
    win.MallanAPI = {
      onReady: (cb: () => void) => cb(),
      getContext: () => ctx,
      listings: { get: () => new Promise(() => undefined) },
    };
    win.eval(extractServerOverride(html));
    return win.VIEWER_ROLE as string;
  };

  it("an authenticated buyer who forges ?role=broker is a buyer", () => {
    expect(run("?role=broker", { authenticated: true, role: "buyer" })).toBe("buyer");
  });
  it("the portalRole takes precedence over role", () => {
    expect(run("?role=broker", { authenticated: true, portalRole: "tenant", role: "broker" })).toBe("tenant");
  });
  it("an unrecognized server role fails closed to the restricted default", () => {
    expect(run("?role=broker", { authenticated: true, role: "root" })).toBe(v.failClosed);
  });
  it("a broker session is honored", () => {
    expect(run("", { authenticated: true, role: "BROKER" })).toBe("broker");
  });
});

describe.each(VIEWERS)("viewer $file — what each role can see after masking", (v) => {
  const { t4, t6, t7 } = v.tabIds;

  describe.each(["buyer", "tenant"])("%s (restricted)", (role) => {
    const r = maskAs(v, `?role=${role}`);
    it("cannot see the listing agent's details anywhere in the page", () => {
      expect(r.doc.body.innerHTML).not.toContain(SECRET);
      expect(r.doc.getElementById("planted-agent")).toBeNull();
    });
    it("sees only the brokerage placeholder where the agent card was", () => {
      const masked = Array.from(r.doc.querySelectorAll(".listing-agent-mask")).map((e) => e.textContent).join(" ");
      expect(masked).toContain("Mallan Real Estate Inc.");
    });
    it("has the agent hidden inputs cleared (view-source hardening)", () => {
      // either the input was removed with its replaced card, or its value was cleared
      for (const id of v.agentHiddenInputs) expect(inputValue(r.doc, id) ?? "").toBe("");
    });
    it("has the distribution, history and commission tabs hidden (computed display: none)", () => {
      for (const id of [t4, t6, t7]) expect(hidden(r.win, r.doc, id)).toBe(true);
      for (const id of ["sidebarTab4", "sidebarTab7"]) expect(hidden(r.win, r.doc, id)).toBe(true);
    });
    it("is marked with the role class for CSS-level masking", () => {
      expect(r.doc.body.classList.contains(`role-${role}`)).toBe(true);
    });
  });

  describe.each(["seller", "landlord"])("%s", (role) => {
    const r = maskAs(v, `?role=${role}`);
    it("cannot see commission, but still sees distribution and history", () => {
      expect(hidden(r.win, r.doc, t7)).toBe(true);
      expect(visible(r.win, r.doc, t4)).toBe(true);
      expect(visible(r.win, r.doc, t6)).toBe(true);
    });
    it("is marked with the role class", () => {
      expect(r.doc.body.classList.contains(`role-${role}`)).toBe(true);
    });
  });

  describe.each(["broker", "agent"])("%s (full access)", (role) => {
    const r = maskAs(v, `?role=${role}`);
    it("has nothing hidden and keeps the agent details", () => {
      for (const id of [t4, t6, t7]) expect(visible(r.win, r.doc, id)).toBe(true);
      expect(r.doc.body.innerHTML).toContain(SECRET);
    });
    it("keeps the agent hidden inputs", () => {
      for (const id of v.agentHiddenInputs) expect(inputValue(r.doc, id)).toBe(SECRET);
    });
  });
});

describe.each(VIEWERS)("viewer $file — cannot write (whole page executed)", (v) => {
  type Net = { kind: string; method: string; url: string };
  const run = async () => {
    const html = readFileSync(path.join(ROOT, "public/crm", v.file), "utf8");
    const net: Net[] = [];
    const api: string[] = [];
    const dom = new JSDOM(html, {
      url: `https://mallan.nyc/crm/${v.file}?role=broker&listingId=TEST-1`,
      runScripts: "dangerously",
      pretendToBeVisual: true,
      virtualConsole: quietConsole(),
      beforeParse(win: any) {
        win.tailwind = {}; // the page configures the Tailwind CDN global; external scripts are not loaded here
        win.fetch = (u: unknown, init?: { method?: string }) => {
          net.push({ kind: "fetch", method: (init?.method ?? "GET").toUpperCase(), url: String(u) });
          return new Promise(() => undefined);
        };
        win.XMLHttpRequest = class {
          open(method: string, url: string) { net.push({ kind: "xhr", method: String(method).toUpperCase(), url: String(url) }); }
          send() { /* recorded in open */ }
          setRequestHeader() { /* noop */ }
          addEventListener() { /* noop */ }
        };
        win.navigator.sendBeacon = (u: string) => { net.push({ kind: "beacon", method: "POST", url: String(u) }); return true; };
        win.alert = win.confirm = win.prompt = () => true;
        const track = (name: string) => (..._a: unknown[]) => { api.push(name); return new Promise(() => undefined); };
        win.MallanAPI = new Proxy(
          {
            onReady: (cb: () => void) => { api.push("onReady"); try { cb(); } catch { /* page error is not a write */ } },
            getContext: () => { api.push("getContext"); return { authenticated: true, role: "broker" }; },
            init: track("init"),
            configure: () => { api.push("configure"); },
            hasToken: false,
            listings: { get: track("listings.get") },
          },
          { get: (t: any, p: string) => (p in t ? t[p] : (...a: unknown[]) => { api.push(`UNEXPECTED:${p}`); return track(p)(...a); }) },
        );
      },
    });
    await new Promise((r) => setTimeout(r, 300));
    const doc = dom.window.document;
    // press everything a user could press, submit every form
    doc.querySelectorAll("button, a, [onclick], input[type=submit]").forEach((el: Element) => {
      try { (el as HTMLElement).click(); } catch { /* handler error is not a write */ }
    });
    doc.querySelectorAll("form").forEach((f: HTMLFormElement) => {
      try { f.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); } catch { /* noop */ }
    });
    await new Promise((r) => setTimeout(r, 300));
    return { net, api, formCount: doc.querySelectorAll("form").length };
  };

  let result: Awaited<ReturnType<typeof run>>;
  beforeAll(async () => { result = await run(); }, 60_000);

  it("makes no network request other than GET", () => {
    expect(result.net.filter((n) => n.method !== "GET")).toEqual([]);
  });
  it("calls only read methods on MallanAPI", () => {
    const allowed = new Set(["onReady", "getContext", "init", "configure", "listings.get"]);
    expect(result.api.filter((a) => !allowed.has(a))).toEqual([]);
  });
  it("actually exercised the page (the read path ran), so the checks above are not vacuous", () => {
    expect(result.api).toContain("onReady");
  });
});

describe.each(VIEWERS)("viewer $file — structure", (v) => {
  const raw = readFileSync(path.join(ROOT, "public/crm", v.file), "utf8");
  it('is marked as a viewer (<body data-rls-viewer="true">)', () => {
    expect(raw).toContain('data-rls-viewer="true"');
  });
  it("has no <form> with a real action", () => {
    const forms = raw.match(/<form[^>]*action=["'][^"']*["'][^>]*>/gi) ?? [];
    expect(forms.filter((f) => !f.includes('action=""') && !f.includes('action="#"') && !f.includes("javascript:"))).toEqual([]);
  });
});
