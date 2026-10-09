/**
 * The Fair Housing scan every listing WRITE runs: POST /api/crm/listings (create) and PATCH /api/crm/listings/[id] (edit).
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
 *     note, caption). The forms post their free-text boxes under the id of the control (`saleBrokerComments`, `saleWebHeadline`, ...),
 *     which normalizePayload does not canonicalize but which persists verbatim in raw_data. The key is matched by NAME, so structured
 *     values (property_sub_type, status, ...) are not scanned and a legitimate "Active Adult" property type does not false-positive
 *     (Codex #460).
 * A blocker for such a box is reported under `raw:<key>`; js/forms/server-refusal.js turns that into the box and the phrase found.
 */
import { normalizePayload } from "@/lib/compliance/normalizer";
import { scanRecordForFairHousing, type EnforcementIssue } from "@/lib/compliance/rls-enforcement";

const FREE_TEXT_KEY = /(remark|description|instruction|headline|comment|note|caption)/i;

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
    if (typeof value === "string" && FREE_TEXT_KEY.test(key)) {
      record[`raw:${key}`] = value;
    }
  }
  return scanRecordForFairHousing(record);
}
