/// <reference types="jest" />
/**
 * Unit tests for the terminal_since clock helper (Archive Eligibility Clock PR-1, #415).
 * Placed in tests/runtime (a discovered jest project that resolves the @/ alias).
 */
import {
  parseStableDate,
  deriveTerminalSince,
  computeTerminalSincePatch,
  isTerminalStatus,
} from "@/lib/listings/terminal-since";

const NOW = new Date("2026-06-25T00:00:00Z");

describe("isTerminalStatus", () => {
  it("recognizes terminal + non-terminal (via normalizeStandardStatus)", () => {
    for (const s of ["Closed", "Sold", "Leased", "Rented", "Withdrawn", "Expired", "Cancelled", "closed", "cancelled"]) {
      expect(isTerminalStatus(s)).toBe(true);
    }
    for (const s of ["Active", "ComingSoon", "Pending", "ActiveUnderContract", undefined, null]) {
      expect(isTerminalStatus(s)).toBe(false);
    }
  });
});

describe("parseStableDate — sanity window", () => {
  it("accepts a valid in-window date", () => {
    expect(parseStableDate("2023-05-01", NOW)?.toISOString().slice(0, 10)).toBe("2023-05-01");
  });
  it("rejects an impossible future date (year 2814)", () => {
    expect(parseStableDate("2814-02-04", NOW)).toBeNull();
  });
  it("rejects an ancient date (before 2000)", () => {
    expect(parseStableDate("1990-01-01", NOW)).toBeNull();
  });
  it("rejects empty / null / unparseable", () => {
    expect(parseStableDate("", NOW)).toBeNull();
    expect(parseStableDate(null, NOW)).toBeNull();
    expect(parseStableDate("not-a-date", NOW)).toBeNull();
  });
});

describe("deriveTerminalSince — priority + fail-safe", () => {
  it("prefers raw_data.CloseDate", () => {
    expect(deriveTerminalSince({ status: "Closed", raw_data: { CloseDate: "2023-05-01", OffMarketDate: "2024-01-01" }, now: NOW })?.toISOString().slice(0, 10)).toBe("2023-05-01");
  });
  it("falls back to features.CloseDate (import-closed rows)", () => {
    expect(deriveTerminalSince({ status: "Closed", features: { CloseDate: "2022-08-08" }, now: NOW })?.toISOString().slice(0, 10)).toBe("2022-08-08");
  });
  it("falls back to OffMarketDate", () => {
    expect(deriveTerminalSince({ status: "Withdrawn", raw_data: { OffMarketDate: "2021-03-03" }, now: NOW })?.toISOString().slice(0, 10)).toBe("2021-03-03");
  });
  it("uses ExpirationDate ONLY for Expired", () => {
    expect(deriveTerminalSince({ status: "Expired", raw_data: { ExpirationDate: "2020-09-09" }, now: NOW })?.toISOString().slice(0, 10)).toBe("2020-09-09");
    expect(deriveTerminalSince({ status: "Closed", raw_data: { ExpirationDate: "2020-09-09" }, now: NOW })).toBeNull();
  });
  it("SKIPS an invalid (year 2814) CloseDate and uses the next valid source", () => {
    expect(deriveTerminalSince({ status: "Closed", raw_data: { CloseDate: "2814-02-04", OffMarketDate: "2023-01-01" }, now: NOW })?.toISOString().slice(0, 10)).toBe("2023-01-01");
  });
  it("returns null when no valid stable date (do not fabricate)", () => {
    expect(deriveTerminalSince({ status: "Closed", raw_data: {}, now: NOW })).toBeNull();
  });
  it("derives an Expired CRM/exclusive row from a typed expiration_date (::text format) — backfill #446", () => {
    // Postgres `::text` renders e.g. "2024-04-04 00:00:00"; parseStableDate must accept it.
    const d = deriveTerminalSince({ status: "Expired", raw_data: { ExpirationDate: "2024-04-04 00:00:00" }, now: NOW });
    expect(d?.toISOString().slice(0, 10)).toBe("2024-04-04");
  });

  // ── expirationDateFallback (centralized typed-expiration fallback, #446) ──
  it("Expired with NO raw ExpirationDate uses expirationDateFallback", () => {
    const d = deriveTerminalSince({ status: "Expired", raw_data: {}, expirationDateFallback: "2023-07-07", now: NOW });
    expect(d?.toISOString().slice(0, 10)).toBe("2023-07-07");
  });
  it("Expired with BLANK raw ExpirationDate ('') falls through to expirationDateFallback", () => {
    const d = deriveTerminalSince({ status: "Expired", raw_data: { ExpirationDate: "" }, expirationDateFallback: "2023-07-07", now: NOW });
    expect(d?.toISOString().slice(0, 10)).toBe("2023-07-07");
  });
  it("Expired with INVALID raw ExpirationDate (year 2814) falls through to expirationDateFallback", () => {
    const d = deriveTerminalSince({ status: "Expired", raw_data: { ExpirationDate: "2814-02-04" }, expirationDateFallback: "2023-07-07", now: NOW });
    expect(d?.toISOString().slice(0, 10)).toBe("2023-07-07");
  });
  it("accepts expirationDateFallback as a Date object (typed column)", () => {
    const d = deriveTerminalSince({ status: "Expired", raw_data: {}, expirationDateFallback: new Date("2022-02-02T00:00:00Z"), now: NOW });
    expect(d?.toISOString().slice(0, 10)).toBe("2022-02-02");
  });
  it("does NOT use expirationDateFallback for non-Expired status", () => {
    expect(deriveTerminalSince({ status: "Closed", raw_data: {}, expirationDateFallback: "2023-07-07", now: NOW })).toBeNull();
  });
  it("an invalid expirationDateFallback (year 2814) still fails safe → null", () => {
    expect(deriveTerminalSince({ status: "Expired", raw_data: {}, expirationDateFallback: "2814-02-04", now: NOW })).toBeNull();
  });
});

