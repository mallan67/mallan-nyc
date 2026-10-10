/**
 * The Fair Housing scan every listing WRITE runs: POST /api/crm/listings (create) and PATCH /api/crm/listings/[id] (edit); the bulk audit (POST /api/crm/compliance/audit) runs it on what is stored.
 *
 * Federal FHA, NY State HRL and NYC HRL Title 8 (with the Fair Chance for Housing Act) apply to ALL advertising, whatever the listing's
 * RLS eligibility or status, so the scan is not part of the RLS gate and is not skipped for a draft, a website-only or a CRM-created
 * listing. It lives here, once, so the two routes cannot drift: before this the create route held the scan inline and the edit route had
 * none, which let a clean listing be edited to say anything (the RLS gate the edit route runs skips every CRM-created listing and every
 * draft, and the validator's verdict there never blocks).
 *
 * What is scanned is the free text the REQUEST carries, before anything is written:
 *   - the canonical remark slots, after normalizePayload has resolved the accepted aliases (`description` -> PublicRemarks,
 *     `privateRemarks` -> PrivateRemarks); scanning the raw keys alone would let an aliased payload through;
 *   - every other string the request carries under a key that names free text (remark, description, instruction, headline, comment,
 *     note, caption), and the five boxes whose ids do not (FREE_TEXT_IDS below). The forms post their free-text boxes under the id of the
 *     control (`saleBrokerComments`, `saleWebHeadline`, ...), which normalizePayload does not canonicalize but which persists verbatim in
 *     raw_data. The key is matched by NAME, so structured values (property_sub_type, status, ...) are not scanned and a legitimate
 *     "Active Adult" property type does not false-positive (Codex #460).
 * A blocker for such a box is reported under `raw:<key>`; js/forms/server-refusal.js turns that into the box and the phrase found.
 *
 * A remark slot that is not text (an array, an object) is refused outright (nonTextRemarkSlot): the scan reads text only, PATCH copies PublicRemarks into the features bucket as it is, and the
 * public listing page calls string methods on it. The same goes for a list or an object under any other key the scan reads as free text (nonTextFreeTextKey): the scan reads strings only, so
 * { webHeadline: ["Adults only"] } or { bldgMinIncome: { note: "no vouchers" } } would be saved unread.
 */
import { normalizePayload } from "@/lib/compliance/normalizer";
import { scanRecordForFairHousing, type EnforcementIssue } from "@/lib/compliance/rls-enforcement";

const FREE_TEXT_KEY = /(remark|description|instruction|headline|comment|note|caption)/i;

/**
 * The free-text boxes of the Add forms whose ids do not say so: the property layout and the financing terms (textareas of the townhouse / house sections), and the two rental-building inputs
 * "Min. income" ("40x monthly rent") and "Max. occupants" ("2 per bedroom"), where a policy such as "no vouchers" or "no children" is typed. They post under their ids and persist in raw_data like the others
 * (found 2026-10-09 by an independent review of the first version of this scan). tests/runtime/crm-fair-housing-free-text-boxes.test.ts holds every textarea of both pages to this list or to the pattern above.
 */
export const FREE_TEXT_IDS: readonly string[] = ["saleTHLayout", "saleTHFinancing", "rentalTHLayout", "bldgMinIncome", "bldgMaxOccupants"];

/** True for a request key the scan reads as free text. */
export function isFreeTextKey(key: string): boolean {
  return FREE_TEXT_KEY.test(key) || FREE_TEXT_IDS.includes(key);
}

const REMARK_SLOTS = ["PublicRemarks", "ShowingInstructions", "PrivateRemarks", "SyndicationRemarks"] as const;

/**
 * The first remark slot the request carries that is not text (a string, null or absent are fine), looking at the canonical slot of the normalized payload and at the same-named key of the body; null when
 * every slot is text.
 */
export function nonTextRemarkSlot(body: Record<string, unknown>, normalized?: Record<string, unknown>): string | null {
  if (!body || typeof body !== "object") return null;
  const canonical = normalized ?? normalizePayload(body).normalized;
  const isText = (v: unknown) => v === undefined || v === null || typeof v === "string";
  for (const slot of REMARK_SLOTS) {
    if (!isText(canonical[slot]) || !isText(body[slot])) return slot;
  }
  return null;
}

/**
 * The first key of the request that the scan reads as free text (isFreeTextKey) and that holds a list or an object; null when there is none. The scan reads strings only, so such a value is saved without a
 * word from the server. A number or a boolean is not wording and passes: the forms post InternetConsumerCommentYN, a checkbox, under a name that says "comment". (The four remark slots also refuse a number
 * or a boolean: nonTextRemarkSlot, above, is their rule.) Found 2026-10-09 by an independent review; neither Add form, nor any other caller of the listing routes, sends a list or an object under such a key.
 */
export function nonTextFreeTextKey(body: Record<string, unknown>): string | null {
  if (!body || typeof body !== "object") return null;
  for (const [key, value] of Object.entries(body)) {
    if (isFreeTextKey(key) && typeof value === "object" && value !== null) return key;
  }
  return null;
}

/**
 * Scan a listing write's free text. `normalized` is the normalizePayload output the caller already holds (the create route builds
 * its row from it); when it is not given the body is normalized here. An empty list means the text is clean.
 */
export function scanListingBodyForFairHousing(
  body: Record<string, unknown>,
  normalized?: Record<string, unknown>,
): EnforcementIssue[] {
  if (!body || typeof body !== "object") return [];
  const canonical = normalized ?? normalizePayload(body).normalized;
  const record: Record<string, string | null | undefined> = {
    PublicRemarks: canonical.PublicRemarks as string | null | undefined,
    ShowingInstructions: canonical.ShowingInstructions as string | null | undefined,
    PrivateRemarks: canonical.PrivateRemarks as string | null | undefined,
    SyndicationRemarks: canonical.SyndicationRemarks as string | null | undefined,
  };
  for (const [key, value] of Object.entries(body)) {
    // a request that posts a canonical slot under its own name (PublicRemarks) is scanned once, as that slot
    if (Object.prototype.hasOwnProperty.call(record, key)) continue;
    if (typeof value === "string" && isFreeTextKey(key)) {
      record[`raw:${key}`] = value;
    }
  }
  return scanRecordForFairHousing(record);
}
