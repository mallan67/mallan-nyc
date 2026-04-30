import { runVerifications } from "@/lib/scanner/contact/verify/orchestrator";
import { aggregateContacts } from "@/lib/scanner/contact/aggregator";
import type { SourceContactRow } from "@/lib/scanner/contact/types";
import type { VerificationMethod } from "@/lib/scanner/contact/types";

const NOW = new Date("2026-04-30T12:00:00Z");

function row(p: Partial<SourceContactRow>): SourceContactRow {
  return {
    names: p.names ?? [],
    phones: p.phones ?? [],
    emails: p.emails ?? [],
    addresses: p.addresses ?? [],
    source: p.source ?? "manual_agent_note",
    source_captured_at: p.source_captured_at ?? NOW.toISOString(),
    bbl: p.bbl,
    owner_entity: p.owner_entity,
    source_url: p.source_url,
    source_record_date: p.source_record_date,
  };
}

function ok(method: VerificationMethod) {
  return async (value: string) => ({
    verified: true,
    method,
    at: NOW.toISOString(),
    provider: method,
    detail: `mock pass for ${value}`,
  });
}
function fail(reason: string) {
  return async (value: string) => ({
    verified: false,
    method: "none" as VerificationMethod,
    at: NOW.toISOString(),
    provider: "mock",
    detail: `mock fail for ${value}: ${reason}`,
  });
}
function skipped() {
  return async (_value: string) => ({
    verified: false,
    method: "none" as VerificationMethod,
    at: NOW.toISOString(),
    provider: "mock",
    detail: "skipped (env not configured)",
    skipped: true,
  });
}

describe("runVerifications — basic shape", () => {
  test("empty record produces empty map", async () => {
    const rec = aggregateContacts([], new Map(), NOW);
    const out = await runVerifications(rec);
    expect(out.verifications.size).toBe(0);
    expect(out.audit).toEqual([]);
    expect(out.calls_made).toBe(0);
  });

  test("single source phone+email+address fires 3 verifications", async () => {
    const rec = aggregateContacts([
      row({
        bbl: "1015730019",
        phones: ["212-555-1234"],
        emails: ["owner@example.com"],
        addresses: ["400 EAST 90 STREET, NEW YORK NY 10128"],
        source: "acris_party",
      }),
    ], new Map(), NOW);
    const out = await runVerifications(rec, {}, {
      phone: ok("twilio_lookup_carrier"),
      email: ok("smtp_email_validation"),
      address: ok("usps_address_validation"),
    });
    expect(out.calls_made).toBe(3);
    expect(out.verifications.size).toBe(3);
    expect(out.audit.map((a) => a.kind).sort()).toEqual(["address", "email", "phone"]);
  });
});

describe("runVerifications — de-dup", () => {
  test("same phone in 2 sources fires 1 lookup", async () => {
    const rec = aggregateContacts([
      row({ bbl: "1", phones: ["(212) 555-1234"], source: "pluto_mailing" }),
      row({ bbl: "1", phones: ["+1 212 555 1234"], source: "acris_party" }),
    ], new Map(), NOW);
    const out = await runVerifications(rec, {}, {
      phone: ok("twilio_lookup_carrier"),
      email: skipped(),
      address: skipped(),
    });
    expect(out.calls_made).toBe(1);
    expect(out.audit.filter((a) => a.kind === "phone").length).toBe(1);
  });
});

describe("runVerifications — budget cap", () => {
  test("max_per_call halts after limit reached", async () => {
    const rec = aggregateContacts([
      row({
        bbl: "1",
        phones: ["212-555-1111", "212-555-2222"],
        emails: ["a@example.com", "b@example.com"],
        addresses: ["1 Main St, NY NY 10001", "2 Main St, NY NY 10001"],
        source: "acris_party",
      }),
    ], new Map(), NOW);
    const out = await runVerifications(rec, { max_per_call: 3 }, {
      phone: ok("twilio_lookup_carrier"),
      email: ok("smtp_email_validation"),
      address: ok("usps_address_validation"),
    });
    expect(out.calls_made).toBe(3);
    expect(out.budget_skipped).toBe(3);
  });
});

describe("runVerifications — selective skip", () => {
  test("skip_phone bypasses phone calls", async () => {
    const rec = aggregateContacts([
      row({ phones: ["212-555-1234"], emails: ["x@y.com"], addresses: ["1 Main St, NY NY 10001"] }),
    ], new Map(), NOW);
    const out = await runVerifications(rec, { skip_phone: true }, {
      phone: ok("twilio_lookup_carrier"),
      email: ok("smtp_email_validation"),
      address: ok("usps_address_validation"),
    });
    expect(out.audit.find((a) => a.kind === "phone")).toBeUndefined();
    expect(out.calls_made).toBe(2);
  });
});

describe("runVerifications — feeding back into aggregator", () => {
  test("verified value upgrades confidence to high in re-aggregation", async () => {
    const initialRows = [
      row({
        bbl: "1015730019",
        phones: ["212-555-1234"],
        addresses: ["400 EAST 90 STREET, NY NY 10128"],
        source: "acris_party",
      }),
    ];
    const initial = aggregateContacts(initialRows, new Map(), NOW);
    expect(initial.phones[0].confidence).toBe("low"); // single source, no verification

    const verifyOut = await runVerifications(initial, {}, {
      phone: ok("twilio_lookup_carrier"),
      email: skipped(),
      address: ok("usps_address_validation"),
    });

    // Re-aggregate with the produced VerificationMap
    const reAggregated = aggregateContacts(initialRows, verifyOut.verifications, NOW);
    expect(reAggregated.phones[0].confidence).toBe("high");
    expect(reAggregated.phones[0].verified).toBe(true);
    expect(reAggregated.phones[0].verification_method).toBe("twilio_lookup_carrier");
    expect(reAggregated.addresses[0].confidence).toBe("high");
    expect(reAggregated.addresses[0].verification_method).toBe("usps_address_validation");
  });
});

describe("runVerifications — failure surfaces in audit", () => {
  test("failed verification doesn't poison the map but is in the audit", async () => {
    const rec = aggregateContacts([
      row({ phones: ["212-555-1234"], source: "acris_party" }),
    ], new Map(), NOW);
    const out = await runVerifications(rec, {}, {
      phone: fail("Twilio 401"),
      email: skipped(),
      address: skipped(),
    });
    expect(out.calls_made).toBe(1);
    expect(out.audit[0].verified).toBe(false);
    expect(out.audit[0].detail).toContain("Twilio 401");
    // The verification map records the false verdict — re-aggregation
    // doesn't upgrade the field
    const verifEntry = out.verifications.get("phone:2125551234");
    expect(verifEntry?.verified).toBe(false);
  });
});
