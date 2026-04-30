import {
  aggregateContacts,
  normalizeName,
  normalizePhone,
  normalizeEmail,
  normalizeAddress,
  type VerificationMap,
} from "@/lib/scanner/contact/aggregator";
import type { SourceContactRow } from "@/lib/scanner/contact/types";
import { plutoRowToContact } from "@/lib/scanner/contact/sources/pluto-mailing";
import { acrisRowToContact } from "@/lib/scanner/contact/sources/acris-parties";
import { dosCorpRowToContact } from "@/lib/scanner/contact/sources/dos-corporation";

const NOW = new Date("2026-04-30T12:00:00Z");

describe("normalize helpers", () => {
  test("normalizeName trims, lowercases, collapses whitespace", () => {
    expect(normalizeName("  Smith Family  Trust  ")).toBe("smith family trust");
    expect(normalizeName("SMITH FAMILY TRUST")).toBe("smith family trust");
  });
  test("normalizePhone strips formatting + leading 1", () => {
    expect(normalizePhone("(212) 555-1234")).toBe("2125551234");
    expect(normalizePhone("+1 212 555 1234")).toBe("2125551234");
    expect(normalizePhone("212.555.1234")).toBe("2125551234");
  });
  test("normalizeEmail lowercases", () => {
    expect(normalizeEmail("Owner@Example.COM")).toBe("owner@example.com");
  });
  test("normalizeAddress upcases + abbreviates", () => {
    expect(normalizeAddress("400 East 90th Street, Apartment 12A")).toBe("400 EAST 90TH ST, APT 12A");
    expect(normalizeAddress("150 east 50  street")).toBe("150 EAST 50 ST");
    expect(normalizeAddress("123 Main Avenue.")).toBe("123 MAIN AVE");
  });
});

describe("aggregateContacts — empty", () => {
  test("empty rows → empty record with unverified confidence", () => {
    const r = aggregateContacts([], new Map(), NOW);
    expect(r.bbl).toBeNull();
    expect(r.overall_confidence).toBe("unverified");
    expect(r.source_count).toBe(0);
  });
});

describe("aggregateContacts — single source", () => {
  test("ACRIS party only → low confidence, single source", () => {
    const r1: SourceContactRow = {
      bbl: "1015730019",
      owner_entity: "SMITH JOHN A",
      addresses: ["400 EAST 90 STREET APT 12A, NEW YORK NY 10128"],
      source: "acris_party",
      source_url: "https://a836-acris.nyc.gov/DS/DocumentSearch/DocumentDetail?doc_id=X",
      source_captured_at: NOW.toISOString(),
      source_record_date: "2026-03-15T10:30:00.000",
    };
    const r = aggregateContacts([r1], new Map(), NOW);
    expect(r.bbl).toBe("1015730019");
    expect(r.owner_entity?.value).toBe("SMITH JOHN A");
    expect(r.owner_entity?.confidence).toBe("low");
    expect(r.addresses).toHaveLength(1);
    expect(r.addresses[0].confidence).toBe("low");
    expect(r.source_count).toBe(1);
    expect(r.overall_confidence).toBe("low");
  });
});

describe("aggregateContacts — cross-source agreement", () => {
  test("PLUTO + ACRIS agree on owner name → medium", () => {
    const pluto: SourceContactRow = {
      bbl: "1015730019",
      owner_entity: "SMITH FAMILY TRUST",
      addresses: ["400 EAST 90 STREET, NEW YORK NY 10128"],
      source: "pluto_mailing",
      source_captured_at: "2026-04-01T00:00:00.000",
    };
    const acris: SourceContactRow = {
      bbl: "1015730019",
      owner_entity: "Smith Family Trust",
      addresses: ["400 East 90 Street Apt 12A, New York NY 10128"],
      source: "acris_party",
      source_captured_at: "2026-04-15T00:00:00.000",
      source_record_date: "2026-03-15T10:30:00.000",
    };
    const r = aggregateContacts([pluto, acris], new Map(), NOW);
    expect(r.source_count).toBe(2);
    expect(r.owner_entity?.confidence).toBe("medium");
    expect(r.owner_entity?.verified).toBe(true);
    expect(r.owner_entity?.verification_method).toBe("cross_source_agreement");
    expect(r.overall_confidence).toBe("medium");
  });

  test("Three sources agree → high", () => {
    const rows: SourceContactRow[] = [
      { bbl: "1", owner_entity: "ACME LLC", source: "pluto_mailing", source_captured_at: NOW.toISOString() },
      { bbl: "1", owner_entity: "ACME LLC", source: "acris_party", source_captured_at: NOW.toISOString() },
      { bbl: "1", owner_entity: "ACME LLC", source: "hpd_registration", source_captured_at: NOW.toISOString() },
    ];
    const r = aggregateContacts(rows, new Map(), NOW);
    expect(r.source_count).toBe(3);
    expect(r.owner_entity?.confidence).toBe("high");
  });
});

