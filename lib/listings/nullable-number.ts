/**
 * One reading of a number the CRM sends for a nullable column (bedrooms, baths, living area), used by the create AND the edit route.
 *
 *   null, "" or only spaces  -> no number: the column is NULL ("not entered")
 *   0 or "0"                 -> zero, kept (a studio has 0 bedrooms)
 *   3, "3", "1234.5"         -> that number
 *   text, NaN, Infinity, a boolean, a list or an object -> not a number: `ok` is false and the route refuses the request
 *
 * A caller that was sent nothing at all (the key is absent) does not call this: the column is left alone.
 *
 * Before, the edit route read null and "" as 0 (`Number(null)` is 0) while the create route read 0 as "not entered" (a truthy test): the same box was stored as two different facts
 * depending on whether the listing was being created or edited, and the forms' own rule (a blank box is null, a typed 0 is 0 — crm-form-blank-numbers.test.ts) was undone by the server.
 */
export type NullableNumber = { ok: true; value: number | null } | { ok: false };

export function readNullableNumber(value: unknown): NullableNumber {
  if (value === null) return { ok: true, value: null };
  if (typeof value === 'number') return Number.isFinite(value) ? { ok: true, value } : { ok: false };
  if (typeof value === 'string') {
    const text = value.trim();
    if (text === '') return { ok: true, value: null };
    const n = Number(text);
    return Number.isFinite(n) ? { ok: true, value: n } : { ok: false };
  }
  return { ok: false };
}

/** The four nullable number columns the Sale and Rental forms write: the request's key, and the column it fills. */
export const NULLABLE_NUMBER_COLUMNS = [
  ['BedroomsTotal', 'bedrooms_total'],
  ['BathroomsFull', 'bathrooms_full'],
  ['BathroomsHalf', 'bathrooms_half'],
  ['LivingArea', 'living_area'],
] as const;

export type NullableNumberColumn = (typeof NULLABLE_NUMBER_COLUMNS)[number][1];
