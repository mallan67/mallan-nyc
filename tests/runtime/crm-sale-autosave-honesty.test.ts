/// <reference types="jest" />
/**
 * The autosave must never say a listing is safe when it is not (SL-0009 lost its address and price while the form read "Draft saved", 2026-11-02).
 *
 *  - a NEW listing has no CRM record: the copy is the browser's, and the indicator says "Kept in this browser only ... not in the CRM yet"
 *  - a SAVED listing: the indicator reads "Saved to the CRM" only once the server accepted the update
 *  - a refusal reads "NOT saved to the CRM" with the reason, as an alert, and leaving the page asks first
 *  - one request at a time: a change made while a save is out is sent after it, so an older, smaller form can never land after a newer one
 *  - a listing that did not load is never replaced by the blank form (no update is sent)
 */
import { bootAddForm, storedListing, sleep, type BootedForm } from "./add-form-harness";
import { completeForm, saveDraft, setValue, waitUntil, loaded } from "./sale-form-filler";

jest.setTimeout(300000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const indicator = (f: BootedForm) => f.d.getElementById("saleAutoSaveIndicator") as HTMLElement;
const text = (f: BootedForm) => (f.d.getElementById("saleAutoSaveText")?.textContent ?? "");
const updates = (f: BootedForm) => f.calls.filter((c) => /^update /.test(c)).length;
const state = (f: BootedForm) => indicator(f)?.dataset.autosaveState ?? "";
const openSaved = async (listing: Record<string, any>, extra: Record<string, any> = {}) => { const f = await bootAddForm("SALE-FORM-REDESIGN", { search: "?id=1", listing, settle: 300, ...extra }); await loaded(f); return f; };

/** A saved condo, as the CRM would hold it, ready to open in edit mode. */
async function savedCondo(): Promise<Record<string, any>> {
  const a = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
  try {
    await completeForm(a);
    return storedListing(await saveDraft(a), "sale");
  } finally { a.close(); }
}

describe("autosave tells the truth", () => {
  it("a new listing: kept in this browser only, not in the CRM; nothing is sent to the server", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 800 });
    try {
      setValue(f, "saleStreetAddress", "800 2nd Ave");
      (f.w as any).performAutoSave();
      expect(indicator(f).dataset.autosaveState).toBe("browser");
      expect(text(f)).toMatch(/browser only.*not in the CRM/i);
      expect(text(f)).not.toMatch(/saved to the crm/i);
      expect(f.w.localStorage.getItem("mallan_draft_sale")).toBeTruthy();
      expect(f.calls.filter((c) => /^(create|update)/.test(c))).toEqual([]);
    } finally { f.close(); }
  });

  it("a saved listing: 'Saved to the CRM' appears only after the server accepted the update, carrying the new value", async () => {
    const listing = await savedCondo();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const f = await openSaved(listing, { updateGate: gate });
    try {
      setValue(f, "salePrice", "1250000");
      (f.w as any).performAutoSave();
      await waitUntil(() => state(f) === "saving");
      expect(state(f)).toBe("saving");                                // the server has not answered
      expect(text(f)).not.toMatch(/saved to the crm/i);
      release();
      await waitUntil(() => state(f) === "saved");
      expect(state(f)).toBe("saved");
      expect(text(f)).toMatch(/Saved to the CRM/);
      expect(String((f.saved[f.saved.length - 1] as any).ListPrice)).toBe("1250000");
    } finally { f.close(); }
  });

  it("a refused save: 'NOT saved to the CRM' with the reason, an alert, and leaving the page asks first", async () => {
    const listing = await savedCondo();
    const f = await openSaved(listing, { updateError: "Session expired" });
    try {
      setValue(f, "salePrice", "1250000");
      (f.w as any).performAutoSave();
      await waitUntil(() => state(f) === "failed");
      expect(text(f)).toMatch(/NOT saved to the CRM: Session expired/);
      expect(indicator(f).getAttribute("role")).toBe("alert");
      expect(text(f)).not.toMatch(/Draft saved/);
      const leave = new f.w.Event("beforeunload", { cancelable: true });
      f.w.dispatchEvent(leave);
      expect(leave.defaultPrevented).toBe(true);                     // typed values are not in the CRM: the browser asks before leaving
    } finally { f.close(); }
  });

  it("one request at a time: a change made while a save is out is sent after it, newest last", async () => {
    const listing = await savedCondo();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const f = await openSaved(listing, { updateGate: gate });
    try {
      setValue(f, "salePrice", "1250000");
      (f.w as any).performAutoSave();                                // request 1 (held)
      await waitUntil(() => updates(f) === 1);
      setValue(f, "salePrice", "1300000");
      (f.w as any).performAutoSave();                                // would be request 2: waits
      await sleep(150);
      expect(updates(f)).toBe(1);                                    // not two in flight
      release();
      await waitUntil(() => updates(f) === 2 && state(f) === "saved");
      const prices = f.saved.map((p: any) => p.ListPrice).filter((x) => x !== undefined).map(String);
      expect(prices).toEqual(["1250000", "1300000"]);                // sent in order; the newest is the last one the server got
    } finally { f.close(); }
  });

  it("a listing that did not load is never replaced by the blank form: no update is sent", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { search: "?id=1", getError: "boom", settle: 1000 });
    try {
      setValue(f, "salePrice", "1");
      (f.w as any).performAutoSave();
      await sleep(100);
      expect(updates(f)).toBe(0);
      expect(f.calls.filter((c) => c === "create")).toEqual([]);
    } finally { f.close(); }
  });
});

