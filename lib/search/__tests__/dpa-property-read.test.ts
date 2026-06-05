import { mapTrestleToCrmListing } from "@/lib/search/crm-idx-mapper";
import { IDX_PLUS_SELECT_FIELDS } from "@/lib/idx/trestle-mapper";

/**
 * DownPaymentAssistance* migrated CustomProperty → Property (live 2026-06-04).
 * The app must (a) select them from Property and (b) read them from Property,
 * with a legacy CustomProperty fallback for old raw_data. Generic fixtures only.
 */
const base: Record<string, unknown> = {
  ListingId: "RLS-DPA-1",
  ListingKey: "RLS-DPA-1",
  StandardStatus: "Active",
  PropertyType: "Residential",
  City: "New York City",
  StateOrProvince: "NY",
  PostalCode: "10001",
  ListPrice: 1000000,
  ModificationTimestamp: "2026-06-04T12:00:00Z",
  InternetEntireListingDisplayYN: true,
  InternetAddressDisplayYN: true,
};

describe("DownPaymentAssistance read from Property", () => {
  it("IDX_PLUS_SELECT_FIELDS includes both DownPaymentAssistance fields", () => {
    expect(IDX_PLUS_SELECT_FIELDS).toContain("DownPaymentAssistanceAmount");
    expect(IDX_PLUS_SELECT_FIELDS).toContain("DownPaymentAssistanceCount");
  });

  it("reads both from the Property record when present", () => {
    const l = mapTrestleToCrmListing(
      { ...base, DownPaymentAssistanceAmount: 7500, DownPaymentAssistanceCount: 2 },
      4,
    );
    expect(l.downPaymentAssistanceAmount).toBe(7500);
    expect(l.downPaymentAssistanceCount).toBe(2);
  });

  it("Property wins over legacy CustomProperty when both exist", () => {
    const l = mapTrestleToCrmListing(
      {
        ...base,
        DownPaymentAssistanceAmount: 7500,
        DownPaymentAssistanceCount: 2,
        CustomProperty: [{ DownPaymentAssistanceAmount: 5000, DownPaymentAssistanceCount: 1 }],
      },
      4,
    );
    expect(l.downPaymentAssistanceAmount).toBe(7500); // not the legacy 5000
    expect(l.downPaymentAssistanceCount).toBe(2); // not the legacy 1
  });

  it("falls back to legacy CustomProperty only when the Property field is absent", () => {
    const l = mapTrestleToCrmListing(
      { ...base, CustomProperty: [{ DownPaymentAssistanceAmount: 5000, DownPaymentAssistanceCount: 1 }] },
      4,
    );
    expect(l.downPaymentAssistanceAmount).toBe(5000);
    expect(l.downPaymentAssistanceCount).toBe(1);
  });

  it("is null when neither Property nor CustomProperty carries the fields", () => {
    const l = mapTrestleToCrmListing({ ...base }, 4);
    expect(l.downPaymentAssistanceAmount).toBeNull();
    expect(l.downPaymentAssistanceCount).toBeNull();
  });
});
