/// <reference types="jest" />
/**
 * SEARCH-P0-001 — Search contract drift invariants.
 *
 * An Advanced Search criterion can be visible, enabled and typed into by an
 * agent and still never reach Cotality. These invariants prove where that
 * happens and stop it recurring.
 *
 *   DEFECT 3  builder -> serializer   `buildIdxSearchParams` sets a param that
 *                                     `MallanAPI.idx.search` never serializes.
 *   DEFECT 7  DOM     -> collector    an enabled control no collector reads.
 *   DEFECT 8  criterion has no executable binding at all.
 *
 * WHY THE HARNESS IS SHAPED THIS WAY
 *
 * 1. Real artifacts only. The Defect 3 runtime test loads the actual
 *    `api-client.js` and calls the real `MallanAPI.idx.search()`, capturing the
 *    URL handed to `fetch`. A reimplemented serializer would pass while
 *    production stayed broken.
 *
 * 2. Binding is proven per CONTROL TYPE against the collector's REAL
 *    mechanisms. `collectSearchCriteria` can only reach a control three ways:
 *      - `getElementById(<id>)`
 *      - `input[data-field]:checked`   (checkbox/radio only)
 *      - `select[data-field]`          (select only)
 *    So `data-field` alone does NOT mean bound: a text/date/number input
 *    carrying `data-field` is read by neither generic scanner.
 *
 * 3. `getElementById` matching is scoped to the collectSearchCriteria body,
 *    not the whole 168KB module. An id appearing in show/hide, reset, tab or
 *    formatting logic is not evidence that the criterion is collected.
 *
 * 4. Deliberately-disabled controls are excused by PARSING the real
 *    `init-disable-dead-controls.js` selector list — including named
 *    `data-field="X"` values, `data-local-field`, valueless attribute
 *    selectors, operator-prefixed values, and id-anchored container disabling.
 *    None of that list is duplicated here.
 *
 * 5. Non-Search controls (financial calculators and scenario inputs) are
 *    excluded from BOTH criterion invariants, so they cannot inflate either
 *    count.
 *
 * RED-before/GREEN-after: all fail on `main` (2d121daa). No production code is
 * changed by this file.
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

/** Balanced-brace body of a named function/assignment in a JS source. */
function functionBody(src: string, anchor: string): string {
  const start = src.indexOf(anchor);
  if (start < 0) throw new Error(`anchor not found: ${anchor} — extractor is stale`);
  const open = src.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open, i);
  }
  throw new Error(`unterminated body: ${anchor} — extractor is stale`);
}

// ─── Real-artifact extractors ────────────────────────────────────────────────

function builderParams(): Set<string> {
  const body = functionBody(read(SEARCH_ENGINE), "window.buildIdxSearchParams");
  return new Set([...body.matchAll(/params\.([A-Za-z_][A-Za-z0-9_]*)\s*=/g)].map((m) => m[1]));
}