describe("aggregateContacts — active verification", () => {
  test("USPS-verified address → high even with one source", () => {
    const verifications: VerificationMap = new Map();
    const addr = "400 EAST 90 STREET APT 12A, NEW YORK NY 10128";
    verifications.set(`address:${normalizeAddress(addr)}`, {
      verified: true,
      method: "usps_address_validation",
      at: NOW.toISOString(),
    });
    const rows: SourceContactRow[] = [{
      bbl: "1015730019",
      addresses: [addr],
      source: "acris_party",
      source_captured_at: NOW.toISOString(),
    }];
    const r = aggregateContacts(rows, verifications, NOW);
    expect(r.addresses[0].verified).toBe(true);
    expect(r.addresses[0].verification_method).toBe("usps_address_validation");
    expect(r.addresses[0].confidence).toBe("high");
  });

  test("Twilio-verified phone → high", () => {
    const verifications: VerificationMap = new Map();
    verifications.set(`phone:2125551234`, {
      verified: true,
      method: "twilio_lookup_carrier",
      at: NOW.toISOString(),
    });
    const rows: SourceContactRow[] = [{
      bbl: "1",
      phones: ["(212) 555-1234"],
      source: "third_party_skip_trace",
      source_captured_at: NOW.toISOString(),
    }];
    const r = aggregateContacts(rows, verifications, NOW);
    expect(r.phones[0].confidence).toBe("high");
    expect(r.phones[0].verified).toBe(true);
  });

  test("owner_response method always gets high", () => {
    const verifications: VerificationMap = new Map();
    verifications.set(`email:owner@example.com`, {
      verified: true,
      method: "owner_response",
      at: NOW.toISOString(),
    });
    const rows: SourceContactRow[] = [{
      emails: ["owner@example.com"],
      source: "manual_agent_note",
      source_captured_at: NOW.toISOString(),
    }];
    const r = aggregateContacts(rows, verifications, NOW);
    expect(r.emails[0].confidence).toBe("high");
  });
});

describe("aggregateContacts — de-dup + canonical-form selection", () => {
  test("same normalized phone with different formatting → one entry, longest format kept", () => {
    const rows: SourceContactRow[] = [
      { bbl: "1", phones: ["2125551234"], source: "pluto_mailing", source_captured_at: NOW.toISOString() },
      { bbl: "1", phones: ["(212) 555-1234"], source: "acris_party", source_captured_at: NOW.toISOString() },
      { bbl: "1", phones: ["+1 212 555-1234"], source: "hpd_registration", source_captured_at: NOW.toISOString() },
    ];
    const r = aggregateContacts(rows, new Map(), NOW);
    expect(r.phones).toHaveLength(1);
    expect(r.phones[0].normalized).toBe("2125551234");
    expect(r.phones[0].value).toBe("+1 212 555-1234"); // longest canonical
    expect(r.phones[0].confidence).toBe("high"); // 3 sources
  });

  test("multiple distinct phones tracked separately", () => {
    const rows: SourceContactRow[] = [
      { bbl: "1", phones: ["212-555-1234", "646-258-4460"], source: "manual_agent_note", source_captured_at: NOW.toISOString() },
    ];
    const r = aggregateContacts(rows, new Map(), NOW);
    expect(r.phones).toHaveLength(2);
  });
});

