// AttendanceType for the listings of one sync batch, read from Cotality's CustomProperty resource.
//
// Live Cotality (2026-11-20): AttendanceType (who staffs the door: DoorpersonFullTime / PartTime / Yes, VideoDoorperson*, Concierge*, LobbyAttendant*, ElevatorAttendance*, None)
// is a KEY INSIDE CustomProperty.CustomFields (a JSON text), not a Property field: `$select=AttendanceType` answers HTTP 400, and a Property page never carries it. The
// listing sync reads Property fields only, so no stored listing carried it and the public search could not use it. This joins it in, by ListingKey, in a separate request
// (CustomProperty pages 1,000 rows on its own and 200 with the $expand, measured by Agent Search 2026-10-26).
//
// THE RULE: a FAILED lookup is "unknown", never "absent". `withAttendanceType` keeps what is stored for an unknown listing, so a Cotality error or timeout can never erase a
// stored value. Only a lookup that SUCCEEDED and found nothing clears it.
import { fetchFromTrestle } from '@/lib/idx/fetch';

export interface AttendanceJoin {
  /** ListingKey -> the comma list Cotality carries, or null when Cotality carries none (the lookup succeeded). */
  byKey: Map<string, string | null>;
  /** ListingKeys whose lookup failed or could not be read: unknown. */
  unknown: Set<string>;
  /** Requests made, retries included. */
  requests: number;
}

type Fetcher = typeof fetchFromTrestle;

const SELECT = ['ListingKey', 'CustomFields'] as const;
// Cotality answers HTTP 414 between 6 KB and 9 KB of URL-encoded $filter (400 ListingKeys in one `in` list pass, 600 fail: live 2026-10-24).
const URL_BUDGET = 6000;
const TIMEOUT_MS = 20_000;

const quoteKey = (k: string) => `'${k.replace(/'/g, "''")}'`;
const encodedLength = (keys: string[]) => encodeURIComponent(`ListingKey in (${keys.map(quoteKey).join(',')})`).length + encodeURIComponent(SELECT.join(',')).length;

/** Splits keys into requests that stay under the URL budget. */
export function chunkKeys(keys: string[]): string[][] {
  const chunks: string[][] = [];
  let chunk: string[] = [];
  for (const key of keys) {
    if (chunk.length && encodedLength([...chunk, key]) > URL_BUDGET) {
      chunks.push(chunk);
      chunk = [];
    }
    chunk.push(key);
  }
  if (chunk.length) chunks.push(chunk);
  return chunks;
}

/**
 * The AttendanceType a CustomFields value carries: the comma list, null when Cotality carries none, undefined when the value cannot be read (unknown).
 * The members are kept as delivered (no spelling is translated or invented).
 */
export function readAttendanceType(customFields: unknown): string | null | undefined {
  if (customFields === null || customFields === undefined || customFields === '') return null;
  let parsed: unknown = customFields;
  if (typeof customFields === 'string') {
    try {
      parsed = JSON.parse(customFields);
    } catch {
      return undefined;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  const value = (parsed as Record<string, unknown>).AttendanceType;
  if (value === undefined || value === null) return null;
  const text = Array.isArray(value) ? value.map(String).join(',') : String(value);
  const list = text.split(',').map((m) => m.trim()).filter(Boolean).join(',');
  return list || null;
}

/** AttendanceType for these listings. Never throws: a failure is recorded as unknown for the listings it covered. */
export async function fetchAttendanceTypes(listingKeys: Iterable<string>, fetcher: Fetcher = fetchFromTrestle): Promise<AttendanceJoin> {
  const keys = [...new Set([...listingKeys].map((k) => String(k ?? '').trim()).filter(Boolean))];
  const join: AttendanceJoin = { byKey: new Map(), unknown: new Set(), requests: 0 };

  for (const chunk of chunkKeys(keys)) {
    let records: Record<string, unknown>[] | null = null;
    for (let attempt = 0; attempt < 2 && records === null; attempt++) {
      join.requests++;
      try {
        const result = await fetcher({
          resource: 'CustomProperty',
          filter: `ListingKey in (${chunk.map(quoteKey).join(',')})`,
          select: [...SELECT],
          orderby: 'ListingKey',
          top: Math.min(1000, chunk.length),
          maxTotal: chunk.length,
          timeoutMs: TIMEOUT_MS,
        });
        records = result.records;
      } catch {
        records = null; // one retry, then unknown
      }
    }
    if (records === null) {
      for (const key of chunk) join.unknown.add(key);
      continue;
    }
    const seen = new Set<string>();
    for (const row of records) {
      const key = String(row.ListingKey ?? '');
      if (!key) continue;
      seen.add(key);
      const value = readAttendanceType(row.CustomFields);
      if (value === undefined) join.unknown.add(key);
      else join.byKey.set(key, value);
    }
    // The request succeeded and no CustomProperty row came back for this key: Cotality carries none.
    for (const key of chunk) if (!seen.has(key)) join.byKey.set(key, null);
  }
  return join;
}

function storedAttendanceType(existingFeatures: unknown): string | undefined {
  if (!existingFeatures || typeof existingFeatures !== 'object' || Array.isArray(existingFeatures)) return undefined;
  const value = (existingFeatures as Record<string, unknown>).AttendanceType;
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/**
 * For a writer that rebuilds a listing's features from Cotality WITHOUT a lookup (the agent-history sync, the recovery script): keep whatever AttendanceType is stored, so
 * rewriting the features never erases it. Makes no request. Returns a new object.
 */
export function keepStoredAttendanceType(features: Record<string, unknown>, existingFeatures: unknown): Record<string, unknown> {
  const next = { ...features };
  delete next.AttendanceType;
  const prior = storedAttendanceType(existingFeatures);
  if (prior) next.AttendanceType = prior;
  return next;
}

/**
 * The listing's features with AttendanceType from the join: the value Cotality carries; removed when a successful lookup found none; and, when the lookup did not answer for this
 * listing (unknown, or never covered), whatever is stored, so a failed request never erases data. Returns a new object.
 */
export function withAttendanceType(
  features: Record<string, unknown>,
  listingKey: string,
  join: AttendanceJoin,
  existingFeatures: unknown,
): Record<string, unknown> {
  const next = { ...features };
  delete next.AttendanceType; // never trust a copy that arrived with the mapped record
  if (join.byKey.has(listingKey)) {
    const value = join.byKey.get(listingKey);
    if (value) next.AttendanceType = value;
    return next;
  }
  const prior = storedAttendanceType(existingFeatures);
  if (prior) next.AttendanceType = prior;
  return next;
}
