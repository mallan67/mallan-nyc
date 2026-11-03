/// <reference types="jest" />
/**
 * Maya, 2026-11-03: (1) the buyer's agent compensation is missing from the Sale form: the owner offers it, usually a percent (2%, 2.5%, 3%) and the number, built like the seller's agent commission
 * beside it; blank means the owner offers none; it is internal only, not shared via the system; (2) Concessions is a rental term (usually one month free rent), not a sale term; (3) remove the
 * Commission Negotiability Disclosure box from the Sale form (the agreements are in place); (4) no Owner Pays / Buyer Pays choice: what a buyer pays their own agent is not the listing agent's business.
 *
 * The compensation is Mallan's own record (a mallan-internal pair), never a Cotality / RLS field: the NAR-settlement removed fields (BuyerAgency* / SubAgency*) stay out of every payload.
 */
import { bootAddForm, storedListing, type BootedForm } from "./add-form-harness";
import { completeForm, saveDraft, setValue, val, missing, loaded } from "./sale-form-filler";
import { validateListing, publishBlockingErrors } from "@/lib/compliance/rebny-validator";
import { REBNY_FIELD_TABLES } from "@/lib/compliance/rebny-field-tables";
import { dbListingToPublicDTO, type DbListing } from "@/lib/idx/db-to-public-dto";
import { sanitizeForPublic, sanitizeForPortal, sanitizeForVOW } from "@/lib/compliance/dto";