describe("plutoRowToContact source adapter", () => {
  test("extracts owner + property address", () => {
    const row = {
      BBL: "1015730019",
      BoroCode: "1",
      Block: "01573",
      Lot: "0019",
      Address: "400 EAST 90 STREET",
      ZipCode: "10128",
      OwnerName: "SAMPLE OWNER LLC",
      OwnerType: "P",
      LandUse: "04",
      BldgClass: "R4",
      UnitsRes: "20",
      UnitsTotal: "20",
      YearBuilt: "1985",
      YearAlter1: "",
      YearAlter2: "",
      AssessLand: "500000",
      AssessTot: "2500000",
      ExemptLand: "0",
      ExemptTot: "0",
      BuiltFAR: "4.5",
      ResidFAR: "5.0",
      CommFAR: "0.0",
      Latitude: "40.7790",
      Longitude: "-73.9489",
      CondoNo: "0",
      HistDist: "",
      Landmark: "",
      LotArea: "5000",
      BldgArea: "30000",
      NumFloors: "12",
      ZoneDist1: "R8B",
    };
    const contact = plutoRowToContact(row);
    expect(contact.bbl).toBe("1015730019");
    expect(contact.owner_entity).toBe("SAMPLE OWNER LLC");
    expect(contact.addresses).toEqual(["400 EAST 90 STREET, NEW YORK NY 10128"]);
    expect(contact.source).toBe("pluto_mailing");
    expect(contact.source_url).toContain("propertyinformationportal");
    expect(contact.source_url).toContain("1015730019");
  });

  test("handles missing address gracefully", () => {
    const row = {
      BBL: "1",
      Address: "",
      ZipCode: "",
      OwnerName: "",
    } as Partial<Parameters<typeof plutoRowToContact>[0]>;
    const contact = plutoRowToContact(row as Parameters<typeof plutoRowToContact>[0]);
    expect(contact.addresses).toEqual([]);
    expect(contact.owner_entity).toBeNull();
  });
});

describe("acrisRowToContact source adapter", () => {
  test("extracts party name + full mailing address + source url", () => {
    const row = {
      doc_id: "2026031500900001",
      doc_type: "LP",
      category: "lis_pendens",
      document_date: "03/15/2026",
      recorded_datetime: "2026-03-15T10:30:00.000",
      document_amt: "0",
      bbl: "1015730019",
      street_number: "400",
      street_name: "EAST 90 STREET",
      unit: "12A",
      property_type: "RC",
      party_name: "SMITH JOHN A",
      party_address_1: "400 EAST 90 STREET APT 12A",
      party_address_2: "",
      party_city: "NEW YORK",
      party_state: "NY",
      party_zip: "10128",
      party_country: "US",
    };
    const contact = acrisRowToContact(row);
    expect(contact.bbl).toBe("1015730019");
    expect(contact.owner_entity).toBe("SMITH JOHN A");
    expect(contact.addresses).toEqual(["400 EAST 90 STREET APT 12A, NEW YORK NY 10128"]);
    expect(contact.source).toBe("acris_party");
    expect(contact.source_url).toContain("a836-acris.nyc.gov");
    expect(contact.source_url).toContain("2026031500900001");
    expect(contact.source_record_date).toBe("2026-03-15T10:30:00.000");
  });

  test("handles 2-line address (party_address_2 present)", () => {
    const row = {
      doc_id: "X", doc_type: "EATR", category: "estate",
      document_date: "", recorded_datetime: "", document_amt: "",
      bbl: "1004500001",
      street_number: "15", street_name: "GRAMERCY PARK SOUTH", unit: "4A", property_type: "RC",
      party_name: "ESTATE OF GLORIA SMITHSON",
      party_address_1: "15 GRAMERCY PARK SOUTH",
      party_address_2: "APT 4A",
      party_city: "NEW YORK", party_state: "NY", party_zip: "10003", party_country: "US",
    };
    const contact = acrisRowToContact(row);
    expect((contact.addresses ?? [])[0]).toContain("15 GRAMERCY PARK SOUTH");
    expect((contact.addresses ?? [])[0]).toContain("APT 4A");
    expect((contact.addresses ?? [])[0]).toContain("10003");
  });
});

