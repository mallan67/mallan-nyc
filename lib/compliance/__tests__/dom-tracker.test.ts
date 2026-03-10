import {
  shouldResetDom,
  computeDomTransition,
  isDomSuppressedByPermissions,
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

  it("freezes DOM on Sold", () => {
    const result = computeDomTransition(
      {
        status: "Active",
        status_changed_at: daysAgo(5),
        first_active_date: daysAgo(20),
        days_on_market: 15,
      },
      "Sold"
    );
    // Should be 15 + 5 days elapsed = 20
    expect(result.days_on_market).toBe(20);
    expect(result.cumulative_days_on_market).toBe(20);
  });

  it("freezes DOM on Rented", () => {
    const result = computeDomTransition(
      {
        status: "ActiveUnderContract",
        status_changed_at: daysAgo(3),
        first_active_date: daysAgo(30),
        days_on_market: 27,
      },
      "Rented"
    );
    expect(result.days_on_market).toBe(30);
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

  // ── UCBA 2026: Participant Only Network — no DOM accrual ──

  it("does not accrue DOM when Active + Participant Only Network", () => {
    const result = computeDomTransition(
      {
        status: "Active",
        permissions: "Participant Only Network",
        status_changed_at: daysAgo(20),
        first_active_date: daysAgo(20),
        days_on_market: 0,
      },
      "Active" // staying Active but with suppressing permissions
    );
    // wasAccruing = false (permissions suppress), so currentDom stays 0
    // effectivelyActivating = false, so treated as non-accruing
    expect(result.days_on_market).toBe(0);
  });

  it("resumes DOM accrual when permissions change from Participant Only to null", () => {
    const result = computeDomTransition(
      {
        status: "Active",
        permissions: "Participant Only Network",
        status_changed_at: daysAgo(30),
        first_active_date: daysAgo(30),
        days_on_market: 0,
      },
      "Active",
      null // permissions cleared — DOM should start accruing
    );
    // effectivelyActivating = true (new permissions = null), wasAccruing = false
    // DOM resumes at 0 (no elapsed added since wasAccruing was false)
    expect(result.days_on_market).toBe(0);
    expect(result.first_active_date).not.toBeNull();
  });

  it("does not accrue DOM when transitioning to Active with Participant Only permissions", () => {
    const result = computeDomTransition(
      {
        status: "ComingSoon",
        permissions: null,
        status_changed_at: daysAgo(14),
        first_active_date: null,
        days_on_market: 0,
      },
      "Active",
      "Participant Only Network"
    );
    // Activating but permissions suppress → non-accruing
    expect(result.days_on_market).toBe(0);
  });
});

describe("isDomSuppressedByPermissions", () => {
  it("returns true for Participant Only Network", () => {
    expect(isDomSuppressedByPermissions("Participant Only Network")).toBe(true);
  });

  it("returns true for Private", () => {
    expect(isDomSuppressedByPermissions("Private")).toBe(true);
  });

  it("returns false for null", () => {
    expect(isDomSuppressedByPermissions(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isDomSuppressedByPermissions(undefined)).toBe(false);
  });

  it("returns false for standard permissions", () => {
    expect(isDomSuppressedByPermissions("ExclusiveRightToSell")).toBe(false);
  });
});