jest.setTimeout(300000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const typeBox = (f: BootedForm) => f.d.getElementById("saleBuyerCompType") as HTMLSelectElement;
const options = (el: HTMLSelectElement) => [...el.options].map((o) => `${o.value}=${o.textContent}`);

const label = (f: BootedForm, id: string) => (f.d.querySelector(`label[for="${id}"]`)?.textContent ?? "").replace(/\s+/g, " ").replace(/\*/g, "").trim();
const checkedValue = (f: BootedForm, name: string) => (f.d.querySelector(`input[name="${name}"]:checked`) as HTMLInputElement | null)?.value ?? null;

describe("the Commission Information section follows RealPlus's Exclusive Agent Side and Buyer Agent Side (Maya's screenshot, 2026-11-03)", () => {
  it("each side has the same two labeled fields: a Compensation Type (% by default) and a Commission number", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
    try {
      expect(label(f, "saleExclusiveCommissionType")).toBe("Exclusive Agent Compensation Type");
      expect(label(f, "saleExclusiveCommission")).toBe("Exclusive Agent Commission");
      expect(label(f, "saleBuyerCompType")).toBe("Buyer Agent Compensation Type");
      expect(label(f, "saleBuyerComp")).toBe("Buyer Agent Commission");
      const seller = f.d.getElementById("saleExclusiveCommissionType") as HTMLSelectElement;
      expect(options(typeBox(f))).toEqual(options(seller));
      expect(options(typeBox(f))).toEqual(["Percent=%", "Dollars=$"]);
      expect(typeBox(f).value).toBe("Percent");
      const num = f.d.getElementById("saleBuyerComp") as HTMLInputElement;
      expect(num.type).toBe("number");
      expect(num.step).toBe("any");                                                   // 2.5 is a valid offer
    } finally { f.close(); }
  });

  it("the Buyer Agent Side has RealPlus's Options and Commission Type choices, with RealPlus's defaults", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
    try {
      const text = (name: string) => [...f.d.querySelectorAll(`input[name="${name}"]`)].map((r) => (r.closest("label")?.textContent ?? "").trim());
      expect(text("saleBuyerAgentOption")).toEqual(["Enter Buyer Agent Comm Info", "Contact Agent"]);
      expect(text("saleBuyerAgentPays")).toEqual(["Owner Pays (to Buyer's Agent)", "Collect Your Own Fee"]);
      expect(checkedValue(f, "saleBuyerAgentOption")).toBe("EnterCommInfo");
      expect(checkedValue(f, "saleBuyerAgentPays")).toBe("OwnerPays");
    } finally { f.close(); }
  });

  it.each([["2"], ["2.5"], ["3"]])("the usual owner offer of %s%% is saved as typed, as a percent", async (pct) => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
    try {
      setValue(f, "saleBuyerComp", pct);
      const d = (f.w as any).collectSaleFormData();
      expect([d.saleBuyerCompType, d.saleBuyerComp]).toEqual(["Percent", pct]);
    } finally { f.close(); }
  });

  it("a dollar offer is saved as dollars", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
    try {
      typeBox(f).value = "Dollars";
      setValue(f, "saleBuyerComp", "36000");
      const d = (f.w as any).collectSaleFormData();
      expect([d.saleBuyerCompType, d.saleBuyerComp]).toEqual(["Dollars", "36000"]);
    } finally { f.close(); }
  });

  it("the red marks are real: with the owner paying and the info entered (RealPlus's defaults) the checklist asks for the Buyer Agent Commission, and Commission Type is always asked", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
    try {
      const asked = missing(f).map((m: any) => m.label);
      expect(asked).toContain("Buyer Agent Commission");
      expect(asked).not.toContain("Buyer Agent Commission Type");                        // answered by RealPlus's default (Owner Pays)
      (f.d.querySelector('input[name="saleBuyerAgentPays"]:checked') as HTMLInputElement).checked = false;
      expect(missing(f).map((m: any) => m.label)).toContain("Buyer Agent Commission Type");
    } finally { f.close(); }
  });

  it("blank is allowed when the owner offers none: Collect Your Own Fee, or Contact Agent, leaves the number blank and unasked", async () => {
    for (const [name, value] of [["saleBuyerAgentPays", "CollectOwnFee"], ["saleBuyerAgentOption", "ContactAgent"]] as const) {
      const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
      try {
        (f.d.querySelector(`input[name="${name}"][value="${value}"]`) as HTMLInputElement).checked = true;
        await completeForm(f, { type: "Condo", garage: "No" });
        expect(val(f, "saleBuyerComp")).toBe("");
        expect(missing(f)).toEqual([]);
        const p = await saveDraft(f);
        expect(p.saleBuyerComp ?? "").toBe("");
      } finally { f.close(); }
    }
  });

  it("a complete form with the owner paying 3% needs nothing more, and saves it", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
    try {
      await completeForm(f, { type: "Condo", garage: "No" });
      setValue(f, "saleBuyerComp", "3");
      expect(missing(f)).toEqual([]);
      const p = await saveDraft(f);
      expect([p.saleBuyerCompType, p.saleBuyerComp, p.saleBuyerAgentPays, p.saleBuyerAgentOption]).toEqual(["Percent", "3", "OwnerPays", "EnterCommInfo"]);
    } finally { f.close(); }
  });

  it("saved and reopened, it comes back as it was", async () => {
    const a = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
    let p: Record<string, any>;
    try {
      await completeForm(a, { type: "Condo", garage: "No" });
      typeBox(a).value = "Percent"; setValue(a, "saleBuyerComp", "2.5");
      (a.d.querySelector('input[name="saleBuyerAgentPays"][value="CollectOwnFee"]') as HTMLInputElement).checked = true;
      (a.d.querySelector('input[name="saleBuyerAgentOption"][value="ContactAgent"]') as HTMLInputElement).checked = true;
      p = await saveDraft(a);
    } finally { a.close(); }
    const b = await bootAddForm("SALE-FORM-REDESIGN", { search: "?id=1", listing: storedListing(p, "sale"), settle: 300 });
    try {
      await loaded(b);
      expect(val(b, "saleBuyerComp")).toBe("2.5");
      expect(val(b, "saleBuyerCompType")).toBe("Percent");
      expect(checkedValue(b, "saleBuyerAgentPays")).toBe("CollectOwnFee");
      expect(checkedValue(b, "saleBuyerAgentOption")).toBe("ContactAgent");
    } finally { b.close(); }
  });

  it("it stays Mallan's: no Cotality / RLS compensation field (the NAR-settlement removed fields included) is in the saved payload", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
    try {
      await completeForm(f, { type: "Condo", garage: "No" });
      setValue(f, "saleBuyerComp", "2.5");
      const p = await saveDraft(f);
      for (const k of ["BuyerAgencyCompensation", "BuyerAgencyCompensationType", "SubAgencyCompensation", "SubAgencyCompensationType", "BuyerBrokerageCompensation", "BuyerBrokerageCompensationType", "TransactionBrokerCompensation"]) {
        expect(p).not.toHaveProperty(k);
      }
      expect(p.saleBuyerComp).toBe("2.5");
    } finally { f.close(); }
  });

});