describe("autosave does not hammer a refusal that waiting cannot cure", () => {
  it("an ended session (401) says to sign in again instead of promising a retry", async () => {
    const listing = await savedCondo();
    const f = await openSaved(listing, { updateError: "Unauthorized", updateErrorStatus: 401 });
    try {
      setValue(f, "salePrice", "1250000");
      (f.w as any).performAutoSave();
      await waitUntil(() => state(f) === "failed");
      expect(text(f)).toMatch(/Sign in again/);
      expect(text(f)).not.toMatch(/tries again/);
    } finally { f.close(); }
  });
  // The hand saves (Save Draft, Submit) and the autosave all write the same listing: a request already out cannot be recalled, and two out at once can land in the wrong order.
  const handSave = (f: BootedForm, how: "submitSalesListing" | "manualSaveDraft") => (f.w as any)[how]();
  const prices = (f: BootedForm) => f.saved.map((p: any) => p.ListPrice).filter((x) => x !== undefined).map(String);

  for (const how of ["submitSalesListing", "manualSaveDraft"] as const) {
    it(`${how} pressed while an autosave is out waits for it, then sends the form as it is by then (never two requests at once)`, async () => {
      const listing = await savedCondo();
      let release!: () => void;
      const gate = new Promise<void>((r) => { release = r; });
      const f = await openSaved(listing, { updateGate: gate });
      try {
        setValue(f, "salePrice", "1250000");
        (f.w as any).performAutoSave();                              // request 1 (held)
        await waitUntil(() => updates(f) === 1);
        setValue(f, "salePrice", "1300000");
        handSave(f, how);                                            // would be request 2: it waits for the answer
        await sleep(200);
        expect(updates(f)).toBe(1);                                  // not two in flight
        release();
        await waitUntil(() => updates(f) >= 2);
        expect(prices(f)).toEqual(["1250000", "1300000"]);           // the autosave first; the hand save read the form after it, so the newest value is the last one the server got
      } finally { f.close(); }
    });
  }

  it("an autosave that falls due while Save Draft is out waits for the answer, and then sends the newest form", async () => {
    const listing = await savedCondo();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const f = await openSaved(listing, { updateGate: gate });
    try {
      setValue(f, "salePrice", "1250000");
      handSave(f, "manualSaveDraft");                                // request 1 (held)
      await waitUntil(() => updates(f) === 1);
      setValue(f, "salePrice", "1300000");
      (f.w as any).performAutoSave();                                // falls due now: it must not go out beside the Save Draft
      await sleep(200);
      expect(updates(f)).toBe(1);
      release();
      await waitUntil(() => updates(f) === 2 && state(f) === "saved");
      expect(prices(f)).toEqual(["1250000", "1300000"]);
    } finally { f.close(); }
  });

  it("Submit pressed while Save Draft is out is refused (the buttons were free to press twice before)", async () => {
    const listing = await savedCondo();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const f = await openSaved(listing, { updateGate: gate });
    try {
      handSave(f, "manualSaveDraft");                                // held
      await waitUntil(() => updates(f) === 1);
      handSave(f, "submitSalesListing");
      await sleep(200);
      expect(updates(f)).toBe(1);                                    // one save at a time
      release();
      await sleep(300);
      expect(updates(f)).toBe(1);                                    // and the refused one is not sent later behind the first's back
    } finally { f.close(); }
  });

});
