/// <reference types="jest" />
/**
 * "It saves as a draft, it does not go live" (Maya, 2026-11-03).
 *
 * A new listing is created as a Draft; the move to Active is a second request the SERVER may refuse (REBNY required fields, Fair Housing wording, the RLS rules). The form used to show
 * "Saved as Draft. Publish failed: <one line>" and send the agent back to the list 1.5 seconds later, so the reason (which fields) was never read. Now the refusal is said in words, each
 * field named, in a message that waits to be dismissed, and the agent stays on the form with the listing open for editing.
 */
import { bootAddForm, sleep, storedListing, type BootedForm } from "./add-form-harness";
import { completeForm, saveDraft, loaded, waitUntil } from "./sale-form-filler";

jest.setTimeout(300000);
/* eslint-disable @typescript-eslint/no-explicit-any */

async function submitAs(f: BootedForm, status: string) {
  (f.d.getElementById("saleStatus") as HTMLSelectElement).value = status;
  await (f.w as any).submitSalesListing();
  await waitUntil(() => !(f.w as any)._saleSendInFlight && f.statusCalls.length > 0);
}
const navigated = (f: BootedForm) => f.errors.some((e) => /navigation/i.test(e));
const panel = (f: BootedForm) => f.d.getElementById("salePublishRefusal");

describe("the server refuses to publish a new listing", () => {
  const refusal = {
    statusError: "Status change blocked by REBNY validation — the listing is missing required fields",
    statusDetails: { error: "Status change blocked by REBNY validation — the listing is missing required fields", validation: { valid: false, errors: ["[REBNY] Required field missing: ShowingInstructions", "[REBNY] Required field missing: Heating"], warnings: [], suggestions: [] } },
  };

  it("names every refused field in a message that waits for the agent, says the listing is a Draft and NOT live, and does not redirect away", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600, ...refusal });
    try {
      await completeForm(f, { type: "Condo", garage: "No" });
      await submitAs(f, "Active");
      await sleep(2200);                                                    // longer than the old 1.5 s redirect
      expect(f.statusCalls.length).toBe(1);
      expect(panel(f)).not.toBeNull();                                         // still there after the 4 s a toast lasts and the old 1.5 s redirect
      const text = panel(f)!.textContent ?? "";
      expect(text).toMatch(/Saved as a Draft\. It is NOT live/);
      expect(text).toContain("Status change blocked by REBNY validation");
      expect(text).toContain("Required field missing: ShowingInstructions");
      expect(text).toContain("Required field missing: Heating");
      expect(text).not.toContain("[REBNY]");
      expect([...panel(f)!.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["Required field missing: ShowingInstructions", "Required field missing: Heating"]);
      expect(navigated(f)).toBe(false);                                       // still on the form
      (panel(f)!.querySelector("button") as HTMLButtonElement).click();       // the agent closes it when they have read it
      expect(panel(f)).toBeNull();
      expect((f.w as any)._saleEditMode).toBe(true);                          // the saved listing is open: the next Submit updates it
    } finally { f.close(); }
  });

  it("names the wording blockers too (Fair Housing / UCBA), field and message", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", {
      settle: 600,
      statusError: "Status change blocked by Fair Housing content gate — fix the flagged wording before publishing",
      statusDetails: { error: "Status change blocked by Fair Housing content gate — fix the flagged wording before publishing", blockers: [{ code: "FH-1", severity: "BLOCKER", field: "PublicRemarks", message: "no children" }] },
    });
    try {
      await completeForm(f, { type: "Condo", garage: "No" });
      await submitAs(f, "Active");
      expect(panel(f)!.textContent).toContain("PublicRemarks: no children");
    } finally { f.close(); }
  });

  it("a toast now lasts as long as the page asked: the 15 s 'Publish failed' toast is no longer cut to 4 s", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600, ...refusal });
    try {
      await completeForm(f, { type: "Condo", garage: "No" });
      await submitAs(f, "Active");
      await sleep(5200);
      const toasts = [...f.d.querySelectorAll(".mallan-toast")].map((t) => t.textContent ?? "");
      expect(toasts.some((t) => /Publish failed/.test(t))).toBe(true);
    } finally { f.close(); }
  });

  it("an Active listing whose move to another status is refused is still Active: the panel says so, not that it is a Draft and not live", async () => {
    const a = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
    let payload: Record<string, any>;
    try { await completeForm(a, { type: "Condo", garage: "No" }); payload = await saveDraft(a); } finally { a.close(); }
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 300, search: "?id=1", listing: { ...storedListing(payload, "sale"), status: "Active" }, updated: { status: "Active" }, ...refusal });
    try {
      await loaded(f);
      await submitAs(f, "Pending");
      const text = panel(f)!.textContent ?? "";
      expect(text).toMatch(/still Active/);
      expect(text).not.toMatch(/NOT live/);
      expect(text).not.toMatch(/Saved as a Draft/);
      expect(text).toContain("Required field missing: Heating");
    } finally { f.close(); }
  });

  it("a refusal that carries no list still says what the server said", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600, statusError: "Invalid status transition: Draft → Active" });
    try {
      await completeForm(f, { type: "Condo", garage: "No" });
      await submitAs(f, "Active");
      expect(panel(f)!.textContent).toContain("Invalid status transition: Draft → Active");
      expect(panel(f)!.textContent).toMatch(/NOT live/);
    } finally { f.close(); }
  });
});

describe("a publish the server accepts, and a plain Draft, are unchanged", () => {
  it("accepted: no refusal message, and the form goes back to the list as before", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600, statusAnswer: { status: "Active" } });
    try {
      await completeForm(f, { type: "Condo", garage: "No" });
      await submitAs(f, "Active");
      await sleep(2200);
      expect(panel(f)).toBeNull();
      expect(navigated(f)).toBe(true);                                        // control: the redirect still happens when nothing was refused
    } finally { f.close(); }
  });

  it("a Draft the agent chose to keep as a Draft is not a refusal: no status request, no message", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
    try {
      await completeForm(f, { type: "Condo", garage: "No" });
      (f.d.getElementById("saleStatus") as HTMLSelectElement).value = "Draft";
      await (f.w as any).submitSalesListing();
      await waitUntil(() => f.saved.length > 0 && !(f.w as any)._saleSendInFlight);
      await sleep(300);
      expect(f.statusCalls.length).toBe(0);
      expect(panel(f)).toBeNull();
    } finally { f.close(); }
  });
});