describe("computeTerminalSincePatch — expirationDateFallback (manual Expired, #446)", () => {
  it("Active→Expired with typed expiration_date (no raw) sets terminal_since from the typed date, not wall-clock", () => {
    const p = computeTerminalSincePatch({
      previousStatus: "Active", newStatus: "Expired",
      raw_data: {}, expirationDateFallback: "2025-05-05", now: NOW,
    });
    expect(p.terminal_since instanceof Date && (p.terminal_since as Date).toISOString().slice(0, 10)).toBe("2025-05-05");
    expect(p.terminal_since).not.toEqual(NOW);
  });
});

describe("computeTerminalSincePatch — writer rule", () => {
  it("non-terminal → terminal SETS from stable date", () => {
    const p = computeTerminalSincePatch({ previousStatus: "Active", newStatus: "Closed", raw_data: { CloseDate: "2023-05-01" }, now: NOW });
    expect(p.terminal_since instanceof Date && p.terminal_since.toISOString().slice(0, 10)).toBe("2023-05-01");
  });
  it("non-terminal → terminal with NO stable date falls back to wall-clock (now)", () => {
    expect(computeTerminalSincePatch({ previousStatus: "Active", newStatus: "Closed", raw_data: {}, now: NOW }).terminal_since).toEqual(NOW);
  });
  it("terminal → terminal (re-sync) does NOT bump (no key)", () => {
    const p = computeTerminalSincePatch({ previousStatus: "Closed", newStatus: "Closed", raw_data: { CloseDate: "2023-05-01" }, now: NOW });
    expect(p).toEqual({});
    expect("terminal_since" in p).toBe(false);
  });
  it("terminal → active CLEARS (terminal_since: null)", () => {
    expect(computeTerminalSincePatch({ previousStatus: "Withdrawn", newStatus: "Active", now: NOW })).toEqual({ terminal_since: null });
  });
  it("non-terminal → non-terminal: no change", () => {
    expect(computeTerminalSincePatch({ previousStatus: "Active", newStatus: "Pending", now: NOW })).toEqual({});
  });
  it("create (previousStatus undefined) → terminal sets; → non-terminal omits", () => {
    expect(computeTerminalSincePatch({ previousStatus: undefined, newStatus: "Closed", raw_data: { CloseDate: "2023-05-01" }, now: NOW }).terminal_since).toBeInstanceOf(Date);
    expect(computeTerminalSincePatch({ previousStatus: undefined, newStatus: "Active", now: NOW })).toEqual({});
  });
});
