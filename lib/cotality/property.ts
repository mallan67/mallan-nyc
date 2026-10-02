/**
 * Cotality Property resource — raw field accessors.
 *
 * This is the Cotality Property raw-contract boundary: it reads exactly what the live
 * Property resource sends, with zero business, compliance, or display logic. The three
 * provider-derived mappers (lib/idx/trestle-mapper.ts, lib/idx/mapping.ts,
 * lib/search/crm-idx-mapper.ts) are legacy components being converged onto this boundary,
 * not extended further — new raw-field accessors belong here, not inside any of them.
 * Downstream Mallan canonical storage and Mallan/REBNY business-rule normalization (e.g.
 * lib/compliance/status.ts, which uses its own Mallan-side vocabulary and must stay a
 * separate, later layer) never happen in this module.
 */

/**
 * The live Property.StandardStatus value, exactly as Cotality sent it — trimmed, never
 * substituted with MlsStatus, never defaulted to a fabricated value. Returns null when the
 * field is absent or empty; callers decide how to fail closed (reject the row, display an
 * UNKNOWN/suppressed state, etc.) — this function never invents a status.
 *
 * StandardStatus (11 live values: Active, ActiveUnderContract, Canceled, Closed,
 * ComingSoon, Delete, Expired, Hold, Incomplete, Pending, Withdrawn) and MlsStatus (26 live
 * values — a materially different vocabulary; e.g. MlsStatus has no Incomplete member at
 * all) are independent RESO enums, both confirmed live via trestle_get_picklist. Master
 * Plan §0.6: "StandardStatus and MlsStatus exposed separate picklists and behaved as
 * separate fields. Neither is derived from the other... Never substitute one for the
 * other." Live $metadata declares StandardStatus nullable; the field has zero null rows in
 * current live population, but that population fact does not authorize treating a future
 * missing value as "Active" — Active is itself a specific provider-asserted business state
 * (on market, no accepted offer), not a safe default for "unknown."
 */
export function readCotalityStandardStatus(raw: Record<string, unknown>): string | null {
  const value = raw.StandardStatus;
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}
