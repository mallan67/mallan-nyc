/// <reference types="jest" />
/**
 * SEARCH-P0-001 §F — real-DOM harness integrity, and the runtime-state
 * invariants that depend on it.
 *
 * All DOM truth here comes from `lib/search/testing/advanced-search-dom.ts`,
 * which loads the real Search markup into JSDOM and EXECUTES the real
 * `init-disable-dead-controls.js` against it under the lifecycle that script
 * actually depends on. Nothing in this file re-derives disabled state from
 * source text, regex, or id-prefix guessing — an earlier harness did, and it
 * reached the wrong answer because production disables the DESCENDANTS of dead
 * containers and resolves its grid anchor through a real `parentElement`.
 *
 * SCOPE: raw runtime truth only. No surface is grouped into a business
 * criterion here; that is a separate later layer. A/B/C/E prove the harness
 * itself is trustworthy before anything is built on top of it.
 */

import {
  loadAdvancedSearchDom,
  enumerateAdvancedSurfaces,
  collectorIds,
  isBoundByCollector,
  INTERACTIVE_SELECTOR,
} from "../testing/advanced-search-dom";

describe("§F harness integrity — real production disabling in a real DOM", () => {
  test("A. adv-grid-north is resolved through the actual DOM parent, not a name prefix", async () => {
    const { doc } = await loadAdvancedSearchDom();
    const anchor = doc.getElementById("adv-grid-north");
    expect(anchor).not.toBeNull();

    // Production does getElementById(idAnchor).parentElement and disables that
    // container's descendants. Assert the real node relationship.
    const parent = anchor!.parentElement;
    expect(parent).not.toBeNull();
    expect(parent!.getAttribute("data-dead-container")).toBe("true");

    // Count is deliberately not asserted: production resolves a DOM
    // relationship and this test observes it rather than presuming a shape.
    const kids = Array.from(parent!.querySelectorAll(INTERACTIVE_SELECTOR));
    expect(kids.length).toBeGreaterThan(0);
    const notDisabled = kids.filter((k) => !(k as HTMLInputElement).disabled);
    expect(notDisabled.map((k) => (k as HTMLElement).id || k.tagName)).toEqual([]);
  });

  test("B. LIRR/Ferry/Bus are disabled through their ancestor, not by their own attributes", async () => {
    const { doc } = await loadAdvancedSearchDom();
    const container = doc.getElementById("advancedTransitExpand");
    expect(container).not.toBeNull();

    const boxes = Array.from(
      container!.querySelectorAll('input[type="checkbox"]'),
    ) as HTMLInputElement[];
    expect(boxes.length).toBeGreaterThanOrEqual(3);

    for (const box of boxes) {
      // No independent disable signal of its own.
      expect(box.getAttribute("data-field")).toBeNull();
      // Yet production disables it, through the ancestor container.
      expect(box.disabled).toBe(true);
      expect(box.getAttribute("aria-disabled")).toBe("true");
      expect(box.getAttribute("tabindex")).toBe("-1");
    }
  });

  test("C. subway-line button surfaces exist in the raw inventory and are disabled", async () => {
    const dom = await loadAdvancedSearchDom();
    const container = dom.doc.getElementById("advancedTransitExpand")!;
    const buttons = Array.from(container.querySelectorAll("button")) as HTMLButtonElement[];
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.filter((b) => !b.disabled).map((b) => b.textContent?.trim() || "(unlabelled)"))
      .toEqual([]);

    // And they are present in the shared surface enumeration — the earlier
    // form-field-only scan omitted every one of them.
    const surfaces = enumerateAdvancedSurfaces(dom);
    const inEnum = surfaces.filter((s) => buttons.includes(s.el as HTMLButtonElement));
    expect(inEnum.length).toBe(buttons.length);
    expect(inEnum.every((s) => s.disabled && s.insideDeadContainer)).toBe(true);
  });

  test("E. re-running on mallan:data:ready is idempotent", async () => {
    const dom = await loadAdvancedSearchDom();
    const container = dom.doc.getElementById("advancedTransitExpand")!;
    const before = container.querySelectorAll(INTERACTIVE_SELECTOR).length;
    expect(container.querySelectorAll("[data-dead-container-notice]").length).toBe(1);

    dom.fireDataReady();
    dom.fireDataReady();

    expect(container.querySelectorAll("[data-dead-container-notice]").length).toBe(1);
    expect(container.querySelectorAll(INTERACTIVE_SELECTOR).length).toBe(before);
    expect(
      Array.from(container.querySelectorAll(INTERACTIVE_SELECTOR))
        .filter((k) => !(k as HTMLInputElement).disabled).length,
    ).toBe(0);
  });
});