describe("buyer's agent compensation is never published (negative proof, Master 5.1.1)", () => {
  const row = (): DbListing => ({
    id: "1", listing_id: "SL-0042", status: "Active", listing_type: "sale", property_type: "Residential", property_sub_type: "Condo", list_price: "1000000",
    bedrooms_total: 2, bathrooms_full: 2, bathrooms_half: 0, living_area: "1000", borough: "Manhattan", neighborhood: "Midtown",
    address: {}, features: {}, media: [], agent_info: {}, rls_eligible: true,
    raw_data: { saleBuyerComp: "2.375", saleBuyerCompType: "Percent", saleExclusiveCommission: "5.125" },
    created_at: new Date("2026-01-01T00:00:00.000Z"), listing_contract_date: null, modification_timestamp: new Date("2026-01-01T00:00:00.000Z"),
  } as unknown as DbListing);

  it("the public DTO and every sanitized view carry neither the keys nor the values", () => {
    const dto = dbListingToPublicDTO(row());
    const views: Record<string, unknown> = { dto, public: sanitizeForPublic(dto as any), portal: sanitizeForPortal(dto as any, "buyer"), vow: sanitizeForVOW(dto as any) };
    for (const [name, v] of Object.entries(views)) {
      const json = JSON.stringify(v);
      expect({ name, leaked: /saleBuyerComp|2\.375|BuyerBrokerageCompensation|BuyerAgencyCompensation/.test(json) }).toEqual({ name, leaked: false });
    }
  });
});

describe("Concessions is a rental term (Maya: usually one month free rent)", () => {
  it("the Sale form and its read-only viewer have no Concessions, amount or comments box", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
    try { for (const id of ["saleConcessions", "saleConcessionAmount", "saleConcessionComments"]) expect(f.d.getElementById(id)).toBeNull(); } finally { f.close(); }
    const html = require("fs").readFileSync(require("path").resolve(__dirname, "../../public/crm/SALE-FORM-WITH-TOOLS.html"), "utf8");
    expect(html).not.toMatch(/saleConcession/);
  });

  it("the Active checklist does not ask for it, and the rental form still has its own", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
    try { const asked = missing(f).map((m: any) => m.label); expect(asked.length).toBeGreaterThan(20); expect(asked).not.toContain("Concessions"); } finally { f.close(); }   // a blank form asks for everything required
    const r = await bootAddForm("RENTAL-FORM-REDESIGN", { settle: 600 });
    try { expect(r.d.getElementById("rentalConcessions")).not.toBeNull(); } finally { r.close(); }
  });

  const systemGenerated = (REBNY_FIELD_TABLES as any).requiredFields.systemGenerated as string[];
  const refusals = (listing: Record<string, unknown>) => publishBlockingErrors(validateListing({ MlsStatus: "Active", ...listing } as any), systemGenerated).filter((e) => /Concessions/.test(e));

  it("the server no longer demands it of a sale, and still demands it of a rental", () => {
    expect(refusals({ PropertyType: "Residential" })).toEqual([]);
    expect(refusals({ PropertyType: "ResidentialLease" }).join("|")).toMatch(/Required field missing: Concessions|Conditional field required: Concessions/);
    expect(refusals({ PropertyType: "ResidentialLease", Concessions: "No" })).toEqual([]);
  });

  it("a rental that says Yes still owes the amount and the comments (CONCESSIONS-001 is unchanged)", () => {
    const errs = publishBlockingErrors(validateListing({ MlsStatus: "Active", PropertyType: "ResidentialLease", Concessions: "Yes" } as any), systemGenerated).join("|");
    expect(errs).toMatch(/ConcessionsAmount/);
    expect(errs).toMatch(/ConcessionsComments/);
  });
});

describe("the Commission Negotiability box is gone from the Sale form", () => {
  it("there is no such box, and a complete form needs no tick for it", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
    try {
      expect(f.d.getElementById("saleCommNegotiabilityAck")).toBeNull();
      await completeForm(f, { type: "Condo", garage: "No" });
      expect(missing(f)).toEqual([]);
      const p = await saveDraft(f);
      expect(p).not.toHaveProperty("saleCommNegotiabilityAck");
      expect(f.errors).toEqual([]);
    } finally { f.close(); }
  });
});