describe("dosCorpRowToContact source adapter", () => {
  test("extracts LLC name + process address + DOS source URL", () => {
    const row = {
      dos_id: "1234567",
      current_entity_name: "400 EAST 90 OWNER LLC",
      normalized_name: "400 east 90 owner llc",
      normalized_name_stripped: "400 east 90 owner",
      entity_type: "DOMESTIC LIMITED LIABILITY COMPANY",
      status: "ACTIVE",
      initial_filing_date: "01/15/2018",
      jurisdiction: "NEW YORK",
      county: "NEW YORK",
      process_name: "JOHN A SMITH",
      process_address_1: "400 EAST 90 STREET",
      process_address_2: "APT 12A",
      process_city: "NEW YORK",
      process_state: "NY",
      process_zip: "10128",
    };
    const contact = dosCorpRowToContact(row);
    expect(contact.bbl).toBeNull();
    expect(contact.owner_entity).toBe("400 EAST 90 OWNER LLC");
    expect(contact.names).toEqual(["JOHN A SMITH"]);
    expect((contact.addresses ?? [])[0]).toContain("400 EAST 90 STREET");
    expect((contact.addresses ?? [])[0]).toContain("APT 12A");
    expect((contact.addresses ?? [])[0]).toContain("10128");
    expect(contact.source).toBe("dos_corporation");
    expect(contact.source_url).toContain("apps.dos.ny.gov");
    expect(contact.source_url).toContain("1234567");
    expect(contact.source_record_date).toBe("01/15/2018");
  });

  test("handles dissolved LLC", () => {
    const row = {
      dos_id: "9", current_entity_name: "DISSOLVED OWNER LLC",
      normalized_name: "dissolved owner llc", normalized_name_stripped: "dissolved owner",
      entity_type: "DOMESTIC LIMITED LIABILITY COMPANY",
      status: "DISSOLVED",
      initial_filing_date: "05/12/2008", jurisdiction: "NEW YORK", county: "NEW YORK",
      process_name: "", process_address_1: "123 EAST 80 STREET", process_address_2: "",
      process_city: "NEW YORK", process_state: "NY", process_zip: "10075",
    };
    const contact = dosCorpRowToContact(row);
    expect(contact.owner_entity).toBe("DISSOLVED OWNER LLC");
    expect(contact.names).toEqual([]); // empty process_name
    expect((contact.addresses ?? [])[0]).toContain("123 EAST 80 STREET");
  });
});

