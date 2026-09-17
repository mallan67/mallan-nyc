import {
  shouldResetDom,
  computeDomTransition,
  isDomSuppressedByVisibility,
  DOM_RESET_DAYS,
} from "../dom-tracker";

/**
 * Create a Date exactly N days ago. Sets hours to 1 hour before
 * current time to ensure Math.floor(elapsed / MS_PER_DAY) always
 * rounds to exactly N (avoids sub-millisecond timing flakes).
 */
function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(d.getHours() - 1);
  return d;
}

describe("DOM_RESET_DAYS", () => {
  it("should be 30 (UCBA 2026 Sec. J)", () => {
    expect(DOM_RESET_DAYS).toBe(30);
  });
});

describe("shouldResetDom", () => {
  it("returns false for Active listings", () => {
    expect(
      shouldResetDom({
        status: "Active",
        status_changed_at: daysAgo(60),
        first_active_date: daysAgo(90),
        days_on_market: 30,
      })
    ).toBe(false);
  });

  it("returns false for Withdrawn < 30 days", () => {
    expect(
      shouldResetDom({
        status: "Withdrawn",
        status_changed_at: daysAgo(15),
        first_active_date: daysAgo(60),
        days_on_market: 45,
      })
    ).toBe(false);
  });

  it("returns true for Withdrawn >= 30 days", () => {
    expect(
      shouldResetDom({
        status: "Withdrawn",
        status_changed_at: daysAgo(30),
        first_active_date: daysAgo(90),
        days_on_market: 60,
      })
    ).toBe(true);
  });

  it("returns true for Cancelled >= 30 days", () => {
    expect(
      shouldResetDom({
        status: "Cancelled",
        status_changed_at: daysAgo(45),
        first_active_date: daysAgo(120),
        days_on_market: 75,
      })
    ).toBe(true);
  });

  it("returns false when status_changed_at is null", () => {
    expect(
      shouldResetDom({
        status: "Withdrawn",
        status_changed_at: null,
        first_active_date: daysAgo(90),
        days_on_market: 60,
      })
    ).toBe(false);
  });
});

