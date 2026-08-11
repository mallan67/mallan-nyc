/// <reference types="jest" />
/**
 * SEARCH-P0-001 — Search contract drift invariants.
 *
 * These tests exist because the Advanced Search criterion contract currently
 * breaks in four distinct places, and each break is silent. A criterion can be
 * visible, enabled and typed into by an agent, and still never reach Cotality:
 *
 *   DEFECT 3  builder -> serializer   `buildIdxSearchParams` sets a param that
 *                                     `MallanAPI.idx.search` does not serialize.
 *   DEFECT 7  DOM     -> collector    an enabled control no code ever reads.
 *   DEFECT 8  DOM     -> (nothing)    a control with no id and no data-field,
 *                                     so no collector can address it at all.
 *
 * DESIGN NOTES — why these tests are shaped this way:
 *
 *  1. They execute or parse the REAL production artifacts. Test 1 loads the
 *     actual `api-client.js` in a VM and calls the real `MallanAPI.idx.search`,
 *     capturing the URL it hands to `fetch`. Nothing here reimplements a
 *     serializer; a second copy of the logic would pass while production broke.
 *
 *  2. They are INVARIANTS, not hand-written ID lists. A test that enumerated
 *     every control id would have to be edited whenever the form changes, which
 *     recreates the very drift it is meant to catch. Instead the rule is
 *     structural: every active filter control must be addressable, and every
 *     param the builder emits must be serialized.
 *
 *  3. The dead-control classification is READ FROM `init-disable-dead-controls.js`
 *     rather than duplicated here, so a control is only excused when production
 *     actually disables it.
 *
 * RED-before/GREEN-after: at the time of writing all three fail on `main`
 * (2d121daa). They are the proof that the defects are real, and the guard that
 * stops them recurring.
 */

import * as fs from "fs";
import * as path from "path";
import * as vm from "vm";

const REPO = path.resolve(__dirname, "../../..");
const API_CLIENT = path.join(REPO, "public/crm/js/core/api-client.js");
const SEARCH_ENGINE = path.join(REPO, "public/crm/js/search/search-engine.js");
const DEAD_CONTROLS = path.join(REPO, "public/crm/js/init/init-disable-dead-controls.js");
const SEARCH_FORM = path.join(REPO, "public/crm/html/search-form-and-results.html");

const read = (p: string) => fs.readFileSync(p, "utf8");

// ─── Real-artifact extractors ────────────────────────────────────────────────

/**
 * The set of params `window.buildIdxSearchParams` assigns, read from the real
 * source. Bounded to that function's body so unrelated `params.x =` writes
 * elsewhere in the 168KB module cannot inflate the set.
 */
function builderParams(): Set<string> {
  const src = read(SEARCH_ENGINE);
  const start = src.indexOf("window.buildIdxSearchParams");
  if (start < 0) throw new Error("buildIdxSearchParams not found — extractor is stale");
  // Balanced-brace scan from the function body's opening brace.
  const open = src.indexOf("{", start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) throw new Error("buildIdxSearchParams body unterminated — extractor is stale");
  const body = src.slice(open, end);
  return new Set([...body.matchAll(/params\.([A-Za-z_][A-Za-z0-9_]*)\s*=/g)].map((m) => m[1]));
}

/** Load the REAL api-client.js and return its MallanAPI plus a URL capture. */
function loadRealApiClient(): { api: any; lastUrl: () => string | null } {
  let captured: string | null = null;
  const sandbox: Record<string, unknown> = {
    console: { warn() {}, error() {}, log() {} },
    localStorage: { removeItem() {}, getItem: () => null, setItem() {} },
    fetch: (url: string) => {
      captured = url;
      // Minimal ok-response shape; the serializer is what we are testing.
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    },
    window: { dispatchEvent() {}, addEventListener() {} },
    document: { addEventListener() {} },
    setTimeout,
    Promise,
    Object,
    JSON,
    encodeURIComponent,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read(API_CLIENT), sandbox, { filename: "api-client.js" });
  const api = (sandbox as { MallanAPI?: unknown }).MallanAPI;
  if (!api) throw new Error("MallanAPI did not initialise — loader is stale");
  return { api, lastUrl: () => captured };
}

