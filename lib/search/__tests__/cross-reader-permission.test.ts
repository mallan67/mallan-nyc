/**
 * CROSS-READER CONTRACT — one Cotality field, one interpretation.
 *
 * The recurring failure in this codebase is not a wrong mapping; it is a mapping
 * fixed in ONE place while another reader or writer keeps the old answer. This
 * suite asserts agreement BETWEEN layers rather than correctness within one.
 *
 * `Property.Permission` is live-typed
 * `Cotality.DataStandard.Cotality.DD.Enums.Multi.ListingPermission` — a MULTI-enum.
 * The feed delivers multi-token values (`IDX,SyndicateOptOut` occurs live).
 *
 * TWO INTERPRETATIONS EXISTED AT 438b9993:
 *   lib/compliance/gates.ts          tokenized (corrected)
 *   lib/idx/trestle-mapper.ts        `permissions === 'Private'` (scalar)
 *
 * The mapper is documented as "THE single owner of Permission interpretation"
 * and feeds the PERSISTED `participant_only` / `owner_opt_out` columns, and
 * therefore `idx_display_yn`. So the public gate and the ingest writer could
 * answer the same live value differently — the reader would gate a
 * `"IDX,Private"` listing while the writer persisted it as displayable.
 *
 * EVIDENCE SCOPE, stated honestly: `Private` was observed in ZERO of 12,000
 * live rows sampled across all statuses. That proves NONE OBSERVED IN THE
 * SAMPLE — it does not prove no such listing exists in the 591,203-row corpus,
 * and this suite must not be read as claiming it does.
 */
import { isParticipantOnly, isOwnerOptOut } from "@/lib/compliance/gates";
import { derivePermissionGates } from "@/lib/idx/trestle-mapper";

/** Values the live multi-enum can produce. */
const CASES: Array<{ raw: unknown; participantOnly: boolean; why: string }> = [
  { raw: "Private", participantOnly: true, why: "lone token" },
  { raw: "IDX,Private", participantOnly: true, why: "multi-token — the shape that slipped the scalar check" },
  { raw: "Private,IDX", participantOnly: true, why: "order must not matter" },
  { raw: "IDX, Private", participantOnly: true, why: "provider whitespace must not matter" },
  { raw: ["IDX", "Private"], participantOnly: true, why: "array payload" },
  { raw: "IDX", participantOnly: false, why: "11,999 of 12,000 sampled live rows" },
  { raw: "IDX,SyndicateOptOut", participantOnly: false, why: "REAL live multi-token value; must not over-gate" },
  { raw: null, participantOnly: false, why: "nullable field" },
];

describe("Permission has ONE interpretation across reader and writer", () => {
  it.each(CASES)("participant-only agrees for $raw ($why)", ({ raw, participantOnly }) => {
    const readerSays = isParticipantOnly({ Permission: raw });
    const writerSays = derivePermissionGates({ Permission: raw }).participantOnly;

    // Both must be correct...
    expect(readerSays).toBe(participantOnly);
    expect(writerSays).toBe(participantOnly);
    // ...and, more importantly, they must AGREE. A disagreement means the
    // persisted gate columns and the runtime gate describe different listings.
    expect(writerSays).toBe(readerSays);
  });

  it("owner-opt-out agrees across reader and writer", () => {
    // Retained as a FAIL-CLOSED guard: `OwnerOptOut` is not among the 20 live
    // Permission members, so it cannot fire from provider data — but dropping a
    // Gate 1 sentinel on field-truth alone trades a dead branch for a possible
    // disclosure.
    for (const raw of ["OwnerOptOut", "IDX,OwnerOptOut", "IDX", null]) {
      const readerSays = isOwnerOptOut({ Permission: raw });
      const writerSays = derivePermissionGates({ Permission: raw }).ownerOptOut;
      expect(writerSays).toBe(readerSays);
    }
  });

  it("neither layer treats a non-string payload as absent", () => {
    // The old writer read `typeof raw.Permission === 'string' ? ... : ''`, so an
    // ARRAY became "" and was silently ungated.
    expect(derivePermissionGates({ Permission: ["Private"] }).participantOnly).toBe(true);
  });
});
