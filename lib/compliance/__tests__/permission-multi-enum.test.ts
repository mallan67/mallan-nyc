/**
 * `Property.Permission` IS A MULTI-ENUM. Gates must read it as one.
 *
 * Live-verified 2026-08-20: the field is typed
 * `Cotality.DataStandard.RESO.DD.Enums.Multi.ListingPermission`, and the feed
 * really does deliver multi-token values — `IDX,SyndicateOptOut` appears in a
 * 12,000-row live sample across all statuses.
 *
 * The gate previously read the field with `typeof v === "string" ? v : ""` and
 * compared it using `===`. That is a FAIL-OPEN on a display gate: a listing
 * carrying `"IDX,Private"` is not `=== "Private"`, so Gate 2 (participant-only)
 * would have passed it through. No live row currently carries `Private`, so
 * nothing was mis-gated in production — but the shape that breaks it is proven
 * to occur, so this is a latent hole rather than a hypothetical one.
 */
import { isParticipantOnly, isOwnerOptOut } from "../gates";

describe("Permission is read as a multi-enum, not a scalar string", () => {
  it("gates a listing whose Permission LIST contains Private", () => {
    // The exact shape that used to slip through.
    expect(isParticipantOnly({ Permission: "IDX,Private" })).toBe(true);
    expect(isParticipantOnly({ Permission: "Private,IDX" })).toBe(true);
    expect(isParticipantOnly({ Permission: "IDX, Private" })).toBe(true);
  });

  it("gates when the provider delivers an ARRAY", () => {
    // A non-string previously read as "" — silently ungated.
    expect(isParticipantOnly({ Permission: ["IDX", "Private"] })).toBe(true);
  });

  it("still gates a lone Private", () => {
    expect(isParticipantOnly({ Permission: "Private" })).toBe(true);
  });

  it("does NOT gate the ordinary live value", () => {
    // 11,999 of 12,000 sampled live rows are exactly this.
    expect(isParticipantOnly({ Permission: "IDX" })).toBe(false);
  });

  it("does not gate a real multi-token value that lacks Private", () => {
    // `IDX,SyndicateOptOut` is a REAL live value — it must not over-gate.
    expect(isParticipantOnly({ Permission: "IDX,SyndicateOptOut" })).toBe(false);
  });

  it("tolerates the casing duplicates present in the live enum", () => {
    // Live members include BOTH `Idx`/`IDX` and `Vow`/`VOW`.
    expect(isParticipantOnly({ Permission: "Idx,private" })).toBe(true);
  });

  it("treats a missing Permission as not-participant-only, never as a crash", () => {
    expect(isParticipantOnly({})).toBe(false);
    expect(isParticipantOnly({ Permission: null })).toBe(false);
  });

  it("keeps OwnerOptOut as a FAIL-CLOSED guard though it is not a live member", () => {
    // Not among the 20 live Permission members, so it cannot fire from provider
    // data today. Gate 1 is compliance-critical; the sentinel stays until a live
    // field/value is confirmed rather than being dropped on field-truth alone.
    expect(isOwnerOptOut({ Permission: "OwnerOptOut" })).toBe(true);
    expect(isOwnerOptOut({ Permission: "IDX,OwnerOptOut" })).toBe(true);
    expect(isOwnerOptOut({ owner_opt_out: true })).toBe(true);
    expect(isOwnerOptOut({ Permission: "IDX" })).toBe(false);
  });
});
