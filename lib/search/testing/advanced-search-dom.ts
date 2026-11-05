/**
 * SEARCH-P0-001 — the SINGLE authority for Advanced Search runtime DOM truth.
 *
 * Every test that needs to know whether a control is disabled, dead-containered
 * or interactive must come through here. Nothing may re-derive that state from
 * source text, regex, or id-prefix guessing: the previous harness did exactly
 * that and reached the wrong answer, because production disables the
 * DESCENDANTS of dead containers and resolves its Manhattan-grid anchor through
 * a real `parentElement`.
 *
 * The state returned here is produced by loading the real Search markup into
 * JSDOM and EXECUTING the real `init-disable-dead-controls.js` against it. There
 * is therefore one implementation of the disable contract — production's own.
 *
 * LIFECYCLE IS LOAD-BEARING. At eval time JSDOM reports `readyState: "loading"`,
 * so the production script registers a DOMContentLoaded listener rather than
 * running inline. A caller that evaluates and inspects immediately observes an
 * UNDISABLED document (0 containers marked, 0/3 transit checkboxes, 0/23
 * buttons) and would "prove" the opposite of the truth. `loadAdvancedSearchDom`
 * awaits the event the script actually registered for.
 *
 * This module is test infrastructure. It deliberately lives outside `__tests__`
 * so Jest does not treat it as a suite, and it is imported by both the
 * harness-integrity tests and the contract-drift tests.
 */

import * as fs from "fs";
import * as path from "path";

/**
 * `jsdom` is a repo devDependency but `@types/jsdom` is not, and adding a
 * dependency for this harness is out of scope. Only the constructor and
 * `window` are used, so they are typed locally.
 */
interface JsdomWindow extends Window {
  eval(code: string): unknown;
  Event: typeof Event;
}
interface JsdomInstance { window: JsdomWindow }
type JsdomCtor = new (html: string, opts?: Record<string, unknown>) => JsdomInstance;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { JSDOM } = require("jsdom") as { JSDOM: JsdomCtor };

const REPO = path.resolve(__dirname, "../../..");
export const SEARCH_FORM = path.join(REPO, "public/crm/html/search-form-and-results.html");
export const DEAD_CONTROLS = path.join(REPO, "public/crm/js/init/init-disable-dead-controls.js");
export const SEARCH_ENGINE = path.join(REPO, "public/crm/js/search/search-engine.js");
export const API_CLIENT = path.join(REPO, "public/crm/js/core/api-client.js");

/** Interactive surfaces production itself treats as disable-able. */
export const INTERACTIVE_SELECTOR = "input, select, button, textarea, [tabindex]";

export interface AdvancedDom {
  doc: Document;
  win: Window & typeof globalThis;
  /** The #searchAdvancedMode element — the Advanced surface universe root. */
  advancedRoot: Element;
  /** Re-dispatch production's late-render hook. */
  fireDataReady: () => void;
}

/**
 * Load the real Search DOM and run production's real disable pass against it.
 * Resolves only after the lifecycle the production script depends on.
 */
export async function loadAdvancedSearchDom(): Promise<AdvancedDom> {
  const html = fs.readFileSync(SEARCH_FORM, "utf8");
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const win = dom.window as unknown as Window & typeof globalThis & { eval(c: string): unknown; Event: typeof Event };
  const doc = dom.window.document;

  if (doc.readyState !== "loading") {
    throw new Error(
      "[advanced-search-dom] expected readyState 'loading' before eval — the " +
        "lifecycle assumption changed; re-verify before trusting disabled state",
    );
  }

  win.eval(fs.readFileSync(DEAD_CONTROLS, "utf8"));

  await new Promise<void>((resolve) => {
    doc.addEventListener("DOMContentLoaded", () => setTimeout(resolve, 0));
  });

  // Read through a widened local: TS narrows `readyState` to "loading" from
  // the guard above and would call this comparison unreachable.
  const stateAfter: string = doc.readyState;
  if (stateAfter !== "complete") {
    throw new Error(`[advanced-search-dom] document never reached 'complete' (${stateAfter})`);
  }

  const advancedRoot = doc.getElementById("searchAdvancedMode");
  if (!advancedRoot) {
    throw new Error("[advanced-search-dom] #searchAdvancedMode not found — markup moved");
  }

  return {
    doc,
    win,
    advancedRoot,
    fireDataReady: () => win.dispatchEvent(new win.Event("mallan:data:ready")),
  };
}

export interface Surface {
  el: Element;
  tag: string;
  /** input type, or the tag name for select/textarea/button. */
  type: string;
  id: string | null;
  dataField: string | null;
  /** Runtime disabled state AFTER production's pass — never inferred. */
  disabled: boolean;
  /** True when a dead container marked this element's ancestry. */
  insideDeadContainer: boolean;
  label: string;
}

/** Best-effort visible label: adjacent text, aria-label, or placeholder. */
function visibleLabel(el: Element): string {
  const aria = el.getAttribute("aria-label");
  if (aria) return aria.trim();
  const ph = el.getAttribute("placeholder");
  if (ph) return ph.trim();
  const sib = el.nextSibling;
  if (sib && sib.nodeType === 3 && sib.textContent?.trim()) return sib.textContent.trim();
  const parentText = el.parentElement?.textContent?.replace(/\s+/g, " ").trim();
  return parentText ? parentText.slice(0, 60) : "";
}

/**
 * Every interactive surface under #searchAdvancedMode, with runtime state read
 * from the live DOM. Enumerates button and [tabindex] surfaces too — the
 * earlier form-field-only scan omitted 23 subway-line buttons in a single
 * container alone.
 */
