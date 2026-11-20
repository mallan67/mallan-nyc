// AttendanceType for the listings of one sync batch, read from Cotality's CustomProperty resource.
//
// Live Cotality (2026-11-20): AttendanceType (who staffs the door: DoorpersonFullTime / PartTime / Yes, VideoDoorperson*, Concierge*, LobbyAttendant*, ElevatorAttendance*, None)
// is a KEY INSIDE CustomProperty.CustomFields (a JSON text), not a Property field: `$select=AttendanceType` answers HTTP 400, and a Property page never carries it. The
// listing sync reads Property fields only, so no stored listing carried it and the public search could not use it. This joins it in, by ListingKey, in a separate request
// (CustomProperty pages 1,000 rows on its own and 200 with the $expand, measured by Agent Search 2026-10-26).
//
// THE RULE: a FAILED lookup is "unknown", never "absent". `withAttendanceType` keeps what is stored for an unknown listing, so a Cotality error or timeout can never erase a
// stored value. Only a lookup that SUCCEEDED, returned the listing's CustomProperty row, and found no AttendanceType in it clears the value. A listing with no CustomProperty row at
// all is unknown too (live 2026-11-20: all 1,097 sampled listings had one, so a missing row is an anomaly and must not clear data), and so is a value that is not text.
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
// Cotality refuses a request line above about 8 KB with HTTP 414 (live 2026-11-20: 420 ten-digit keys, 8,130 characters, answered 200; 440 keys, 8,510 characters, 414). The budget is
// measured the way fetch.ts builds the request (URLSearchParams escapes the quotes and parentheses that encodeURIComponent leaves), and kept at 6,000 for a wide margin.
const URL_BUDGET = 6000;
const TIMEOUT_MS = 20_000;
// Total time the lookup may spend on one batch. A slow or failing Cotality (20 s per attempt, retried) could otherwise use the whole run of the sync; past the budget the
// remaining listings are unknown, which keeps what is stored.
const BUDGET_MS = 30_000;

const quoteKey = (k: string) => `'${k.replace(/'/g, "''")}'`;
const encodedLength = (keys: string[]) => new URLSearchParams({ $filter: `ListingKey in (${keys.map(quoteKey).join(',')})`, $select: SELECT.join(',') }).toString().length;

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
  let text: string;
  if (typeof value === 'string') text = value;
  else if (Array.isArray(value) && value.every((m) => typeof m === 'string')) text = value.join(',');
  else return undefined; // an object, a boolean, a number: never stored as "[object Object]" or "true"
  const list = text.split(',').map((m) => m.trim()).filter(Boolean).join(',');
  return list || null;
}

/** fetchFromTrestle throws "... Trestle API error (414)": a 4xx (too long, rate limited, refused) will not succeed on an immediate second try. */
const retryable = (error: unknown): boolean => {
  const status = Number(/\((\d{3})\)/.exec(error instanceof Error ? error.message : '')?.[1]);
  return !(status >= 400 && status < 500);
};

/** AttendanceType for these listings. Never throws: a failure is recorded as unknown for the listings it covered. */
export async function fetchAttendanceTypes(
  listingKeys: Iterable<string>,
  fetcher: Fetcher = fetchFromTrestle,
  options: { budgetMs?: number; now?: () => number } = {},
): Promise<AttendanceJoin> {
  const keys = [...new Set([...listingKeys].map((k) => String(k ?? '').trim()).filter(Boolean))];
  const join: AttendanceJoin = { byKey: new Map(), unknown: new Set(), requests: 0 };
  const budgetMs = options.budgetMs ?? BUDGET_MS;
  const now = options.now ?? Date.now;
  const startedAt = now();

  for (const chunk of chunkKeys(keys)) {
    let records: Record<string, unknown>[] | null = null;
    for (let attempt = 0; attempt < 2 && records === null; attempt++) {
      if (now() - startedAt > budgetMs) break; // out of time: unknown, no further request
      join.requests++;
      try {
        const result = await fetcher({
          resource: 'CustomProperty',
          filter: `ListingKey in (${chunk.map(quoteKey).join(',')})`,
          select: [...SELECT],
          orderby: 'ListingKey',
          top: Math.min(1000, chunk.length),
          maxTotal: chunk.length,
          timeoutMs: Math.max(1_000, Math.min(TIMEOUT_MS, budgetMs - (now() - startedAt))),
        });
        records = result.records;
      } catch (error) {
        records = null;
        if (!retryable(error)) break; // a refused request is unknown at once; a 5xx or a timeout gets one more try
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
    // The request succeeded but no CustomProperty row came back for this key: unknown (every live listing has one, so this is an anomaly: keep what is stored).
    for (const key of chunk) if (!seen.has(key)) join.unknown.add(key);
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