/**
 * DEFECT 9 — found by this harness, not by inspection.
 *
 * `init-disable-dead-controls.js` neutralises the Manhattan grid by taking
 * `getElementById(idAnchor).parentElement`, on its stated assumption that the
 * anchor's parent is "the column container (the parent we disable) ... (3 more
 * sibling selects for east/south/west)".
 *
 * That assumption holds for `bldg-grid-*` — all four are disabled. It does NOT
 * hold for `adv-grid-*`: the Advanced markup places north/south/east/west in
 * separate sibling containers, so only `adv-grid-north` is disabled and the
 * other three remain ENABLED on a surface production intends to neutralise.
 *
 * The stated rationale for neutralising the grid (feed coordinates) is recorded
 * in production comments and is NOT verified provider truth. Provider
 * verification has not started; nothing here asserts a Cotality fact.
 */
describe("DEFECT 9 — Advanced Manhattan-grid neutralisation is incomplete", () => {
  const enabledOf = (doc: Document, ids: string[]) =>
    ids
      .map((id) => doc.getElementById(id) as HTMLSelectElement | null)
      .filter((el): el is HTMLSelectElement => el !== null)
      .filter((el) => !el.disabled)
      .map((el) => el.id);

  test("RED — all four Advanced grid controls should be neutralised", async () => {
    const { doc } = await loadAdvancedSearchDom();
    expect(
      enabledOf(doc, ["adv-grid-north", "adv-grid-south", "adv-grid-east", "adv-grid-west"]),
    ).toEqual([]);
  });

  test("control case — the building grid satisfies the same mechanism", async () => {
    const { doc } = await loadAdvancedSearchDom();
    expect(
      enabledOf(doc, ["bldg-grid-north", "bldg-grid-south", "bldg-grid-east", "bldg-grid-west"]),
    ).toEqual([]);
  });
});

/**
 * DEFECT 7/8 — restated on RUNTIME state.
 *
 * Previously these were computed from a regex mirror of the disable contract,
 * which mis-classified controls disabled through ancestry. They now read the
 * live DOM after production's own pass: a surface is excused only if production
 * actually disabled it.
 *
 * Still in scope-limit: this proves DOM -> collector binding only. A surface
 * counted bound may still die in builder, serializer, backend or provider
 * translation. No business-criterion grouping and no counts are asserted here.
 */
describe("DEFECT 7/8 — every active Advanced surface needs an executable binding", () => {
  test("no runtime-enabled Advanced surface is unreadable by the collector", async () => {
    const dom = await loadAdvancedSearchDom();
    const ids = collectorIds();
    const unbound = enumerateAdvancedSurfaces(dom)
      // Production's own runtime decision is the only disable authority.
      .filter((s) => !s.disabled && !s.insideDeadContainer)
      // Buttons are actions unless proven criterion surfaces; classifying them
      // belongs to the ledger layer, not here.
      .filter((s) => s.tag !== "button")
      .filter((s) => !isBoundByCollector(s, ids));

    expect(unbound.map((s) => s.id ?? `${s.tag}[${s.type}] "${s.label.slice(0, 40)}"`)).toEqual([]);
  });
});