/** Params the real serializer emits, read from the idx.search block only. */
function serializerParams(): Set<string> {
  const src = read(API_CLIENT);
  const from = src.indexOf("search: function (params)");
  const to = src.indexOf("/api/idx/search", from);
  if (from < 0 || to < 0) throw new Error("idx.search block not found — extractor is stale");
  const block = src.slice(from, to);
  return new Set([...block.matchAll(/qs\.push\('([A-Za-z_][A-Za-z0-9_]*)=/g)].map((m) => m[1]));
}

/** Selectors production actually disables, read from the real dead-control module. */
function deadControlSelectors(): string[] {
  const src = read(DEAD_CONTROLS);
  return [...src.matchAll(/'(input\[data-field\][^']*)'/g)].map((m) => m[1]);
}

interface Control {
  tag: string;
  type: string;
  id: string | null;
  dataField: string | null;
  dataValue: string | null;
  disabled: boolean;
  raw: string;
}

/** Every filter control inside #searchAdvancedMode, by DOM containment. */
function advancedControls(): Control[] {
  const html = read(SEARCH_FORM);
  const start = html.indexOf('<div id="searchAdvancedMode"');
  if (start < 0) throw new Error("#searchAdvancedMode not found — extractor is stale");
  let depth = 0;
  let end = -1;
  const re = /<div\b|<\/div>/g;
  re.lastIndex = start;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[0] === "</div>") {
      depth--;
      if (depth === 0) { end = m.index + 6; break; }
    } else depth++;
  }
  if (end < 0) throw new Error("#searchAdvancedMode unterminated — extractor is stale");
  const sub = html.slice(start, end);
  const attr = (a: string, n: string) => {
    const r = new RegExp(`${n}="([^"]*)"`).exec(a);
    return r ? r[1] : null;
  };
  return [...sub.matchAll(/<(input|select|textarea)\b([^>]*)>/g)]
    .map((c) => ({
      tag: c[1],
      type: attr(c[2], "type") ?? (c[1] === "select" ? "select" : "text"),
      id: attr(c[2], "id"),
      dataField: attr(c[2], "data-field"),
      dataValue: attr(c[2], "data-value"),
      disabled: /\bdisabled\b/.test(c[2]),
      raw: `<${c[1]}${c[2]}>`,
    }))
    // Buttons and hidden inputs are UI actions/state, not search criteria.
    .filter((c) => !["button", "submit", "reset", "hidden"].includes(c.type));
}

/**
 * Controls that are NOT search criteria and must not inflate the count:
 * financial calculators (mortgage, rent-vs-buy, closing costs, investment),
 * and their enable/show toggles. These live inside #searchAdvancedMode for
 * layout reasons but never contribute a filter to the query.
 */
const NON_CRITERION_ID = /^(calc|mortgage|rvb|closing|enable|show)[A-Z]/;

/**
 * Controls production disables at RUNTIME via an id anchor rather than a
 * `disabled` attribute in the HTML (the Manhattan grid panel). Read from the
 * real dead-control module so this cannot drift.
 */
function runtimeDisabledAnchors(): string[] {
  const src = read(DEAD_CONTROLS);
  return [...src.matchAll(/idAnchor:\s*'([^']+)'/g)].map((m) => m[1]);
}

/** True when production's dead-control module disables this control. */
function isDeadListed(c: Control, selectors: string[]): boolean {
  if (c.disabled) return true;
  // Grid panel: the anchor disables its whole parent container, i.e. all four
  // north/south/east/west selects sharing the anchor's prefix.
  for (const anchor of runtimeDisabledAnchors()) {
    const prefix = anchor.replace(/(north|south|east|west)$/, "");
    if (c.id && c.id.startsWith(prefix)) return true;
  }
  if (!c.dataField) return false;
  for (const sel of selectors) {
    if (sel === "input[data-field]") return true;
    const exact = /data-value="([^"]*)"\]$/.exec(sel);
    if (exact && c.dataValue === exact[1]) return true;
    const prefix = /data-value\^="([^"]*)"\]$/.exec(sel);
    if (prefix && c.dataValue?.startsWith(prefix[1])) return true;
  }
  return false;
}

// ─── DEFECT 3 — builder → serializer ─────────────────────────────────────────

describe("DEFECT 3 — every param the builder emits must survive the serializer", () => {
  test("the REAL MallanAPI.idx.search serializes every param buildIdxSearchParams sets", async () => {
    const expected = [...builderParams()].sort();
    expect(expected.length).toBeGreaterThan(20); // extractor sanity

    // Give the real serializer a value for every param the real builder can set.
    const params: Record<string, string> = {};
    for (const k of expected) params[k] = `V_${k}`;

    const { api, lastUrl } = loadRealApiClient();
    await api.idx.search(params);
    const url = lastUrl();
    expect(url).toBeTruthy();

    const missing = expected.filter((k) => !new RegExp(`[?&]${k}=`).test(url as string));
    expect(missing).toEqual([]);
  });

  test("serializer parity is mechanically enforced, not maintained by hand", () => {
    // The permanent guard: adding a param to the builder without adding it to
    // the serializer must fail here, regardless of runtime behaviour.
    const missing = [...builderParams()].filter((k) => !serializerParams().has(k)).sort();
    expect(missing).toEqual([]);
  });
});

// ─── DEFECT 7 / 8 — UI binding invariant ─────────────────────────────────────

describe("DEFECT 8 — every active Advanced filter control must be addressable", () => {
  test("no active filter control lacks both an id and a data-field", () => {
    const selectors = deadControlSelectors();
    const unbound = advancedControls()
      .filter((c) => !c.id && !c.dataField)
      .filter((c) => !isDeadListed(c, selectors));

    // An agent can interact with these, and no collector can ever read them.
    expect(
      unbound.map((c) => c.raw.slice(0, 90)),
    ).toEqual([]);
  });
});

describe("DEFECT 7 — enabled controls with an id must be read by the collector", () => {
  test("no enabled id-bearing Advanced control is ignored by collectSearchCriteria", () => {
    const engine = read(SEARCH_ENGINE);
    const selectors = deadControlSelectors();
    const orphaned = advancedControls()
      .filter((c) => c.id && !c.dataField)
      .filter((c) => !NON_CRITERION_ID.test(c.id as string))
      .filter((c) => !isDeadListed(c, selectors))
      // A control is considered bound if any CRM code references its id.
      .filter((c) => !engine.includes(`"${c.id}"`) && !engine.includes(`'${c.id}'`))
      .map((c) => c.id as string)
      .sort();

    expect(orphaned).toEqual([]);
  });
});