describe("computeDomTransition", () => {
  it("resets DOM to 0 when reactivating after 30+ days in Withdrawn", () => {
    const result = computeDomTransition(
      {
        status: "Withdrawn",
        status_changed_at: daysAgo(35),
        first_active_date: daysAgo(100),
        days_on_market: 65,
      },
      "Active"
    );
    expect(result.days_on_market).toBe(0);
    expect(result.cumulative_days_on_market).toBe(65);
    // first_active_date should be reset to now (approximately)
    const diffMs = Math.abs(result.first_active_date!.getTime() - Date.now());
    expect(diffMs).toBeLessThan(5000);
  });

  it("resumes DOM when reactivating after < 30 days in Withdrawn", () => {
    const firstActive = daysAgo(50);
    const result = computeDomTransition(
      {
        status: "Withdrawn",
        status_changed_at: daysAgo(10),
        first_active_date: firstActive,
        days_on_market: 40,
      },
      "Active"
    );
    // DOM should resume (not reset) — carries forward existing days_on_market
    expect(result.days_on_market).toBe(40);
    expect(result.first_active_date).toEqual(firstActive);
  });

  it("resets DOM on Sold, retaining exposure in cumulative", () => {
    const result = computeDomTransition(
      {
        status: "Active",
        status_changed_at: daysAgo(5),
        first_active_date: daysAgo(20),
        days_on_market: 15,
      },
      "Sold"
    );
    // UCBA 2026 Art. I Sec. 11: DOM resets to zero on sold/rented (closed).
    // This assertion previously required a FREEZE at 20, which inverted the
    // rule. Accrued exposure (15 stored + 5 elapsed = 20) moves to cumulative.
    expect(result.days_on_market).toBe(0);
    expect(result.cumulative_days_on_market).toBe(20);
  });

  it("resets DOM on Rented, retaining exposure in cumulative", () => {
    const result = computeDomTransition(
      {
        status: "ActiveUnderContract",
        status_changed_at: daysAgo(3),
        first_active_date: daysAgo(30),
        days_on_market: 27,
      },
      "Rented"
    );
    // Same UCBA reset rule as Sold. Was asserting a freeze at 30.
    expect(result.days_on_market).toBe(0);
    expect(result.cumulative_days_on_market).toBe(30);
  });

  it("snapshots DOM when moving to Withdrawn (stops accrual)", () => {
    const result = computeDomTransition(
      {
        status: "Active",
        status_changed_at: daysAgo(10),
        first_active_date: daysAgo(10),
        days_on_market: 0,
      },
      "Withdrawn"
    );
    // 0 base + 10 days elapsed = 10
    expect(result.days_on_market).toBe(10);
  });

  it("does not accrue DOM during ComingSoon", () => {
    const result = computeDomTransition(
      {
        status: "ComingSoon",
        status_changed_at: daysAgo(14),
        first_active_date: null,
        days_on_market: 0,
      },
      "Active"
    );
    // ComingSoon is non-accruing, so DOM should stay at 0 and start fresh
    expect(result.days_on_market).toBe(0);
    expect(result.first_active_date).not.toBeNull();
  });

  it("cumulative_days_on_market never resets even after DOM reset", () => {
    const result = computeDomTransition(
      {
        status: "Cancelled",
        status_changed_at: daysAgo(60),
        first_active_date: daysAgo(120),
        days_on_market: 60,
      },
      "Active"
    );
    expect(result.days_on_market).toBe(0);
    expect(result.cumulative_days_on_market).toBe(60);
  });

  // ── UCBA 2026: participant-only — no DOM accrual ──

  it("does not accrue DOM when Active + participant-only", () => {
    const result = computeDomTransition(
      {
        status: "Active",
        participant_only: true,
        status_changed_at: daysAgo(20),
        first_active_date: daysAgo(20),
        days_on_market: 0,
      },
      "Active" // staying Active but participant-only
    );
    // wasAccruing = false (participant-only suppresses), so currentDom stays 0
    // effectivelyActivating = false, so treated as non-accruing
    expect(result.days_on_market).toBe(0);
  });

  it("resumes DOM accrual when participant-only is cleared", () => {
    const result = computeDomTransition(
      {
        status: "Active",
        participant_only: true,
        status_changed_at: daysAgo(30),
        first_active_date: daysAgo(30),
        days_on_market: 0,
      },
      "Active",
      false // participant-only cleared — DOM should start accruing
    );
    // effectivelyActivating = true (participant_only=false), wasAccruing = false
    // DOM resumes at 0 (no elapsed added since wasAccruing was false)
    expect(result.days_on_market).toBe(0);
    expect(result.first_active_date).not.toBeNull();
  });

  it("does not accrue DOM when transitioning to Active while participant-only", () => {
    const result = computeDomTransition(
      {
        status: "ComingSoon",
        participant_only: false,
        status_changed_at: daysAgo(14),
        first_active_date: null,
        days_on_market: 0,
      },
      "Active",
      true
    );
    // Activating but participant-only → non-accruing
    expect(result.days_on_market).toBe(0);
  });
});

describe("isDomSuppressedByVisibility", () => {
  // Takes the canonical typed `listings.participant_only`. Provider Permission
  // vocabulary (including the multi-value `IDX,Private` wire form) is tokenized
  // once in lib/idx/trestle-mapper.ts and never reaches this layer.
  it("returns true when participant_only is true", () => {
    expect(isDomSuppressedByVisibility(true)).toBe(true);
  });

  it("returns false when participant_only is false", () => {
    expect(isDomSuppressedByVisibility(false)).toBe(false);
  });

  it("returns false for null (fact absent — do not suppress)", () => {
    expect(isDomSuppressedByVisibility(null)).toBe(false);
  });

  it("returns false for undefined (fact absent — do not suppress)", () => {
    expect(isDomSuppressedByVisibility(undefined)).toBe(false);
  });
});
