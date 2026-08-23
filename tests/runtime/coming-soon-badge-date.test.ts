/**
 * UCBA Art. I §16(C) Coming Soon badge date-parsing — must NOT timezone-shift
 * Cotality date-only inputs ("YYYY-MM-DD"). Otherwise US timezones west of UTC
 * render the prior calendar day in the agent-facing "No Showings or Open House
 * until [date]" copy. Exact phrasing and exact date are penalty-bearing.
 */
import { parseCOTALITYDateLocal } from "@/app/components/ComingSoonBadge";

describe("parseCOTALITYDateLocal", () => {
  it("preserves the calendar day for date-only YYYY-MM-DD input", () => {
    const d = parseCOTALITYDateLocal("2026-05-01");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4); // May
    expect(d.getDate()).toBe(1);
  });

  it("renders 'May 1' (not 'April 30') in en-US toLocaleDateString in any US timezone", () => {
    // Without the fix, `new Date("2026-05-01")` parses as UTC midnight; in
    // America/Los_Angeles that is 2026-04-30 17:00 local, which formats as
    // "April 30, 2026". The fix constructs the date in local time so the
    // calendar day is preserved.
    const formatted = parseCOTALITYDateLocal("2026-05-01").toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    expect(formatted).toBe("May 1, 2026");
  });

  it("preserves the calendar day across the year boundary", () => {
    const d = parseCOTALITYDateLocal("2027-01-01");
    expect(d.getFullYear()).toBe(2027);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(1);
  });

  it("handles whitespace around the date", () => {
    const d = parseCOTALITYDateLocal("  2026-12-31  ");
    expect(d.getMonth()).toBe(11);
    expect(d.getDate()).toBe(31);
  });

  it("falls back to native Date for full ISO timestamps with offsets", () => {
    // ISO timestamp carries its own offset — trust JS for those.
    const d = parseCOTALITYDateLocal("2026-05-01T12:00:00-04:00");
    expect(Number.isNaN(d.getTime())).toBe(false);
  });
});
