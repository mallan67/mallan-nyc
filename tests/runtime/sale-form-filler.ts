/// <reference types="jest" />
/**
 * Fills the real Sale form the way an agent completes it, driven by the form's OWN Active checklist (collectSaleMissingRequired), so a field the checklist adds is filled
 * with no change here. Shared by the publish-contract and the garage / Tax Lot round-trip tests.
 */
import { bootAddForm, sleep, type BootedForm } from "./add-form-harness";

/** Waits for a condition instead of guessing a delay (a loaded CI machine is slower than any fixed sleep). */
export async function waitUntil(cond: () => boolean, ms = 20000, step = 20): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for the page");
    await sleep(step);
  }
}
/** An edit-mode form is ready once its saved listing has been restored into it. */
export const loaded = (f: BootedForm) => waitUntil(() => (f.w as any)._saleAutoSaveReady === true);
/** Nothing new has been sent for a moment (the follow-up update after a create has landed). */
export async function quiet(f: BootedForm, ms = 250) {
  let n = f.saved.length, since = Date.now();
  while (Date.now() - since < ms) { await sleep(25); if (f.saved.length !== n) { n = f.saved.length; since = Date.now(); } }
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A condo's facts (an agent types these; the checklist's remaining controls get a neutral choice). */
export const REALISTIC: Record<string, string> = {
  saleStreetAddress: "800 2nd Ave", saleBldgYearBuilt: "1960", saleBldgTotalFloors: "20", saleBldgTotalUnits: "120", saleBldgTaxBlock: "1234", saleUnitTaxLot: "1218",
  saleBldgTaxLot: "7502", saleUnitNumber: "806", saleFloorInBuilding: "8", saleZipCode: "10017", salePrice: "1200000", saleRETaxes: "18000",
  saleMaintCC: "1800",
};

const BASE = ["saleStreetAddress", "saleZipCode", "salePrice", "saleBldgTaxLot"];
const PREFER = /^(No|None|Good|Excellent|Monthly|Condo)$/i;

export type Garage = "No" | "Yes" | "unanswered";
export type Scenario = { garage?: Garage; omit?: string[]; type?: string; values?: Record<string, string>; status?: string };

export const change = (f: BootedForm, el: Element) => el.dispatchEvent(new f.w.Event("change", { bubbles: true }));
export const missing = (f: BootedForm): any[] => (f.w as any).collectSaleMissingRequired();
export const pickRadio = (f: BootedForm, name: string, value: string) => {
  const r = f.d.querySelector(`input[name="${name}"][value="${value}"]`) as HTMLInputElement;
  r.checked = true; change(f, r);
};
export const setValue = (f: BootedForm, id: string, value: string) => {
  const el = f.d.getElementById(id) as HTMLInputElement | HTMLSelectElement;
  el.value = value;
  el.dispatchEvent(new f.w.Event("input", { bubbles: true }));
  change(f, el);
};
export const val = (f: BootedForm, id: string) => (f.d.getElementById(id) as HTMLInputElement | null)?.value ?? null;
export const checkedValue = (f: BootedForm, name: string) => (f.d.querySelector(`input[name="${name}"]:checked`) as HTMLInputElement | null)?.value ?? null;

function fillOne(f: BootedForm, m: any, garage: Garage, values: Record<string, string>) {
  const field = m.field;
  if (field.type === "garage") {
    if (garage !== "unanswered") pickRadio(f, "saleGarageSpaces", garage);
    return;
  }
  if (field.type === "checkboxGroup" || field.type === "radio") {
    const all = [...f.d.querySelectorAll(`input[name="${field.name}"]`)] as HTMLInputElement[];
    const pick = all.find((r) => PREFER.test(r.value)) || all[0];
    if (pick) { pick.checked = true; change(f, pick); }
    return;
  }
  const el = f.d.getElementById(field.id) as any;
  if (!el) return;
  if (values[field.id] !== undefined) { el.value = values[field.id]; change(f, el); return; }
  if (el.tagName === "SELECT") {
    const opts = [...el.options].filter((o: any) => o.value && o.value !== "Draft" && o.value !== "Fair");
    const pick = opts.find((o: any) => PREFER.test(o.value)) || opts[0];
    if (pick) el.value = pick.value;
  } else if (el.type === "date") el.value = field.id === "saleActivationDate" ? new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10) : "2027-01-15";   // Coming Soon allows 14 days at most
  else if (el.type === "number") el.value = "2";
  else el.value = "x";
  change(f, el);
}

/** A unit type's ownership is what its name says; every other type is left to the Active checklist (a house has no condominium or co-op ownership to assume). */
export const OWNERSHIP: Record<string, string> = { Condo: "Condominium", Coop: "StockCooperative", Condop: "Condop" };

/** Completes a booted form: the property type, the condo's facts, then whatever the Active checklist still names (never an `omit`ted one). */
export async function completeForm(f: BootedForm, s: Scenario = {}) {
  const type = f.d.querySelector(`input[name="salePropertyType"][value="${s.type ?? "Condo"}"]`) as HTMLInputElement;
  type.checked = true; change(f, type);
  const typeName = s.type ?? "Condo";
  const values: Record<string, string> = { ...REALISTIC, ...(OWNERSHIP[typeName] ? { saleCommonInterest: OWNERSHIP[typeName] } : {}), ...(s.values ?? {}) };
  // Only the facts every listing starts with are typed up front; every other value is typed when, and only when, the Active checklist asks for it (so a box the
  // checklist does not ask for stays empty, and the server then shows what the checklist missed).
  for (const id of BASE) {
    if (s.omit?.includes(id) || values[id] === undefined) continue;
    const el = f.d.getElementById(id) as any;
    if (el) { el.value = values[id]; change(f, el); }
  }
  const drain = async () => {
    for (let p = 0; p < 8 && missing(f).length; p++) {
      for (const m of missing(f)) if (!s.omit?.includes(m.field.id)) fillOne(f, m, s.garage ?? "No", values);
      await sleep(30);
    }
  };
  await drain();
  if (s.status) {                                                      // the status is chosen last (a move to a live status is refused while the form is incomplete), then what it brings is filled
    const st = f.d.getElementById("saleStatus") as HTMLSelectElement;
    st.value = s.status; change(f, st);
    await sleep(30);
    await drain();
  }
}

/** Saves the form through its real submit path (as a Draft) and returns what it posted, merged the way the server holds it. */
export async function saveDraft(f: BootedForm): Promise<Record<string, any>> {
  const w: any = f.w;
  const before = f.saved.length;
  w.parseSaleAddress();
  (f.d.getElementById("saleStatus") as HTMLSelectElement).value = "Draft";
  await w.submitSalesListing();
  await waitUntil(() => f.saved.length > before && !w._saleSendInFlight);   // the save was sent and answered
  await quiet(f);                                                           // and the follow-up update (the workflow status) has landed
  // the form posts the full payload, then a one-key follow-up update (_crmWorkflowStatus): the server ends up holding both
  return Object.assign({}, ...f.saved.slice(before)) as Record<string, any>;
}

/** Fills a fresh form per `s`, saves it, and returns the checklist's verdict and the payload the form posted. */
export async function postedByTheForm(s: Scenario = {}) {
  const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
  try {
    await completeForm(f, s);
    const gate = missing(f).map((m: any) => m.label) as string[];      // what the checklist still asks, with the status the agent chose (the save below sets Draft)
    const body = await saveDraft(f);
    return { gate, body, errors: [...new Set(f.errors)] };
  } finally { f.close(); }
}
