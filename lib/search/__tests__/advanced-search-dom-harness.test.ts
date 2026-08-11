/// <reference types="jest" />
/**
 * SEARCH-P0-001 §F — real-DOM harness integrity.
 *
 * The previous inventory classified each control by its OWN attributes and
 * mirrored production's disable contract with a source-text regex. Both were
 * wrong: production's `init-disable-dead-controls.js` disables the DESCENDANTS
 * of dead containers, so a control with no `disabled` attribute — and matching
 * no direct dead selector — is still disabled at runtime through its ancestor.
 *
 * This harness therefore does NOT model the contract. It loads the real Search
 * HTML into JSDOM and EXECUTES the real production script against it, then
 * reads the resulting runtime state (`disabled`, `aria-disabled`,
 * `data-dead-container`, `tabindex`). There is no second implementation to
 * drift from production.
 *
 * SCOPE: raw runtime truth only. Nothing here groups surfaces into business
 * criteria — that is a later, separate layer. A/B/C/E prove the harness itself
 * is trustworthy before any surface ledger is built on top of it.
 *
 * PRODUCTION LIFECYCLE (reproduced, not guessed) — from the script's own tail:
 *     if (document.readyState === 'loading')
 *         document.addEventListener('DOMContentLoaded', disableDeadControls);
 *     else disableDeadControls();
 *     window.addEventListener('mallan:data:ready', disableDeadControls);
 */

import * as fs from "fs";
import * as path from "path";
import { JSDOM } from "jsdom";

const REPO = path.resolve(__dirname, "../../..");
const SEARCH_FORM = path.join(REPO, "public/crm/html/search-form-and-results.html");
const DEAD_CONTROLS = path.join(REPO, "public/crm/js/init/init-disable-dead-controls.js");

/**
 * Load the real Search markup and run the real disable script inside it.
 * `runScripts: "outside-only"` gives us a window we can evaluate into without
 * executing any other inline page script.
 */
async function loadRealDom(): Promise<{ doc: Document; win: Window & typeof globalThis }> {
  const html = fs.readFileSync(SEARCH_FORM, "utf8");
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const win = dom.window as unknown as Window & typeof globalThis;
  const doc = dom.window.document;

  // LIFECYCLE — this is load-bearing, not ceremony.
  //
  // At eval time JSDOM reports readyState "loading", so the production script
  // takes its `addEventListener('DOMContentLoaded', ...)` branch rather than
  // running inline. Inspecting immediately after eval therefore observes an
  // UNDISABLED document and silently "proves" the opposite of the truth: 0
  // containers marked, 0/3 transit checkboxes disabled, 0/23 buttons disabled.
  // We must wait for the event the script actually registered for.
  expect(doc.readyState).toBe("loading");
  win.eval(fs.readFileSync(DEAD_CONTROLS, "utf8"));
  await new Promise<void>((resolve) => {
    doc.addEventListener("DOMContentLoaded", () => setTimeout(resolve, 0));
  });
  expect(doc.readyState).toBe("complete");

  return { doc, win };
}

/** Interactive surfaces production itself considers disable-able. */
const INTERACTIVE = "input, select, button, textarea, [tabindex]";