export function enumerateAdvancedSurfaces(dom: AdvancedDom): Surface[] {
  return Array.from(dom.advancedRoot.querySelectorAll(INTERACTIVE_SELECTOR)).map((el) => {
    const tag = el.tagName.toLowerCase();
    return {
      el,
      tag,
      type: el.getAttribute("type") ?? tag,
      id: el.getAttribute("id"),
      dataField: el.getAttribute("data-field"),
      disabled: (el as HTMLInputElement).disabled === true,
      insideDeadContainer: el.closest("[data-dead-container]") !== null,
      label: visibleLabel(el),
    };
  });
}

// ─── Collector binding (source-derived, DOM-independent) ─────────────────────

/**
 * Ids the REAL `collectSearchCriteria` reads, scoped to that function's own
 * body. Whole-file matching would false-pass on ids appearing only in show/hide,
 * reset, tab or formatting logic.
 */
export function collectorIds(): Set<string> {
  const src = fs.readFileSync(SEARCH_ENGINE, "utf8");
  const start = src.indexOf("function collectSearchCriteria");
  if (start < 0) throw new Error("[advanced-search-dom] collectSearchCriteria not found");
  const open = src.indexOf("{", start);
  let depth = 0;
  let body = "";
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) { body = src.slice(open, i); break; }
  }
  return new Set([...body.matchAll(/getElementById\(\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]));
}

/**
 * Executable binding, per the collector's THREE real mechanisms and the
 * surface's type. `data-field` alone is not binding: neither generic scanner
 * reads a text/date/number input.
 */
export function isBoundByCollector(s: Surface, ids: Set<string>): boolean {
  if (s.id && ids.has(s.id)) return true;
  if (!s.dataField) return false;
  if (s.tag === "select") return true;
  if (s.type === "checkbox" || s.type === "radio") return true;
  return false;
}

// ─── Reconciliation ledger schema ────────────────────────────────────────────

/**
 * STANDING RULE (Maya, 2026-08-11):
 *
 *   No legitimate Search criterion may be deleted or permanently disabled
 *   because its current implementation does not match Cotality. Verify Cotality
 *   first, then amend Mallan end-to-end to the verified field, attribute,
 *   value, type, operator and mapping.
 *
 * The ledger therefore does NOT ask "keep or delete". It asks:
 *   1. what is the intended professional criterion?
 *   2. what does the current authorized Cotality contract actually provide?
 *   3. where does Mallan diverge?
 *   4. exactly what must be amended, at which layer?
 *
 * "Currently disabled" is evidence of UNFINISHED RECONCILIATION, never evidence
 * that a criterion should disappear. Only non-Search UI, true duplicates,
 * obsolete presentation artifacts, or code with no business criterion behind it
 * are removal candidates — and each must be proven, not assumed.
 */

/** Where Mallan diverges from the verified provider contract. */
export type DivergenceLayer =
  | "label"            // visible text implies a different business meaning
  | "data-field"       // wrong provider field referenced
  | "data-value"       // wrong enum/picklist vocabulary (e.g. a literal "Any")
  | "type"             // wrong control/value type for the provider field
  | "collector"        // never read out of the DOM
  | "builder"          // read but never placed on the request
  | "serializer"       // placed on the request but never sent
  | "translator"       // sent but not translated, or translated wrongly
  | "operator"         // wrong comparison/range operation for the field
  | "allowlist"        // translated then rejected by a safe-field gate
  | "result"           // returned data interpreted incorrectly
  | "modelling";       // one criterion wrongly forced into a single field

/**
 * Reconciliation state. Note what is ABSENT by design: there is no "disabled"
 * status and no "retired/delete" status. Runtime disablement is unfinished
 * reconciliation work, not an outcome; and a legitimate professional criterion
 * is never retired because Mallan implemented it wrongly. NON_SEARCH_UI is the
 * only removal-eligible state, and only once proven.
 *
 * MATCHES_COTALITY is reachable ONLY after current provider verification — an
 * existing Mallan mapping proves nothing.
 */
export type ReconciliationStatus =
  | "UNVERIFIED"                 // provider contract not yet checked — the default
  | "MATCHES_COTALITY"           // verified against current Cotality and correct end-to-end
  | "MALLAN_MAPPING_WRONG"       // points at the wrong resource/field/association
  | "MALLAN_VALUE_WRONG"         // wrong enum/picklist vocabulary or formatting
  | "MALLAN_OPERATOR_WRONG"      // wrong comparison/range/query semantics
  | "MALLAN_UI_SEMANTICS_WRONG"  // label implies a different business meaning
  | "LOCAL_DERIVED_VERIFIED"     // legitimately local/derived, verified as such
  | "NON_SEARCH_UI";             // proven non-criterion; only removal-eligible state

export interface CriterionReconciliation {
  criterionId: string;
  /** What the agent is professionally trying to express. */
  intendedMeaning: string;
  surfaces: Surface[];
  /** Runtime state today — never a justification for removal. */
  currentlyDisabled: boolean;
  /** Null until current Cotality verification is actually performed. */
  providerResource: string | null;
  providerField: string | null;
  providerType: string | null;
  providerPicklist: string[] | null;
  providerNullSemantics: string | null;
  providerOperators: string[] | null;
  /** Every layer at which Mallan must change to match the provider. */
  divergences: DivergenceLayer[];
  /** The concrete amendment, once the provider contract is known. */
  amendment: string | null;
  status: ReconciliationStatus;
}
