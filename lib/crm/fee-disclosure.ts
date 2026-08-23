// FARE Act (NYC LL 119/2024) rental fee-disclosure gate.
//
// REBNY/Trestle notice: rental fees must be clearly disclosed wherever rental
// listing details are displayed. This is the pure, side-effect-free rule used by
// the backend publish paths (status route + edit-save PATCH). The CALLER decides
// WHEN to apply it — only when a rental listing becomes display-ready (publish /
// non-Draft). Draft saves are never gated.
//
// Rule:
//   - Trigger (a fee is indicated): AdditionalFeeYN === true, OR AdditionalFee > 0.
//   - Require at least one CLEAR fee detail: MoveInCostsAmount > 0, OR
//     MoveInCostsComments (text), OR AdditionalFee > 0, OR AdditionalFeeDescription
//     (text). Legacy CustomProperty fields (AdditionalFee*) count.
//   - No fee indicated ⇒ ok (no false block).
//   - A canonical MoveInCostsAmount of 0 alone is NOT a "detail" — a flagged
//     listing with a zero amount and no text/description is under-disclosed.

import { normalizeStandardStatus } from "@/lib/idx/trestle-mapper";

export interface FeeDisclosureResult {
  ok: boolean;
  reason?: string;
}

/**
 * Display-ready = the listing is (or is becoming) publicly displayed: Active or
 * ComingSoon. Draft / Incomplete / terminal / withdrawn are NOT display-ready.
 *
 * The CRM rental form maps its "Draft" UI to Cotality MlsStatus "Incomplete" on save,
 * so a draft save must be treated as non-display-ready — otherwise the FARE gate
 * would 422 a normal draft save (Codex #348). Input is normalized first so
 * "incomplete"/"Active"/etc. fold to canonical form.
 */
export function isDisplayReadyStatus(status: unknown): boolean {
  const raw = String(status ?? "").trim();
  // Empty/unknown is fail-safe NON-display-ready: never gate on a missing status.
  // (normalizeStandardStatus defaults '' → 'Active' for display-gate math; that
  // default must NOT make the FARE gate fire on an empty status.)
  if (!raw) return false;
  const s = normalizeStandardStatus(raw);
  return s === "Active" || s === "ComingSoon";
}

function blankText(v: unknown): boolean {
  return v == null || String(v).trim() === "";
}

function positiveAmount(v: unknown): boolean {
  if (v == null || v === "") return false;
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}

/**
 * Evaluate FARE Act fee disclosure for a rental listing's data (raw_data /
 * merged form payload — PascalCase Trestle field names). Returns ok:false with a
 * human-readable reason when a fee is flagged but no clear detail is present.
 */
export function checkFeeDisclosure(
  data: Record<string, unknown> | null | undefined,
): FeeDisclosureResult {
  const d = data || {};

  const feeIndicated =
    d.AdditionalFeeYN === true ||
    d.AdditionalFeeYN === "true" ||
    positiveAmount(d.AdditionalFee);

  if (!feeIndicated) return { ok: true };

  const hasClearDetail =
    positiveAmount(d.MoveInCostsAmount) ||
    !blankText(d.MoveInCostsComments) ||
    positiveAmount(d.AdditionalFee) ||
    !blankText(d.AdditionalFeeDescription);

  if (hasClearDetail) return { ok: true };

  return {
    ok: false,
    reason:
      "FARE Act (NYC LL 119/2024): this rental indicates fees (AdditionalFeeYN) but " +
      "has no fee detail. Provide MoveInCostsAmount, MoveInCostsComments, or a fee " +
      "description before publishing.",
  };
}
