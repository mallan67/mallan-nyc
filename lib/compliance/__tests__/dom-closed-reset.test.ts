/**
 * D4 — DOM reset on close (UCBA 2026 Art. I §11).
 *
 * THE RULE
 * --------
 * `data/UCBA-2026-Requirements.md:14-16` — the repo's own extraction of the
 * 2026 UCBA change notice:
 *
 *     ### 1. Days on Market Reset (Art. I, Sec. 11)
 *     - DOM resets to zero after **30 consecutive days** in "Withdrawn" or
 *       "Cancelled" status (was previously unspecified)
 *     - DOM resets on sold (closed) or rented (closed)
 *
 * So there are THREE reset triggers, not two. The third — close — was
 * implemented as a FREEZE (`days_on_market: currentDom`), which is the opposite
 * of the rule.
 *
 * TWO FIELDS, TWO MEANINGS
 * ------------------------
 *   days_on_market            = the RLS DOM clock. UCBA says 0 after close.
 *   cumulative_days_on_market = Mallan's retained historical market exposure,
 *                               for comps/reporting. NOT a REBNY-mandated
 *                               behaviour — REBNY's explicit reset rule speaks
 *                               to DOM. Retention here is Mallan's reporting
 *                               layer, and the column already exists.
 *
 * STATUS VOCABULARY
 * -----------------
 * The pre-existing branch tested only `"Sold"` / `"Rented"`. Production carries
 * 0 rows in either status and 6,100 in `Closed` (read-only census 2026-09-07) —
 * `Closed` is the canonical Cotality StandardStatus member and was falling
 * through to the generic non-accruing return. All three are handled.
 *
 * NOT IN SCOPE HERE: existing Closed rows are untouched. Code correction and
 * data reconciliation are separate operations; the latter needs authorization.
 */

import { computeDomTransition } from "../dom-tracker";

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(d.getHours() - 1);
  return d;
}

describe("DOM resets to zero on close (UCBA Art. I §11)", () => {
  it("Active with 23 accrued DOM → Closed: DOM 0, cumulative retains 23", () => {
    const result = computeDomTransition(
      {
        status: "Active",
        participant_only: false,
        status_changed_at: daysAgo(3),
        first_active_date: daysAgo(23),
        days_on_market: 20, // 20 stored + 3 elapsed = 23 at close
      },
      "Closed"
    );
    expect(result.days_on_market).toBe(0);
    expect(result.cumulative_days_on_market).toBe(23);
  });

  it("ActiveUnderContract → Closed: same rule", () => {
    const result = computeDomTransition(
      {
        status: "ActiveUnderContract",
        participant_only: false,
        status_changed_at: daysAgo(4),
        first_active_date: daysAgo(45),
        days_on_market: 41,
      },
      "Closed"
    );
    expect(result.days_on_market).toBe(0);
    expect(result.cumulative_days_on_market).toBe(45);
  });

  it.each(["Closed", "Sold", "Rented"])(
    "%s resets the DOM clock (canonical and legacy close tokens)",
    (closeStatus) => {
      const result = computeDomTransition(
        {
          status: "Active",
          participant_only: false,
          status_changed_at: daysAgo(2),
          first_active_date: daysAgo(12),
          days_on_market: 10,
        },
        closeStatus
      );
      expect(result.days_on_market).toBe(0);
      expect(result.cumulative_days_on_market).toBe(12);
    }
  );

  it("ComingSoon → Closed does not fabricate market days", () => {
    const result = computeDomTransition(
      {
        status: "ComingSoon", // never accrued — pre-market status
        participant_only: false,
        status_changed_at: daysAgo(13),
        first_active_date: null,
        days_on_market: 0,
      },
      "Closed"
    );
    expect(result.days_on_market).toBe(0);
    expect(result.cumulative_days_on_market).toBe(0);
  });

  it("a participant-only interval is not counted into cumulative at close", () => {
    const result = computeDomTransition(
      {
        status: "Active",
        participant_only: true, // UCBA carve-out — never accruing
        status_changed_at: daysAgo(30),
        first_active_date: daysAgo(30),
        days_on_market: 4, // only the pre-participant-only exposure
      },
      "Closed"
    );
    expect(result.days_on_market).toBe(0);
    expect(result.cumulative_days_on_market).toBe(4); // NOT 34
  });
});

describe("the 30-day Withdrawn/Cancelled reset boundary is unchanged", () => {
  it.each(["Withdrawn", "Cancelled"])(
    "%s for 29 days → Active: DOM resumes, no reset",
    (offStatus) => {
      const result = computeDomTransition(
        {
          status: offStatus,
          participant_only: false,
          status_changed_at: daysAgo(29),
          first_active_date: daysAgo(60),
          days_on_market: 18,
        },
        "Active"
      );
      expect(result.days_on_market).toBe(18);
    }
  );

  it.each(["Withdrawn", "Cancelled"])(
    "%s for 30 days → Active: DOM resets to 0",
    (offStatus) => {
      const result = computeDomTransition(
        {
          status: offStatus,
          participant_only: false,
          status_changed_at: daysAgo(30),
          first_active_date: daysAgo(60),
          days_on_market: 18,
        },
        "Active"
      );
      expect(result.days_on_market).toBe(0);
    }
  );
});