describe("§F harness integrity — real production disabling in a real DOM", () => {
  test("A. adv-grid-north is resolved through the actual DOM parent, not a name prefix", async () => {
    const { doc } = await loadRealDom();
    const anchor = doc.getElementById("adv-grid-north");
    expect(anchor).not.toBeNull();

    // Production does: getElementById(idAnchor).parentElement -> disable that
    // container's descendants. Assert via the real node relationship.
    const parent = anchor!.parentElement;
    expect(parent).not.toBeNull();
    expect(parent!.getAttribute("data-dead-container")).toBe("true");

    // Every interactive descendant of that REAL parent node is disabled. The
    // count is not asserted: production resolves a DOM relationship, and this
    // test must observe it rather than presume a shape. (In the Advanced grid
    // that parent holds exactly one select — see DEFECT 9 below.)
    const kids = Array.from(parent!.querySelectorAll(INTERACTIVE));
    expect(kids.length).toBeGreaterThan(0);
    const notDisabled = kids.filter((k) => !(k as HTMLInputElement).disabled);
    expect(notDisabled.map((k) => (k as HTMLElement).id || k.tagName)).toEqual([]);
  });

  /**
   * DEFECT 9 — discovered by this harness, not by inspection.
   *
   * `init-disable-dead-controls.js` disables the Manhattan grid by taking
   * `getElementById(idAnchor).parentElement`, on the stated assumption that the
   * anchor's parent is "the column container (the parent we disable) ... (3 more
   * sibling selects for east/south/west)".
   *
   * That holds for `bldg-grid-*`, where all four selects are disabled. It does
   * NOT hold for `adv-grid-*`: in the Advanced markup each select sits in its
   * own <div>, so the anchor's parent contains exactly one control and the
   * other three stay ENABLED — on a panel declared unsupported because the
   * REBNY feed carries no listing coordinates.
   *
   * Three enabled grid inputs on a knowingly dead surface is precisely the UX
   * trap this module exists to prevent.
   */
  test("DEFECT 9 (RED) — all four Advanced Manhattan-grid selects must be disabled", async () => {
    const { doc } = await loadRealDom();
    const grid = ["adv-grid-north", "adv-grid-south", "adv-grid-east", "adv-grid-west"];
    const enabled = grid
      .map((id) => doc.getElementById(id) as HTMLSelectElement | null)
      .filter((el): el is HTMLSelectElement => el !== null)
      .filter((el) => !el.disabled)
      .map((el) => el.id);
    expect(enabled).toEqual([]);
  });

  test("the building grid proves the fix is structural, not transit-specific", async () => {
    const { doc } = await loadRealDom();
    // Same idAnchor mechanism, markup that matches production's assumption.
    // This is the control case: it must stay green while DEFECT 9 is red.
    const enabled = ["bldg-grid-north", "bldg-grid-south", "bldg-grid-east", "bldg-grid-west"]
      .map((id) => doc.getElementById(id) as HTMLSelectElement | null)
      .filter((el): el is HTMLSelectElement => el !== null)
      .filter((el) => !el.disabled)
      .map((el) => el.id);
    expect(enabled).toEqual([]);
  });

  test("B. LIRR/Ferry/Bus are disabled through their ancestor, not by their own attributes", async () => {
    const { doc } = await loadRealDom();
    const container = doc.getElementById("advancedTransitExpand");
    expect(container).not.toBeNull();

    const boxes = Array.from(
      container!.querySelectorAll('input[type="checkbox"]'),
    ) as HTMLInputElement[];
    expect(boxes.length).toBeGreaterThanOrEqual(3);

    for (const box of boxes) {
      // The control carries no independent disable signal of its own: no
      // data-field for a direct selector to match, and no static attribute.
      expect(box.getAttribute("data-field")).toBeNull();
      // Yet production disables it, through the ancestor container.
      expect(box.disabled).toBe(true);
      expect(box.getAttribute("aria-disabled")).toBe("true");
      expect(box.getAttribute("tabindex")).toBe("-1");
    }
  });

  test("C. subway-line button surfaces exist in the raw inventory and are disabled", async () => {
    const { doc } = await loadRealDom();
    const container = doc.getElementById("advancedTransitExpand");
    const buttons = Array.from(container!.querySelectorAll("button")) as HTMLButtonElement[];

    // These are real interactive Advanced surfaces the previous form-field-only
    // inventory omitted entirely.
    expect(buttons.length).toBeGreaterThan(0);
    const enabled = buttons.filter((b) => !b.disabled);
    expect(enabled.map((b) => b.textContent?.trim() || "(unlabelled)")).toEqual([]);
  });

  test("E. re-running on mallan:data:ready is idempotent", async () => {
    const { doc, win } = await loadRealDom();
    const container = doc.getElementById("advancedTransitExpand")!;
    const noticesAfterFirst = container.querySelectorAll("[data-dead-container-notice]").length;
    const disabledAfterFirst = container.querySelectorAll(INTERACTIVE).length;
    expect(noticesAfterFirst).toBe(1);

    // Production re-runs the whole pass when late-rendered panels arrive.
    win.dispatchEvent(new win.Event("mallan:data:ready"));
    win.dispatchEvent(new win.Event("mallan:data:ready"));

    // No duplicate notice, no lost disable state, no surface count drift.
    expect(container.querySelectorAll("[data-dead-container-notice]").length).toBe(1);
    expect(container.querySelectorAll(INTERACTIVE).length).toBe(disabledAfterFirst);
    const stillEnabled = Array.from(container.querySelectorAll(INTERACTIVE))
      .filter((k) => !(k as HTMLInputElement).disabled);
    expect(stillEnabled.length).toBe(0);
  });
});