function serializerParams(): Set<string> {
  const src = read(API_CLIENT);
  const from = src.indexOf("search: function (params)");
  const to = src.indexOf("/api/idx/search", from);
  if (from < 0 || to < 0) throw new Error("idx.search block not found — extractor is stale");
  return new Set(
    [...src.slice(from, to).matchAll(/qs\.push\('([A-Za-z_][A-Za-z0-9_]*)=/g)].map((m) => m[1]),
  );
}

function loadRealApiClient(): { api: any; lastUrl: () => string | null } {
  let captured: string | null = null;
  const sandbox: Record<string, unknown> = {
    console: { warn() {}, error() {}, log() {} },
    localStorage: { removeItem() {}, getItem: () => null, setItem() {} },
    fetch: (url: string) => {
      captured = url;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    },
    window: { dispatchEvent() {}, addEventListener() {} },
    document: { addEventListener() {} },
    setTimeout, Promise, Object, JSON, encodeURIComponent,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read(API_CLIENT), sandbox, { filename: "api-client.js" });
  const api = (sandbox as { MallanAPI?: unknown }).MallanAPI;
  if (!api) throw new Error("MallanAPI did not initialise — loader is stale");
  return { api, lastUrl: () => captured };
}

/** Ids the REAL collectSearchCriteria reads — scoped to its own body. */
function collectorIds(): Set<string> {
  const body = functionBody(read(SEARCH_ENGINE), "function collectSearchCriteria");
  return new Set(
    [...body.matchAll(/getElementById\(\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]),
  );
}

// ─── Production's disable contract, parsed (never duplicated) ────────────────

interface Selector { tag: string | null; attrs: { name: string; op?: string; value?: string }[] }

/** Every CSS selector string production disables, plus its id anchors. */
function deadContract(): { selectors: Selector[]; idAnchors: string[] } {
  const src = read(DEAD_CONTROLS);
  const raw = [...src.matchAll(/'([^']*\[[^']*\][^']*)'/g)].map((m) => m[1]);
  const selectors = raw.map((s) => {
    const tag = /^([a-zA-Z]+)/.exec(s)?.[1] ?? null;
    const attrs = [...s.matchAll(/\[([a-zA-Z-]+)(?:(\^?=)"([^"]*)")?\]/g)].map((a) => ({
      name: a[1], op: a[2], value: a[3],
    }));
    return { tag, attrs };
  }).filter((s) => s.attrs.length > 0);
  const idAnchors = [...src.matchAll(/idAnchor:\s*'([^']+)'/g)].map((m) => m[1]);
  return { selectors, idAnchors };
}

interface Control {
  tag: string; type: string; id: string | null;
  attrs: Record<string, string>; disabled: boolean; raw: string;
}

/** Every interactive control inside #searchAdvancedMode, by DOM containment. */
function advancedControls(): Control[] {
  const html = read(SEARCH_FORM);
  const start = html.indexOf('<div id="searchAdvancedMode"');
  if (start < 0) throw new Error("#searchAdvancedMode not found — extractor is stale");
  let depth = 0, end = -1;
  const re = /<div\b|<\/div>/g;
  re.lastIndex = start;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[0] === "</div>") { if (--depth === 0) { end = m.index + 6; break; } }
    else depth++;
  }
  if (end < 0) throw new Error("#searchAdvancedMode unterminated — extractor is stale");
  return [...html.slice(start, end).matchAll(/<(input|select|textarea)\b([^>]*)>/g)]
    .map((c) => {
      const attrs: Record<string, string> = {};
      for (const a of c[2].matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
      return {
        tag: c[1],
        type: attrs.type ?? (c[1] === "select" ? "select" : "text"),
        id: attrs.id ?? null,
        attrs,
        disabled: /\bdisabled\b/.test(c[2]),
        raw: `<${c[1]}${c[2]}>`.slice(0, 110),
      };
    })
    .filter((c) => !["button", "submit", "reset", "hidden"].includes(c.type));
}

function matchesDead(c: Control, d: ReturnType<typeof deadContract>): boolean {
  if (c.disabled) return true;
  for (const anchor of d.idAnchors) {
    const prefix = anchor.replace(/(north|south|east|west)$/, "");
    if (c.id?.startsWith(prefix)) return true;
  }
  for (const sel of d.selectors) {
    if (sel.tag && sel.tag !== c.tag) continue;
    const all = sel.attrs.every((a) => {
      const v = c.attrs[a.name];
      if (v === undefined) return false;
      if (a.value === undefined) return true;              // [attr] — presence only
      return a.op === "^=" ? v.startsWith(a.value) : v === a.value;
    });
    if (all) return true;
  }
  return false;
}

/**
 * Financial calculators and scenario inputs live inside #searchAdvancedMode for
 * layout reasons but never contribute a filter. Excluded from BOTH criterion
 * invariants so neither count can be inflated by them.
 */
const NON_CRITERION_ID = /^(calc|mortgage|rvb|closing|enable|show)[A-Z]/;
const NON_CRITERION_PLACEHOLDER = /purchase price|down payment|interest|insurance|vacancy|renovation|repairs|appreciation|loan term/i;

function isSearchCriterion(c: Control): boolean {
  if (c.id && NON_CRITERION_ID.test(c.id)) return false;
  if (c.attrs.placeholder && NON_CRITERION_PLACEHOLDER.test(c.attrs.placeholder)) return false;
  return true;
}

/** Executable binding, per the collector's REAL mechanisms and control type. */
function isBound(c: Control, ids: Set<string>): boolean {
  if (c.id && ids.has(c.id)) return true;                              // getElementById
  if (!c.attrs["data-field"]) return false;
  if (c.tag === "select") return true;                                 // select[data-field]
  if (c.type === "checkbox" || c.type === "radio") return true;        // input[data-field]:checked
  return false;                        // text/date/number with data-field: no reader
}

// ─── DEFECT 3 ────────────────────────────────────────────────────────────────

describe("DEFECT 3 — every param the builder emits must survive the serializer", () => {
  test("the REAL MallanAPI.idx.search serializes every param buildIdxSearchParams sets", async () => {
    const expected = [...builderParams()].sort();
    expect(expected.length).toBeGreaterThan(20);
    const params: Record<string, string> = {};
    for (const k of expected) params[k] = `V_${k}`;
    const { api, lastUrl } = loadRealApiClient();
    await api.idx.search(params);
    const url = lastUrl();
    expect(url).toBeTruthy();
    expect(expected.filter((k) => !new RegExp(`[?&]${k}=`).test(url as string))).toEqual([]);
  });

  test("serializer parity is mechanically enforced, not maintained by hand", () => {
    expect([...builderParams()].filter((k) => !serializerParams().has(k)).sort()).toEqual([]);
  });
});

// ─── DEFECT 7 / 8 ────────────────────────────────────────────────────────────

describe("DEFECT 7/8 — every active Search criterion needs an executable binding", () => {
  test("no active Advanced Search criterion control is unbound", () => {
    const dead = deadContract();
    const ids = collectorIds();
    const unbound = advancedControls()
      .filter(isSearchCriterion)
      .filter((c) => !matchesDead(c, dead))
      .filter((c) => !isBound(c, ids));
    expect(unbound.map((c) => c.id ?? c.raw)).toEqual([]);
  });

  test("the inventory reconciles with no unexplained remainder", () => {
    const dead = deadContract();
    const ids = collectorIds();
    const all = advancedControls();
    const nonCriterion = all.filter((c) => !isSearchCriterion(c));
    const criteria = all.filter(isSearchCriterion);
    const disabled = criteria.filter((c) => matchesDead(c, dead));
    const active = criteria.filter((c) => !matchesDead(c, dead));
    const bound = active.filter((c) => isBound(c, ids));
    const unbound = active.filter((c) => !isBound(c, ids));
    // Every element lands in exactly one bucket.
    expect(nonCriterion.length + disabled.length + bound.length + unbound.length)
      .toBe(all.length);
    // The invariant: nothing active is unbound.
    expect(unbound.length).toBe(0);
  });
});
