/**
 * Ask Cotality, live, for the records of the RLS IDs that Mallan listings are linked to (one request for up to 20 of them).
 *
 * The RLS ID is the record's `ListingId` (RLS20123633), never the `ListingKey`. A record is handed back only when it is the listing's own: exactly one record answers to the id, and its
 * listing office is Mallan's (MALLAN_LIST_OFFICE_MLS_IDS, never a company-name string). Anything else is refused with its reason, so a stray id can never move another office's facts into a
 * Mallan listing. Read-only toward Cotality.
 */
import { getAccessToken } from '@/lib/idx/auth';
import { sanitizeOData } from '@/lib/sanitize';
import { FOLLOW_SELECT } from '@/lib/listings/rls-followed-facts';
import { MALLAN_LIST_OFFICE_MLS_IDS } from '@/lib/listings/mallan-source-identity';

const COTALITY_URL = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';
const RLS_ID = /^RLS\d{6,12}$/;
const CHUNK = 20;

export type RlsFetchResult =
  | { ok: true; records: Map<string, Record<string, unknown>>; refused: Array<{ rls: string; reason: string }> }
  | { ok: false; error: string };

export async function fetchRlsRecords(rlsIds: string[]): Promise<RlsFetchResult> {
  const ids = [...new Set(rlsIds.map((i) => String(i).trim().toUpperCase()))];
  const records = new Map<string, Record<string, unknown>>();
  const refused: Array<{ rls: string; reason: string }> = [];
  const valid = ids.filter((id) => RLS_ID.test(id));
  for (const id of ids) if (!RLS_ID.test(id)) refused.push({ rls: id, reason: 'not an RLS ID' });
  if (!valid.length) return { ok: true, records, refused };

  let token: string;
  try { token = await getAccessToken(); } catch (err) { return { ok: false, error: `Cotality sign-in failed: ${err instanceof Error ? err.message : String(err)}` }; }

  for (let i = 0; i < valid.length; i += CHUNK) {
    const chunk = valid.slice(i, i + CHUNK);
    const params = new URLSearchParams({
      $filter: chunk.map((id) => `ListingId eq '${sanitizeOData(id)}'`).join(' or '),
      $select: FOLLOW_SELECT.join(','),
      $top: String(chunk.length * 2),                       // two per id: a duplicate is seen, and refused
    });
    let rows: Array<Record<string, unknown>>;
    try {
      const res = await fetch(`${COTALITY_URL}/odata/Property?${params}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, cache: 'no-store' });
      if (!res.ok) return { ok: false, error: `Cotality answered HTTP ${res.status}` };
      rows = ((await res.json()).value ?? []) as Array<Record<string, unknown>>;
    } catch (err) {
      return { ok: false, error: `Cotality could not be reached: ${err instanceof Error ? err.message : String(err)}` };
    }
    for (const id of chunk) {
      const mine = rows.filter((r) => String(r.ListingId ?? '').toUpperCase() === id);
      if (!mine.length) { refused.push({ rls: id, reason: 'Cotality has no listing with this RLS ID' }); continue; }
      if (mine.length > 1) { refused.push({ rls: id, reason: 'more than one Cotality record answers to this RLS ID' }); continue; }
      const office = String(mine[0].ListOfficeMlsId ?? '').trim();
      if (!(MALLAN_LIST_OFFICE_MLS_IDS as readonly string[]).includes(office)) { refused.push({ rls: id, reason: `the record is not a Mallan listing (office ${office || 'unknown'})` }); continue; }
      records.set(id, mine[0]);
    }
  }
  return { ok: true, records, refused };
}
