/**
 * WHEN THE PUBLIC RENTAL PAGE MAY SAY "WE DO NOT REPRESENT THE OWNER".
 *
 * Maya, 2026-11-21: the rental fee disclosure on the public listing page tells a prospective tenant
 * to ask the listing agent for the actual final fees, and says Mallan does not represent the owner
 * but can act as the tenant's agent, for a fee (organizing showings, doing the search, negotiating
 * for the tenant).
 *
 * That second statement is true only when Mallan is NOT a listing broker. On a Mallan-authored
 * listing (`SL-` / `RL-`, `_source === 'exclusive'`) Mallan IS the owner's broker, and on a
 * co-listed one Mallan is a listing broker too; saying otherwise would be a false advertising claim
 * (19 NYCRR 175.25). So the statement is shown only for a stored Cotality listing (`db+idx`) whose
 * listing office is positively identified and is neither Mallan's REBNY office id (list office OR
 * co-list office) nor named Mallan. Everything else (exclusive, manual, missing, unknown source;
 * a listing whose office cannot be identified) leaves it out.
 *
 * `_source` is 'db+idx' for a stored third-party row and 'exclusive' for a Mallan-authored one
 * (`buildSourceAndCompliance` in lib/idx/db-to-public-dto.ts). The listing page reads the database
 * only, so no live-read value ('idx') reaches it; it is not accepted here.
 *
 * Found by the 2026-11-21 compliance gate: live Cotality has rentals with CoListOfficeMlsId '7041'
 * (Mallan) and another office as list office, so the list-office check alone is not enough.
 */
import { MALLAN_LIST_OFFICE_MLS_IDS } from './mallan-source-identity';

export interface TenantAgentNoticeInput {
  /** `PublicListingDTO._source`. */
  source: string | null | undefined;
  /** Typed `list_office_mls_id` column (the public DTO strips it, so it comes from the database row). */
  listOfficeMlsId?: string | null;
  /** Typed `co_list_office_mls_id` column. */
  coListOfficeMlsId?: string | null;
  /** Typed `list_office_name` column. */
  listOfficeName?: string | null;
}

export function showsTenantAgentNotice(input: TenantAgentNoticeInput): boolean {
  if (input.source !== 'db+idx') return false;

  const listOfficeId = (input.listOfficeMlsId ?? '').trim();
  const coListOfficeId = (input.coListOfficeMlsId ?? '').trim();
  const listOfficeName = (input.listOfficeName ?? '').trim();

  const mallanOfficeIds: readonly string[] = MALLAN_LIST_OFFICE_MLS_IDS;
  if (mallanOfficeIds.includes(listOfficeId) || mallanOfficeIds.includes(coListOfficeId)) return false;
  if (/mallan/i.test(listOfficeName)) return false;

  // The listing broker cannot be identified at all: do not assert that Mallan is not it.
  if (!listOfficeId && !listOfficeName) return false;

  return true;
}
