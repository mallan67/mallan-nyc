/**
 * Behavioral tests for the ethics-training RECORD classifier used by the
 * read-only broker report (UCBA Art. III §6). A record is "current" ONLY when
 * completion AND expiry are both present and the expiry is not past. This is
 * administrative record-keeping — no auth, no throwing.
 */
import {
  classifyEthicsTraining,
  ethicsFollowUpReason,
} from "@/lib/compliance/ethics-training-status";

const NOW = new Date("2026-07-21T00:00:00.000Z");
const future = new Date("2026-12-31T00:00:00.000Z");
const past = new Date("2026-01-01T00:00:00.000Z");

describe("classifyEthicsTraining", () => {
  it("completion present + future expiry → current", () => {
    expect(classifyEthicsTraining({ completedAt: past, expiresAt: future }, NOW)).toBe("current");
    expect(ethicsFollowUpReason({ completedAt: past, expiresAt: future }, NOW)).toBeNull();
  });

  it("completion MISSING + future expiry → follow_up (incomplete, e.g. placeholder expiry)", () => {
    expect(classifyEthicsTraining({ completedAt: null, expiresAt: future }, NOW)).toBe("follow_up");
    expect(ethicsFollowUpReason({ completedAt: null, expiresAt: future }, NOW)).toBe("missing_completion");
  });

  it("completion present + expiry MISSING → follow_up", () => {
    expect(classifyEthicsTraining({ completedAt: past, expiresAt: null }, NOW)).toBe("follow_up");
    expect(ethicsFollowUpReason({ completedAt: past, expiresAt: null }, NOW)).toBe("missing_expiry");
  });

  it("expired (completion present, expiry in the past) → follow_up", () => {
    expect(classifyEthicsTraining({ completedAt: past, expiresAt: past }, NOW)).toBe("follow_up");
    expect(ethicsFollowUpReason({ completedAt: past, expiresAt: past }, NOW)).toBe("expired");
  });

  it("both missing → follow_up (missing_completion takes precedence)", () => {
    expect(classifyEthicsTraining({ completedAt: null, expiresAt: null }, NOW)).toBe("follow_up");
    expect(ethicsFollowUpReason({ completedAt: null, expiresAt: null }, NOW)).toBe("missing_completion");
  });

  it("expiry exactly now → current (not past)", () => {
    expect(classifyEthicsTraining({ completedAt: past, expiresAt: NOW }, NOW)).toBe("current");
  });
});
