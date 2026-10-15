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
 * SCOPE: this file owns ONE thing — the builder -> serializer contract.
 *
 * It deliberately does NOT classify DOM controls. An earlier version did, using
 * a regex mirror of `init-disable-dead-controls.js` plus id-prefix guessing.
 * That mirror reached the wrong answer, because production disables the
 * DESCENDANTS of dead containers and resolves its grid anchor through a real
 * `parentElement`. All runtime DOM truth now comes from the single real-DOM
 * authority in `lib/search/testing/advanced-search-dom.ts`, which executes the
 * real production script. There is no second implementation here.
 *
 * The Defect 3 runtime test loads the actual `api-client.js` and calls the real
 * `MallanAPI.idx.search()`, capturing the URL handed to `fetch`. A
 * reimplemented serializer would pass while production stayed broken.
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