describe("end-to-end — PLUTO + ACRIS + DOS Corp triple-source aggregate", () => {
  test("Three-source agreement on the LLC name → high confidence", () => {
    const plutoRow = {
      BBL: "1015730019", BoroCode: "1", Block: "01573", Lot: "0019",
      Address: "400 EAST 90 STREET", ZipCode: "10128",
      OwnerName: "400 EAST 90 OWNER LLC", OwnerType: "P",
      LandUse: "04", BldgClass: "R4", UnitsRes: "20", UnitsTotal: "20",
      YearBuilt: "1985", YearAlter1: "", YearAlter2: "",
      AssessLand: "500000", AssessTot: "2500000", ExemptLand: "0", ExemptTot: "0",
      BuiltFAR: "4.5", ResidFAR: "5.0", CommFAR: "0.0",
      Latitude: "40.7790", Longitude: "-73.9489", CondoNo: "0",
      HistDist: "", Landmark: "", LotArea: "5000", BldgArea: "30000",
      NumFloors: "12", ZoneDist1: "R8B",
    };
    const acrisRow = {
      doc_id: "2026031500900001", doc_type: "LP", category: "lis_pendens",
      document_date: "03/15/2026", recorded_datetime: "2026-03-15T10:30:00.000", document_amt: "0",
      bbl: "1015730019",
      street_number: "400", street_name: "EAST 90 STREET", unit: "12A", property_type: "RC",
      party_name: "400 East 90 Owner LLC",
      party_address_1: "400 EAST 90 STREET",
      party_address_2: "APT 12A",
      party_city: "NEW YORK", party_state: "NY", party_zip: "10128", party_country: "US",
    };
    const dosRow = {
      dos_id: "1234567",
      current_entity_name: "400 EAST 90 OWNER, LLC",
      normalized_name: "400 east 90 owner llc",
      normalized_name_stripped: "400 east 90 owner",
      entity_type: "DOMESTIC LIMITED LIABILITY COMPANY",
      status: "ACTIVE",
      initial_filing_date: "01/15/2018",
      jurisdiction: "NEW YORK", county: "NEW YORK",
      process_name: "JOHN A SMITH",
      process_address_1: "400 EAST 90 STREET",
      process_address_2: "APT 12A",
      process_city: "NEW YORK", process_state: "NY", process_zip: "10128",
    };
    const sourceRows = [
      plutoRowToContact(plutoRow),
      acrisRowToContact(acrisRow),
      dosCorpRowToContact(dosRow),
    ];
    const r = aggregateContacts(sourceRows, new Map(), NOW);
    expect(r.bbl).toBe("1015730019");
    expect(r.source_count).toBe(3);
    expect(r.sources.sort()).toEqual(["acris_party", "dos_corporation", "pluto_mailing"]);
    // 3-source agreement on LLC name → high
    expect(r.owner_entity?.normalized).toBe("400 east 90 owner llc");
    expect(r.owner_entity?.confidence).toBe("high");
    expect(r.owner_entity?.verified).toBe(true);
    // Process name from DOS Corp surfaces a managing-member-or-rep human
    expect(r.names.length).toBeGreaterThan(0);
    expect(r.names[0].value).toBe("JOHN A SMITH");
    expect(r.overall_confidence).toBe("high");
  });
});

describe("end-to-end — PLUTO + ACRIS aggregate → cross-source agreement", () => {
  test("Same BBL, same owner across both sources → medium confidence", () => {
    const plutoRow = {
      BBL: "1015730019", BoroCode: "1", Block: "01573", Lot: "0019",
      Address: "400 EAST 90 STREET", ZipCode: "10128",
      OwnerName: "Smith Family Trust", OwnerType: "P",
      LandUse: "04", BldgClass: "R4", UnitsRes: "20", UnitsTotal: "20",
      YearBuilt: "1985", YearAlter1: "", YearAlter2: "",
      AssessLand: "500000", AssessTot: "2500000", ExemptLand: "0", ExemptTot: "0",
      BuiltFAR: "4.5", ResidFAR: "5.0", CommFAR: "0.0",
      Latitude: "40.7790", Longitude: "-73.9489", CondoNo: "0",
      HistDist: "", Landmark: "", LotArea: "5000", BldgArea: "30000",
      NumFloors: "12", ZoneDist1: "R8B",
    };
    const acrisRow = {
      doc_id: "2026031500900001", doc_type: "LP", category: "lis_pendens",
      document_date: "03/15/2026", recorded_datetime: "2026-03-15T10:30:00.000", document_amt: "0",
      bbl: "1015730019",
      street_number: "400", street_name: "EAST 90 STREET", unit: "", property_type: "RC",
      party_name: "SMITH FAMILY TRUST",
      party_address_1: "400 EAST 90 STREET",
      party_address_2: "",
      party_city: "NEW YORK", party_state: "NY", party_zip: "10128", party_country: "US",
    };
    const sourceRows = [plutoRowToContact(plutoRow), acrisRowToContact(acrisRow)];
    const r = aggregateContacts(sourceRows, new Map(), NOW);
    expect(r.bbl).toBe("1015730019");
    expect(r.source_count).toBe(2);
    expect(r.sources.sort()).toEqual(["acris_party", "pluto_mailing"]);
    expect(r.owner_entity?.normalized).toBe("smith family trust");
    expect(r.owner_entity?.confidence).toBe("medium");
    expect(r.owner_entity?.verified).toBe(true);
    expect(r.owner_entity?.verification_method).toBe("cross_source_agreement");
    expect(r.addresses).toHaveLength(1);
    expect(r.addresses[0].confidence).toBe("medium");
  });
});
